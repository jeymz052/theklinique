import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { RESERVATION_FEE_PHP } from "@/lib/reservation";
import { clinicNow, hourlyTimes, isIsoDate, normalizeTime } from "@/lib/bookingAvailability";
import { notifyAppointmentStatusChanged, notifyBookingCreated } from "@/lib/bookingNotifications";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_HOLD_MINUTES = 15;

const allowedStatuses = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;
type AppointmentStatus = (typeof allowedStatuses)[number];
type AppointmentRecord = {
  id: string;
  reference_no: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  total_amount: number | string;
  notes: string | null;
  visit_kind: "standard" | "consultation_follow_up";
  parent_appointment_id: string | null;
  clients: { full_name: string; email: string | null; phone: string } | { full_name: string; email: string | null; phone: string }[] | null;
  services: { name: string; service_categories: { slug: string } | { slug: string }[] | null } | { name: string; service_categories: { slug: string } | { slug: string }[] | null }[] | null;
  payments: { status: string; amount: number | string; paid_at: string | null }[] | null;
};

function firstRelated<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function getAdminClient() {
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function getRequestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser();
  return error ? null : data.user;
}

type ClinicRole = "superadmin" | "doctor" | "secretary" | "patient";

async function getUserRole(user: NonNullable<Awaited<ReturnType<typeof getRequestUser>>>): Promise<ClinicRole> {
  const claimedRole = String(user.app_metadata?.role || "");
  if (["superadmin", "doctor", "secretary", "patient"].includes(claimedRole)) {
    return claimedRole as ClinicRole;
  }
  const { data } = await getAdminClient().from("profiles").select("role").eq("id", user.id).maybeSingle();
  const profileRole = String(data?.role || "patient");
  return (["superadmin", "doctor", "secretary", "patient"].includes(profileRole) ? profileRole : "patient") as ClinicRole;
}

function isStaffRole(role: ClinicRole) {
  return role === "superadmin" || role === "doctor" || role === "secretary";
}

function toAppointment(record: AppointmentRecord) {
  const client = firstRelated(record.clients);
  const service = firstRelated(record.services);
  const serviceCategory = firstRelated(service?.service_categories || null);
  const reservationPayment = record.payments?.find((payment) => Number(payment.amount) === RESERVATION_FEE_PHP) || record.payments?.[0];
  const normalizedStatus = record.status === ("paid" as AppointmentStatus) ? "confirmed" : record.status;
  return {
    id: record.id,
    referenceNo: record.reference_no,
    patient: client?.full_name || "Unknown patient",
    email: client?.email || "",
    phone: client?.phone || "",
    service: service?.name || "Consultation",
    serviceCategory: serviceCategory?.slug || "",
    visitKind: record.visit_kind || "standard",
    parentAppointmentId: record.parent_appointment_id || null,
    date: record.appointment_date,
    time: record.appointment_time?.slice(0, 5) || "",
    status: normalizedStatus as AppointmentStatus,
    paymentStatus: reservationPayment?.status || null,
    amount: Number(record.total_amount),
    notes: record.notes || "",
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  try {
    const admin = getAdminClient();
    const { error: releaseError } = await admin.rpc("release_expired_appointment_holds");
    if (releaseError) throw releaseError;
    let query = admin
      .from("appointments")
      .select("id, reference_no, appointment_date, appointment_time, status, total_amount, notes, visit_kind, parent_appointment_id, clients(full_name, email, phone), services(name, service_categories(slug)), payments(status, amount, paid_at)")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    const role = await getUserRole(user);
    if (!isStaffRole(role)) {
      const { data: clients, error: clientsError } = await admin
        .from("clients")
        .select("id")
        .eq("email", user.email || "");
      if (clientsError) throw clientsError;
      const clientIds = (clients || []).map((client) => client.id);
      if (!clientIds.length) return NextResponse.json({ appointments: [] });
      query = query.in("client_id", clientIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ appointments: (data || []).map(toAppointment) });
  } catch (error) {
    console.error("Unable to load appointments:", error);
    return NextResponse.json({ error: "Unable to load appointments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user?.email) return NextResponse.json({ error: "Sign in is required to complete a booking." }, { status: 401 });

    const body = await request.json();
    const role = await getUserRole(user);
    const staffBooking = isStaffRole(role);
    let firstName = String(body.firstName || "").trim();
    let lastName = String(body.lastName || "").trim();
    let email = String(staffBooking ? body.email : user.email).trim().toLowerCase();
    let phone = String(body.phone || "").trim();
    const clientId = String(body.clientId || "").trim();
    const serviceSlug = String(body.serviceSlug || "").trim();
    const appointmentDate = String(body.appointmentDate || "");
    const appointmentTime = String(body.appointmentTime || "");
    const notes = String(body.notes || "").trim();
    const dateOfBirth = String(body.dateOfBirth || "");
    const chiefConcern = String(body.chiefConcern || "").trim();
    const intakeConfirmed = body.intakeConfirmed === true;
    const customAnswers=body.customAnswers&&typeof body.customAnswers==="object"&&!Array.isArray(body.customAnswers)?body.customAnswers as Record<string,unknown>:{};
    const bookingType = body.bookingType === "consultation" ? "consultation" : body.bookingType === "treatment" ? "treatment" : null;
    const consentAcknowledged = staffBooking || body.consentAcknowledged === true;
    const productIds = Array.isArray(body.productIds) ? body.productIds.filter((value: unknown): value is string => typeof value === "string") : [];
    const treatmentIds = Array.isArray(body.treatmentIds) ? Array.from(new Set(body.treatmentIds.filter((value: unknown): value is string => typeof value === "string"))) : [];
    const parentAppointmentId = String(body.parentAppointmentId || "").trim() || null;

    if ((!staffBooking && (!firstName || !lastName || !email || !phone)) || (staffBooking && !UUID.test(clientId)) || !serviceSlug || !appointmentDate || !appointmentTime || (!staffBooking && !bookingType) || !consentAcknowledged) {
      return NextResponse.json({ error: "Please complete every required booking field." }, { status: 400 });
    }
    if (!staffBooking && (!isIsoDate(dateOfBirth) || !chiefConcern || !intakeConfirmed)) {
      return NextResponse.json({ error: "Please complete and confirm your patient intake information." }, { status: 400 });
    }
    if (!isIsoDate(appointmentDate) || !/^\d{2}:\d{2}:00$/.test(appointmentTime)) {
      return NextResponse.json({ error: "Please select a valid appointment slot." }, { status: 400 });
    }

    const admin = getAdminClient();
    const { error: releaseError } = await admin.rpc("release_expired_appointment_holds");
    if (releaseError) throw releaseError;
    let existingClient: { id:string; full_name:string; email:string|null; phone:string|null } | null = null;
    if (staffBooking) {
      const { data, error } = await admin.from("clients").select("id, full_name, email, phone").eq("id", clientId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Create or select a patient record before booking an appointment." }, { status: 400 });
      existingClient = data;
      const nameParts = data.full_name.trim().split(/\s+/);
      firstName = nameParts.shift() || data.full_name;
      lastName = nameParts.join(" ") || "Patient";
      email = (data.email || "").toLowerCase();
      phone = data.phone || "";
    }
    const normalizedAppointmentTime = normalizeTime(appointmentTime);
    const dayOfWeek = new Date(`${appointmentDate}T00:00:00Z`).getUTCDay();
    const [{ data: schedule, error: scheduleError }, { data: blockedDate, error: blockedError }, { data: slotAppointments, error: slotError }] = await Promise.all([
      admin.from("availability_schedules").select("open_time, close_time").eq("day_of_week", dayOfWeek).eq("is_active", true).maybeSingle(),
      admin.from("blocked_dates").select("id").eq("blocked_date", appointmentDate).maybeSingle(),
      admin.from("appointments").select("id").eq("appointment_date", appointmentDate).eq("appointment_time", appointmentTime).not("status", "in", '("cancelled","no_show")').limit(1),
    ]);
    if (scheduleError || blockedError || slotError) throw scheduleError || blockedError || slotError;
    const now = clinicNow();
    const validHourlySlot = schedule && hourlyTimes(schedule.open_time, schedule.close_time).includes(normalizedAppointmentTime);
    if (!validHourlySlot) return NextResponse.json({ error: "The clinic is closed during that time." }, { status: 409 });
    if (blockedDate) return NextResponse.json({ error: "The clinic is unavailable on the selected date." }, { status: 409 });
    if (appointmentDate < now.date || (appointmentDate === now.date && normalizedAppointmentTime <= now.time)) {
      return NextResponse.json({ error: "Past appointment times cannot be booked." }, { status: 409 });
    }
    if (slotAppointments?.length) return NextResponse.json({ error: "That time was just booked. Please select another available slot." }, { status: 409 });

    const { data: service, error: serviceError } = await admin
      .from("services")
      .select("id, price, category_id")
      .eq("slug", serviceSlug)
      .eq("is_active", true)
      .single();
    if (serviceError || !service) {
      return NextResponse.json({ error: "That treatment is not currently available." }, { status: 400 });
    }

    const { data: primaryCategory, error: primaryCategoryError } = await admin.from("service_categories").select("slug").eq("id", service.category_id).single();
    if (primaryCategoryError || !primaryCategory) throw primaryCategoryError || new Error("Unable to verify the treatment category.");
    const effectiveBookingType = staffBooking ? (primaryCategory.slug === "consultations" ? "consultation" : "treatment") : bookingType;
    if ((effectiveBookingType === "consultation") !== (primaryCategory.slug === "consultations")) {
      return NextResponse.json({ error: "The selected booking type does not match the primary service." }, { status: 400 });
    }
    if (primaryCategory.slug === "consultations" && (treatmentIds.length || productIds.length)) {
      return NextResponse.json({ error: "Consultation appointments cannot include treatments or package add-ons." }, { status: 400 });
    }
    let customAnswerSnapshot:Record<string,{label:string;answer:string}>={};if(!staffBooking){const{data:customQuestions,error:questionError}=await admin.from("booking_intake_questions").select("id,label,required").is("system_key",null).eq("active",true).in("applies_to",["both",effectiveBookingType]);if(questionError)throw questionError;const missing=(customQuestions||[]).find(item=>item.required&&!String(customAnswers[item.id]||"").trim());if(missing)return NextResponse.json({error:`Please answer: ${missing.label}`},{status:400});customAnswerSnapshot=Object.fromEntries((customQuestions||[]).map(item=>[item.id,{label:item.label,answer:String(customAnswers[item.id]||"").trim()}]).filter(([,value])=>value.answer))}
    const allergies = String(body.allergies || "").trim();
    const currentMedications = String(body.currentMedications || "").trim();
    const medicalHistory = String(body.medicalHistory || "").trim();
    if (!staffBooking && effectiveBookingType === "treatment" && (!allergies || !currentMedications || !medicalHistory)) {
      return NextResponse.json({ error: "Allergies, medications, and relevant medical conditions are required for treatment bookings. Enter None when applicable." }, { status: 400 });
    }
    const isFollowUp = serviceSlug === "follow-up-check-up";
    if (isFollowUp !== Boolean(parentAppointmentId)) {
      return NextResponse.json({ error: isFollowUp ? "Open the follow-up link from your consultation notification." : "The linked follow-up appointment is invalid." }, { status: 400 });
    }
    if (isFollowUp && parentAppointmentId) {
      const { data: parent, error: parentError } = await admin
        .from("appointments")
        .select("id, status, clients!inner(email), services!inner(service_categories!inner(slug))")
        .eq("id", parentAppointmentId)
        .eq("clients.email", email)
        .eq("services.service_categories.slug", "consultations")
        .maybeSingle();
      if (parentError || !parent || parent.status !== "completed") {
        return NextResponse.json({ error: "This follow-up must be linked to your completed consultation." }, { status: 403 });
      }
      const { data: recommendation } = await admin.from("consultation_charts").select("follow_up_required, follow_up_appointment_id").eq("appointment_id", parentAppointmentId).maybeSingle();
      if (!recommendation?.follow_up_required) return NextResponse.json({ error: "No follow-up was recommended for this consultation." }, { status: 409 });
      if (recommendation.follow_up_appointment_id) return NextResponse.json({ error: "A follow-up booking already exists for this consultation." }, { status: 409 });
    }

    const requestedTreatmentIds = treatmentIds.filter((id) => id !== service.id);
    let additionalTreatments: { id: string; name: string; price: number | string; duration_mins: number | null; category_id: string }[] = [];
    if (requestedTreatmentIds.length) {
      const { data, error } = await admin.from("services").select("id, name, price, duration_mins, category_id").in("id", requestedTreatmentIds).eq("is_active", true);
      if (error) throw error;
      additionalTreatments = data || [];
      if (additionalTreatments.length !== requestedTreatmentIds.length) return NextResponse.json({ error: "One or more added treatments are unavailable." }, { status: 400 });
      const categoryIds = Array.from(new Set(additionalTreatments.map((item) => item.category_id)));
      const { data: treatmentCategories, error: treatmentCategoriesError } = await admin.from("service_categories").select("id, slug").in("id", categoryIds);
      if (treatmentCategoriesError) throw treatmentCategoriesError;
      if ((treatmentCategories || []).some((category) => category.slug === "consultations")) return NextResponse.json({ error: "Consultations cannot be added to a treatment cart." }, { status: 400 });
    }
    const treatmentTotal = Number(service.price) + additionalTreatments.reduce((sum, item) => sum + Number(item.price), 0);

    const clientResult = staffBooking && existingClient ? { data: existingClient, error: null } : await admin
      .from("clients")
      .upsert({
        full_name: `${firstName} ${lastName}`,
        email,
        phone,
        ...(!staffBooking ? {
          auth_user_id: user.id,
          date_of_birth: dateOfBirth,
          address: String(body.address || "").trim() || null,
          emergency_contact_name: String(body.emergencyContactName || "").trim() || null,
          emergency_contact_phone: String(body.emergencyContactPhone || "").trim() || null,
          allergies: allergies || null,
          medical_history: medicalHistory || null,
          current_medications: currentMedications || null,
        } : {}),
        updated_at: new Date().toISOString(),
      }, { onConflict: "email" })
      .select("id")
      .single();
    const client = clientResult.data;
    if (clientResult.error || !client) throw clientResult.error || new Error("Unable to save patient details.");

    const { data: referenceNo, error: referenceError } = await admin.rpc("generate_appointment_ref");
    if (referenceError || !referenceNo) throw referenceError || new Error("Unable to generate appointment reference.");

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .insert({
        reference_no: referenceNo,
        client_id: client.id,
        service_id: service.id,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        total_amount: treatmentTotal,
        status: staffBooking ? "confirmed" : "pending",
        payment_expires_at: staffBooking ? null : new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60_000).toISOString(),
        notes: notes || null,
        visit_kind: isFollowUp ? "consultation_follow_up" : "standard",
        parent_appointment_id: parentAppointmentId,
        previsit_consent_acknowledged_at: staffBooking ? null : new Date().toISOString(),
      })
      .select("id, reference_no")
      .single();
    if (appointmentError?.code === "23505") {
      return NextResponse.json({ error: isFollowUp ? "A follow-up appointment already exists for this consultation." : "That time was just reserved by another patient. Please select another available slot." }, { status: 409 });
    }
    if (appointmentError?.code === "23514") {
      return NextResponse.json({ error: "That time is no longer available in the doctor's schedule." }, { status: 409 });
    }
    if (appointmentError || !appointment) throw appointmentError || new Error("Unable to create appointment.");

    if (!staffBooking) {
      const pregnancyStatus = ["not_applicable", "no", "yes", "unsure", "prefer_not_to_say"].includes(String(body.pregnancyStatus)) ? body.pregnancyStatus : null;
      const { error: intakeError } = await admin.from("appointment_intakes").insert({
        appointment_id: appointment.id,
        client_id: client.id,
        booking_type: effectiveBookingType,
        chief_concern: chiefConcern,
        treatment_goals: String(body.treatmentGoals || "").trim() || null,
        allergies_snapshot: allergies || null,
        medications_snapshot: currentMedications || null,
        medical_history_snapshot: medicalHistory || null,
        pregnancy_status: pregnancyStatus,
        previous_reactions: String(body.previousReactions || "").trim() || null,
        recent_procedures: String(body.recentProcedures || "").trim() || null,
        custom_answers:customAnswerSnapshot,
        information_confirmed_at: new Date().toISOString(),
      });
      if (intakeError) {
        await admin.from("appointments").update({ status: "cancelled", cancellation_reason: "Intake record could not be saved" }).eq("id", appointment.id);
        throw intakeError;
      }
    }

    if (additionalTreatments.length) {
      const { error: treatmentInsertError } = await admin.from("appointment_services").insert(additionalTreatments.map((item) => ({ appointment_id: appointment.id, service_id: item.id, price_snapshot: item.price, duration_snapshot: item.duration_mins })));
      if (treatmentInsertError) throw treatmentInsertError;
    }

    if (!staffBooking) {
      const { error: reservationError } = await admin.from("payments").insert({
        appointment_id: appointment.id,
        amount: RESERVATION_FEE_PHP,
        currency: "PHP",
        method: "paymongo_qr_ph",
        status: "awaiting_payment",
        metadata: isFollowUp
          ? { kind: "consultation_follow_up_fee", credited_to_visit: false, full_fee: true }
          : { kind: "reservation_fee", credited_to_visit: true },
      });
      if (reservationError) {
        await admin.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id).eq("status", "pending");
        throw reservationError;
      }
    }

    if (isFollowUp && parentAppointmentId) {
      const { error: linkError } = await admin.from("consultation_charts").update({ follow_up_appointment_id: appointment.id, updated_at: new Date().toISOString() }).eq("appointment_id", parentAppointmentId).is("follow_up_appointment_id", null);
      if (linkError) throw linkError;
    }

    if (productIds.length) {
      const { data: products, error: productsError } = await admin
        .from("products")
        .select("id, price")
        .in("id", productIds)
        .eq("is_active", true);
      if (productsError) throw productsError;
      const totalAmount = (products || []).reduce((sum, product) => sum + Number(product.price), 0);
      if (products?.length) {
        const { data: orderReference, error: orderReferenceError } = await admin.rpc("generate_order_ref");
        if (orderReferenceError || !orderReference) throw orderReferenceError || new Error("Unable to create package order.");
        const { data: order, error: orderError } = await admin
          .from("orders")
          .insert({ reference_no: orderReference, client_id: client.id, status: "pending_payment", total_amount: totalAmount, notes: `Booking ${appointment.reference_no}` })
          .select("id")
          .single();
        if (orderError || !order) throw orderError || new Error("Unable to create package order.");
        const { error: itemsError } = await admin.from("order_items").insert(products.map((product) => ({ order_id: order.id, product_id: product.id, quantity: 1, unit_price: product.price })));
        if (itemsError) throw itemsError;
      }
    }

    try {
      await notifyBookingCreated(admin, appointment.id, { confirmed: staffBooking });
    } catch (notificationError) {
      console.error("Unable to send booking notifications:", notificationError);
    }

    return NextResponse.json({ appointment, requiresPayment: !staffBooking, reservationFee: staffBooking ? 0 : RESERVATION_FEE_PHP, paymentHoldMinutes: staffBooking ? 0 : PAYMENT_HOLD_MINUTES });
  } catch (error) {
    console.error("Unable to create appointment:", error);
    return NextResponse.json({ error: "Unable to save the booking. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  try {
    const { id, status, reason } = await request.json();
    if (typeof id !== "string" || !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid appointment update." }, { status: 400 });
    }

    const admin = getAdminClient();
    const role = await getUserRole(user);
    const staff = isStaffRole(role);
    const { data: current, error: currentError } = await admin.from("appointments").select("status, appointment_date, appointment_time, visit_kind, parent_appointment_id, clients(email)").eq("id", id).single();
    if (currentError || !current) throw currentError || new Error("Appointment not found.");
    if (!staff) {
      const client = firstRelated(current.clients as { email: string | null } | { email: string | null }[] | null);
      if (client?.email?.toLowerCase() !== user.email?.toLowerCase()) return NextResponse.json({ error: "You cannot change this appointment." }, { status: 403 });
      if (status !== "cancelled") return NextResponse.json({ error: "Patients can only cancel their own appointments here." }, { status: 403 });
      if (!["pending", "confirmed"].includes(current.status)) return NextResponse.json({ error: "This appointment can no longer be cancelled." }, { status: 409 });
      const now = clinicNow();
      if (current.appointment_date < now.date || (current.appointment_date === now.date && normalizeTime(current.appointment_time) <= now.time)) return NextResponse.json({ error: "Past appointments cannot be cancelled online. Please contact the clinic." }, { status: 409 });
      if (!String(reason || "").trim()) return NextResponse.json({ error: "Please provide a cancellation reason." }, { status: 400 });
    }
    const transitions: Record<string, AppointmentStatus[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled", "no_show"],
      paid: ["completed", "cancelled", "no_show"],
      completed: [], cancelled: [], no_show: [],
    };
    if (!transitions[current.status]?.includes(status)) {
      return NextResponse.json({ error: `A ${current.status} appointment cannot be changed to ${status}.` }, { status: 409 });
    }
    if (current.status === "pending" && status === "confirmed") {
      const { data: paidReservation, error: paymentError } = await admin.from("payments").select("id").eq("appointment_id", id).eq("status", "paid").limit(1).maybeSingle();
      if (paymentError) throw paymentError;
      if (!paidReservation) return NextResponse.json({ error: "This appointment is still awaiting its reservation payment and cannot be confirmed manually." }, { status: 409 });
    }
    const changes: Record<string, string | null> = { status };
    if (status === "completed") changes.completed_at = new Date().toISOString();
    if (status === "cancelled") {
      changes.cancelled_at = new Date().toISOString();
      changes.cancellation_reason = String(reason || (staff ? "Cancelled by clinic" : "")).trim().slice(0, 1000) || null;
    }
    const { error } = await admin.from("appointments").update(changes).eq("id", id);
    if (error) throw error;
    if (status === "cancelled") {
      await admin.from("appointment_reschedule_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("appointment_id", id).eq("status", "pending");
      if (current.visit_kind === "consultation_follow_up" && current.parent_appointment_id) {
        await admin.from("consultation_charts").update({ follow_up_appointment_id: null, updated_at: new Date().toISOString() }).eq("appointment_id", current.parent_appointment_id).eq("follow_up_appointment_id", id);
      }
    }
    try {
      await notifyAppointmentStatusChanged(admin, id, status as "confirmed" | "completed" | "cancelled" | "no_show");
    } catch (notificationError) {
      console.error("Unable to send appointment status notification:", notificationError);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to update appointment:", error);
    return NextResponse.json({ error: "Unable to update the appointment." }, { status: 500 });
  }
}
