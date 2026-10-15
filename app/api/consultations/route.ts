import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyConsultationFollowUpRecommended } from "@/lib/bookingNotifications";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function admin() { if (!url || !serviceKey) throw new Error("Supabase is not configured."); return createClient(url, serviceKey, { auth: { persistSession: false } }); }
async function doctor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await auth.auth.getUser(); if (!data.user) return null;
  const claimed = String(data.user.app_metadata?.role || "");
  if (["doctor", "superadmin"].includes(claimed)) return data.user;
  const { data: profile } = await admin().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return ["doctor", "superadmin"].includes(String(profile?.role)) ? data.user : null;
}

export async function GET(request: Request) {
  if (!await doctor(request)) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  const database = admin();
  const [charts, intakes, procedures, procedureCategories, packages] = await Promise.all([
    database.from("consultation_charts").select("appointment_id, clinical_assessment, subjective_notes, objective_notes, treatment_plan, follow_up_required, follow_up_recommended_date, follow_up_notes, follow_up_appointment_id, status, started_at, completed_at"),
    database.from("appointment_intakes").select("appointment_id, chief_concern, treatment_goals, allergies_snapshot, medications_snapshot, medical_history_snapshot, pregnancy_status, previous_reactions, recent_procedures, custom_answers, information_confirmed_at"),
    database.from("services").select("id, category_id, subcategory, name, description, price, price_note, duration_mins, service_categories!inner(slug)").eq("is_active", true).neq("service_categories.slug", "consultations").order("sort_order"),
    database.from("service_categories").select("id, name, slug, sort_order").not("slug", "in", "(consultations,package-bookings)").order("sort_order"),
    database.from("products").select("id, name, description, price, category, subcategory").eq("is_active", true).order("sort_order"),
  ]);
  if (charts.error || intakes.error || procedures.error || procedureCategories.error || packages.error) return NextResponse.json({ error: "Unable to load consultation charts." }, { status: 500 });
  return NextResponse.json({ charts: charts.data || [], intakes: intakes.data || [], procedures: procedures.data || [], procedureCategories: procedureCategories.data || [], packages: packages.data || [] });
}

export async function PATCH(request: Request) {
  const user = await doctor(request);
  if (!user) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const appointmentId = String(body.appointmentId || "");
    const status = ["ready", "in_progress", "completed"].includes(body.status) ? body.status : "in_progress";
    const followUpRequired = body.followUpRequired === true;
    const followUpRecommendedDate = followUpRequired && /^\d{4}-\d{2}-\d{2}$/.test(String(body.followUpRecommendedDate || ""))
      ? String(body.followUpRecommendedDate)
      : null;
    const db = admin();
    const { data: appointment, error: appointmentError } = await db.from("appointments").select("id, client_id, status, appointment_date, appointment_time, services!inner(service_categories!inner(slug))").eq("id", appointmentId).single();
    if (appointmentError || !appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    const appointmentService = Array.isArray(appointment.services) ? appointment.services[0] : appointment.services;
    const category = Array.isArray(appointmentService?.service_categories) ? appointmentService.service_categories[0] : appointmentService?.service_categories;
    if (category?.slug !== "consultations") return NextResponse.json({ error: "Treatments must be documented in the treatment workspace." }, { status: 409 });
    if (!["confirmed", "completed"].includes(appointment.status)) return NextResponse.json({ error: "Only confirmed appointments can be charted." }, { status: 409 });
    const { data: existingChart } = await db.from("consultation_charts").select("follow_up_appointment_id").eq("appointment_id", appointmentId).maybeSingle();
    if (existingChart?.follow_up_appointment_id && !followUpRequired) {
      return NextResponse.json({ error: "This recommendation already has a booked follow-up and cannot be removed." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const { data, error } = await db.from("consultation_charts").upsert({
      appointment_id: appointmentId,
      client_id: appointment.client_id,
      doctor_id: user.id,
      clinical_assessment: String(body.clinicalAssessment || "").trim() || null,
      subjective_notes: String(body.subjectiveNotes || "").trim() || null,
      objective_notes: String(body.objectiveNotes || "").trim() || null,
      treatment_plan: String(body.treatmentPlan || "").trim() || null,
      follow_up_required: followUpRequired,
      follow_up_recommended_date: followUpRecommendedDate,
      follow_up_notes: followUpRequired ? String(body.followUpNotes || "").trim() || null : null,
      status,
      started_at: status !== "ready" ? now : null,
      completed_at: status === "completed" ? now : null,
      updated_at: now,
    }, { onConflict: "appointment_id" }).select().single();
    if (error) throw error;
    if (status === "completed") {
      const completion = await db.from("appointments").update({ status: "completed", completed_at: now }).eq("id", appointmentId).eq("status", "confirmed");
      if (completion.error) throw completion.error;
      if (followUpRequired) {
        try {
          await notifyConsultationFollowUpRecommended(db, appointmentId, followUpRecommendedDate, String(body.followUpNotes || "").trim());
        } catch (notificationError) {
          console.error("Unable to send the consultation follow-up recommendation:", notificationError);
        }
      }
    }
    let procedureAppointmentId: string | null = null;
    const procedureServiceIds = Array.from(new Set(Array.isArray(body.procedureServiceIds) ? body.procedureServiceIds.map(String).filter(Boolean) : []));
    const packageProductIds = Array.from(new Set(Array.isArray(body.packageProductIds) ? body.packageProductIds.map(String).filter(Boolean) : []));
    if (status === "completed" && (procedureServiceIds.length || packageProductIds.length)) {
      const [{ data: selectedServices, error: servicesError }, { data: selectedPackages, error: packagesError }] = await Promise.all([
        procedureServiceIds.length ? db.from("services").select("id, price, duration_mins, is_active, service_categories!inner(slug)").in("id", procedureServiceIds).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
        packageProductIds.length ? db.from("products").select("id, price").in("id", packageProductIds).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
      ]);
      if (servicesError || packagesError || selectedServices?.length !== procedureServiceIds.length || selectedPackages?.length !== packageProductIds.length) return NextResponse.json({ error: "One or more selected procedures or packages are unavailable." }, { status: 400 });
      if ((selectedServices || []).some((service) => { const category = Array.isArray(service.service_categories) ? service.service_categories[0] : service.service_categories; return category?.slug === "consultations" || category?.slug === "package-bookings"; })) return NextResponse.json({ error: "Choose valid medical procedures." }, { status: 400 });
      let primaryService: { id: string; price: number | string; duration_mins: number | null; is_active: boolean } | null = selectedServices?.[0] || null;
      if (!primaryService) {
        const packageService = await db.from("services").select("id, price, duration_mins, is_active").eq("slug", "glow-plans-package-booking").eq("is_active", true).single();
        if (packageService.error || !packageService.data) return NextResponse.json({ error: "Package visits are not configured." }, { status: 409 });
        primaryService = packageService.data;
      }
      const totalAmount = [...(selectedServices || []), ...(selectedPackages || [])].reduce((sum, item) => sum + Number(item.price), 0);
      const { data: existing } = await db.from("appointments").select("id").eq("source_consultation_appointment_id", appointmentId).maybeSingle();
      if (existing) {
        procedureAppointmentId = existing.id;
      } else {
        const { data: referenceNo, error: referenceError } = await db.rpc("generate_appointment_reference");
        if (referenceError || !referenceNo) throw referenceError || new Error("Unable to generate the procedure reference.");
        const { data: procedureAppointment, error: procedureError } = await db.from("appointments").insert({
          reference_no: referenceNo,
          client_id: appointment.client_id,
          service_id: primaryService.id,
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time,
          status: "confirmed",
          total_amount: totalAmount,
          staff_notes: `${procedureServiceIds.length} procedure(s) and ${packageProductIds.length} package(s) selected with Dr. Kharyl immediately after consultation.`,
          source_consultation_appointment_id: appointmentId,
          selected_package_product_id: selectedPackages?.[0]?.id || null,
        }).select("id").single();
        if (procedureError) throw procedureError;
        procedureAppointmentId = procedureAppointment.id;
        const additionalServices = (selectedServices || []).filter((service) => service.id !== primaryService.id);
        if (additionalServices.length) {
          const additions = await db.from("appointment_services").insert(additionalServices.map((service) => ({ appointment_id: procedureAppointment.id, service_id: service.id, price_snapshot: service.price, duration_snapshot: service.duration_mins })));
          if (additions.error) throw additions.error;
        }
        if (selectedPackages?.length) {
          const { data: orderReference, error: orderReferenceError } = await db.rpc("generate_order_ref");
          if (orderReferenceError || !orderReference) throw orderReferenceError || new Error("Unable to create the package order.");
          const packageTotal = selectedPackages.reduce((sum, item) => sum + Number(item.price), 0);
          const { data: order, error: orderError } = await db.from("orders").insert({ reference_no: orderReference, client_id: appointment.client_id, status: "pending_payment", total_amount: packageTotal, notes: `Booking ${referenceNo}` }).select("id").single();
          if (orderError || !order) throw orderError || new Error("Unable to create the package order.");
          const item = await db.from("order_items").insert(selectedPackages.map((selectedPackage) => ({ order_id: order.id, product_id: selectedPackage.id, quantity: 1, unit_price: selectedPackage.price })));
          if (item.error) throw item.error;
        }
      }
    }
    return NextResponse.json({ chart: data, procedureAppointmentId });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save the consultation chart." }, { status: 500 }); }
}
