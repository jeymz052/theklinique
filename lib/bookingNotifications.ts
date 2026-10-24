import { deliverEmail, reserveDelivery, finishDelivery } from "@/lib/notificationDelivery";
import { dueReminders, reminderEvent, type ReminderKind } from "@/lib/appointmentReminders";
import type { MedicalDocument } from "@/lib/consultation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLINIC_TIME_ZONE, formatSlotLabel } from "@/lib/bookingAvailability";
import { describeBooking, specificNotice, type NoticeBooking } from "@/lib/bookingNotice";

type AdminClient = SupabaseClient;
type NoticeEvent = `appointment_reminder_${string}` | `prescription_ready:${string}` | "booking_received" | "reservation_paid" | "appointment_reminder_24h" | "appointment_confirmed" | "appointment_completed" | "appointment_cancelled" | "appointment_no_show" | "consultation_follow_up_recommended" | `reschedule_requested:${string}` | `reschedule_approved:${string}` | `reschedule_rejected:${string}`;

type AppointmentDetails = NoticeBooking & {
  id: string;
  status: string;
  reference_no: string;
  appointment_date: string;
  appointment_time: string;
  visit_kind: "standard" | "consultation_follow_up";
  consultation_mode: "clinic" | "online";
  clients: { full_name: string; email: string | null; phone: string; auth_user_id?: string } | { full_name: string; email: string | null; phone: string; auth_user_id?: string }[] | null;
};

function firstRelated<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

const appUrl = (process.env.APP_URL || "https://thekliniqueph.com").replace(/\/$/, "");

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: CLINIC_TIME_ZONE, dateStyle: "long" }).format(new Date(`${date}T00:00:00+08:00`));
}

function emailHtml(eyebrow: string, heading: string, message: string, details: AppointmentDetails, buttonLabel: string, dashboardPath: string) {
  const client = firstRelated(details.clients);
  const notice = describeBooking(details);
  eyebrow = `${notice.label} · ${eyebrow}`;
  heading = `${notice.label} · ${heading}`;
  const service = notice.summary;
  if (notice.online && dashboardPath === "/dashboard/patient") dashboardPath = "/dashboard/patient?view=online";
  return `<!doctype html><html><body style="margin:0;background:#fff3f7;font-family:Arial,sans-serif;color:#59283a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #f5d5df;border-radius:18px;overflow:hidden;box-shadow:0 10px 35px rgba(169,58,94,.12)"><tr><td align="center" style="background:#fde5ed;padding:28px"><img src="${appUrl}/images/the_klinique_logo-removebg-preview.png" width="185" alt="The Klinique" style="display:block;height:auto"></td></tr><tr><td style="padding:38px 42px"><p style="margin:0;text-align:center;color:#bc456c;font-size:12px;letter-spacing:3px;font-weight:700;text-transform:uppercase">${escapeHtml(eyebrow)}</p><h1 style="margin:14px 0;text-align:center;color:#762c48;font-size:29px">${escapeHtml(heading)}</h1><p style="margin:0 0 25px;color:#765866;line-height:1.7;text-align:center">${escapeHtml(message)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff5f8;border:1px solid #f8dce5;border-radius:12px;padding:20px"><tr><td style="padding:7px;color:#92717e">Patient</td><td style="padding:7px;text-align:right;font-weight:700">${escapeHtml(client?.full_name || "Patient")}</td></tr><tr><td style="padding:7px;color:#92717e">Service</td><td style="padding:7px;text-align:right;font-weight:700">${escapeHtml(service)}</td></tr><tr><td style="padding:7px;color:#92717e">Schedule</td><td style="padding:7px;text-align:right;font-weight:700">${escapeHtml(displayDate(details.appointment_date))}, ${escapeHtml(formatSlotLabel(details.appointment_time))}</td></tr><tr><td style="padding:7px;color:#92717e">Reference</td><td style="padding:7px;text-align:right;font-weight:700">${escapeHtml(details.reference_no)}</td></tr></table><div style="text-align:center;padding-top:28px"><a href="${appUrl}${dashboardPath}" style="display:inline-block;background:#c43f6a;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px">${escapeHtml(buttonLabel)}</a></div></td></tr><tr><td style="border-top:1px solid #f5d5df;background:#fff8fa;padding:20px;text-align:center;color:#92717e;font-size:12px">The Klinique Medical Aesthetics · Cagayan de Oro City</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmailOnce(admin: AdminClient, details: AppointmentDetails, event: NoticeEvent, to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM || !to) return;
  try {
    await deliverEmail(admin, { appointmentId: details.id, event, to, subject: `${describeBooking(details).label} - ${subject}`, html });
  } catch { console.error("Notification email could not be delivered; it can be retried."); }
}

async function sendSmsOnce(admin: AdminClient, details: AppointmentDetails, event: NoticeEvent, message: string) {
  // Semaphore is limited to confirmation and 24-hour reminder messages.
  if (event !== "reservation_paid" && event !== "appointment_reminder_24h" && !event.startsWith("appointment_reminder_24h:")) return;
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER_NAME;
  const phone = firstRelated(details.clients)?.phone;
  if (!apiKey || !phone) return;
  const deliveryId = await reserveDelivery(admin, details.id, "sms", event, phone);
  if (!deliveryId) return;
  let rejected = false;
  try {
    const form = new URLSearchParams({ apikey: apiKey, number: phone, message });
    if (senderName) form.set("sendername", senderName);
    const response = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(12_000), body: form });
    const result = await response.json();
    const sent = Array.isArray(result) ? result[0] : null;
    rejected = (response.status >= 400 && response.status < 500) || String(sent?.status).toLowerCase() === "failed";
    if (!response.ok || !sent?.message_id || String(sent.status).toLowerCase() === "failed") throw new Error(sent?.message || "Semaphore rejected the message.");
    await admin.from("sms_logs").insert({ appointment_id: details.id, recipient_phone: phone, event: event === "reservation_paid" ? "booking_confirmation" : "appointment_reminder", message, semaphore_msg_id: String(sent.message_id), status: "sent", sent_at: new Date().toISOString() });
    await finishDelivery(admin, deliveryId, "sent", String(sent.message_id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMS delivery failed.";
    if (rejected) await finishDelivery(admin, deliveryId, "failed", undefined, message);
    else await admin.from("notification_deliveries").update({ error_message: `SMS acceptance unknown; review Semaphore before retrying. ${message}` }).eq("id", deliveryId);
  }
}

function smsInstructions(details: AppointmentDetails) {
  return describeBooking(details).online ? "Join Zoom in your patient portal 15 minutes before your appointment." : "Please arrive 10 minutes early.";
}

function confirmationSms(details: AppointmentDetails) {
  return `The Klinique: ${describeBooking(details).summary}. ${details.reference_no} is confirmed on ${displayDate(details.appointment_date)} at ${formatSlotLabel(details.appointment_time)} PHT. ${smsInstructions(details)}`;
}

function reminderSms(details: AppointmentDetails) {
  return `The Klinique reminder: ${describeBooking(details).summary}. ${details.reference_no} is tomorrow, ${displayDate(details.appointment_date)} at ${formatSlotLabel(details.appointment_time)} PHT. ${smsInstructions(details)}`;
}

async function detailsFor(admin: AdminClient, appointmentId: string) {
  const { data, error } = await admin.from("appointments").select("id, status, reference_no, appointment_date, appointment_time, visit_kind, consultation_mode, clients(full_name, email, phone, auth_user_id), services(name,slug,is_package,service_categories(slug)), products(name), appointment_services(services(name))").eq("id", appointmentId).single();
  if (error) throw error;
  const orders = await admin.from("orders").select("order_items(products(name))").eq("notes", `Booking ${data.reference_no}`);
  if (orders.error) throw orders.error;
  const packageNames = (orders.data || []).flatMap(order => (order.order_items || []).map(item => firstRelated(item.products)?.name).filter((name): name is string => Boolean(name)));
  return { ...data, packageNames } as unknown as AppointmentDetails;
}

async function addAppNotice(admin: AdminClient, recipientId: string, details: AppointmentDetails, event: NoticeEvent, title: string, body: string, href: string) {
  const specific = specificNotice(details, title, body);
  if (describeBooking(details).online && href === "/dashboard/patient") href = "/dashboard/patient?view=online";
  const { error } = await admin.from("app_notifications").upsert({ recipient_id: recipientId, appointment_id: details.id, event, ...specific, href }, { onConflict: "recipient_id,appointment_id,event", ignoreDuplicates: true });
  if (error) throw error;
}

async function recipients(admin: AdminClient, patientEmail: string) {
  const [{ data: patient, error: patientError }, { data: staff, error: staffError }] = await Promise.all([
    admin.from("profiles").select("id, email, role").eq("email", patientEmail),
    admin.from("profiles").select("id, email, role").in("role", ["superadmin", "doctor", "secretary"]),
  ]);
  if (patientError || staffError) throw patientError || staffError;
  return [...(patient || []), ...(staff || []).filter((member) => !(patient || []).some((item) => item.id === member.id))];
}

function staffEmailRecipients(users: { email: string | null; role: string }[]) {
  return users.filter((item) => ["doctor", "superadmin", "secretary"].includes(item.role) && item.email);
}

export async function notifyBookingCreated(admin: AdminClient, appointmentId: string, options: { confirmed?: boolean } = {}) {
  const details = await detailsFor(admin, appointmentId);
  const client = firstRelated(details.clients);
  if (!client?.email) return;
  const users = await recipients(admin, client.email);
  const patient = users.find((item) => item.email?.toLowerCase() === client.email?.toLowerCase());
  const patientTitle = options.confirmed ? "Appointment confirmed" : "Booking received";
  const patientBody = options.confirmed ? `${details.reference_no} was scheduled and confirmed by the clinic.` : `${details.reference_no} is awaiting ${details.consultation_mode === "online" ? "the full PHP 600 online consultation fee" : "the reservation payment"}.`;
  if (patient) await addAppNotice(admin, patient.id, details, "booking_received", patientTitle, patientBody, "/dashboard/patient");
  await Promise.all(users.filter((item) => ["superadmin", "doctor", "secretary"].includes(item.role)).map((staff) => addAppNotice(admin, staff.id, details, "booking_received", "New appointment booked", `${client.full_name} booked ${firstRelated(details.services)?.name || "an appointment"}.`, staff.role === "secretary" ? "/dashboard/secretary" : "/dashboard/doctor")));
  await sendEmailOnce(admin, details, "booking_received", client.email, `${patientTitle} · ${details.reference_no}`, options.confirmed
    ? emailHtml("Clinic appointment", "Your appointment is confirmed", "The clinic scheduled and confirmed your appointment.", details, "View appointment", "/dashboard/patient")
    : emailHtml("Booking received", "Complete your reservation", details.consultation_mode === "online" ? "Your online appointment has been recorded. Pay the full PHP 600 online consultation fee to confirm it." : "Your appointment slot has been recorded. Complete the reservation fee to confirm it.", details, "View booking", "/dashboard/patient"));
  const doctorEmails = staffEmailRecipients(users).map((item) => item.email as string);
  await Promise.all(doctorEmails.map((email) => sendEmailOnce(admin, details, "booking_received", email, `New appointment · ${details.reference_no}`, emailHtml("Booking update", "A new appointment was booked", options.confirmed ? "The clinic scheduled and confirmed this booking." : details.consultation_mode === "online" ? "A patient booked an online consultation and is completing the full PHP 600 online consultation fee." : "A patient submitted a booking and is completing the reservation payment.", details, "Open doctor dashboard", "/dashboard/doctor"))));
  // Reuse the historical payment-confirmation key across all confirmation paths.
  if (options.confirmed) await sendSmsOnce(admin, details, "reservation_paid", confirmationSms(details));
}

export async function notifyReservationPaid(admin: AdminClient, appointmentId: string) {
  const details = await detailsFor(admin, appointmentId);
  const client = firstRelated(details.clients);
  if (!client?.email) return;
  const users = await recipients(admin, client.email);
  const patient = users.find((item) => item.email?.toLowerCase() === client.email?.toLowerCase());
  const isFollowUp = details.visit_kind === "consultation_follow_up";
  const isOnline = details.consultation_mode === "online";
  const paymentLabel = isOnline ? "full PHP 600 online consultation fee" : isFollowUp ? "full PHP 500 follow-up fee" : "reservation fee";
  if (patient) await addAppNotice(admin, patient.id, details, "reservation_paid", "Appointment confirmed", `${details.reference_no} is confirmed and the ${paymentLabel} was received.`, "/dashboard/patient");
  await Promise.all(users.filter((item) => ["superadmin", "doctor", "secretary"].includes(item.role)).map((staff) => addAppNotice(admin, staff.id, details, "reservation_paid", isOnline || isFollowUp ? "Full fee received" : "Reservation payment received", `${client.full_name}'s appointment ${details.reference_no} is paid.`, staff.role === "secretary" ? "/dashboard/secretary" : "/dashboard/doctor")));
  await sendEmailOnce(admin, details, "reservation_paid", client.email, `Appointment confirmed · ${details.reference_no}`, emailHtml(isFollowUp ? "Follow-up confirmed" : "Reservation confirmed", "Your appointment is confirmed", isOnline ? "We received your full PHP 600 online consultation fee. Join your scheduled meeting from Online Consultation in your patient portal." : isFollowUp ? "We received the full PHP 500 follow-up check-up fee." : "We received your reservation fee. It will be credited toward your clinic bill.", details, "View appointment", "/dashboard/patient"));
  const clinicalLeaderEmails = Array.from(new Set(staffEmailRecipients(users).map((item) => String(item.email).toLowerCase())));
  await Promise.all(clinicalLeaderEmails.map((email) => sendEmailOnce(admin, details, "reservation_paid", email, `Payment received - ${details.reference_no}`, emailHtml("Payment update", isOnline || isFollowUp ? "Full fee received" : "Reservation payment received", `${client.full_name}'s appointment is paid and confirmed.`, details, "Open clinic dashboard", "/dashboard/doctor?view=all-appts"))));
  await sendSmsOnce(admin, details, "reservation_paid", confirmationSms(details));
}

export async function notifyConsultationFollowUpRecommended(admin: AdminClient, appointmentId: string, recommendedDate: string | null, notes: string) {
  const details = await detailsFor(admin, appointmentId);
  const client = firstRelated(details.clients);
  if (!client?.email) return;
  const users = await recipients(admin, client.email);
  const patient = users.find((item) => item.email?.toLowerCase() === client.email?.toLowerCase());
  const scheduleHint = recommendedDate ? ` Recommended date: ${displayDate(recommendedDate)}.` : "";
  const noteHint = notes ? ` ${notes}` : "";
  const message = `Dr. Kharyl recommends a separate follow-up check-up.${scheduleHint}${noteHint} Book an available slot and pay the full PHP 500 follow-up fee to confirm it.`;
  const href = `/dashboard/patient?view=book&service=follow-up-check-up&parent=${encodeURIComponent(appointmentId)}`;
  if (patient) await addAppNotice(admin, patient.id, details, "consultation_follow_up_recommended", "Follow-up check-up recommended", message, href);
  await sendEmailOnce(
    admin,
    details,
    "consultation_follow_up_recommended",
    client.email,
    `Follow-up check-up recommended · ${details.reference_no}`,
    emailHtml("Consultation follow-up", "Book your follow-up check-up", message, details, "Book follow-up", href),
  );
}

export async function notifyReminder(admin: AdminClient, appointmentId: string) {
  const details = await detailsFor(admin, appointmentId);
  const client = firstRelated(details.clients);
  if (!client?.email) return;
  const users = await recipients(admin, client.email);
  const patient = users.find((item) => item.email?.toLowerCase() === client.email?.toLowerCase());
  if (patient) await addAppNotice(admin, patient.id, details, "appointment_reminder_24h", "Appointment tomorrow", `${details.reference_no} is scheduled tomorrow at ${formatSlotLabel(details.appointment_time)}.`, "/dashboard/patient");
  await sendEmailOnce(admin, details, "appointment_reminder_24h", client.email, `Reminder: appointment tomorrow · ${details.reference_no}`, emailHtml("Appointment reminder", "We'll see you tomorrow", details.consultation_mode === "online" ? "Your online consultation is tomorrow. Join your meeting from Online Consultation in your patient portal." : "This is a reminder for your upcoming appointment. Please arrive 10 minutes early.", details, "View appointment", "/dashboard/patient"));
  await sendSmsOnce(admin, details, "appointment_reminder_24h", reminderSms(details));
}

async function patientAccount(admin: AdminClient, details: AppointmentDetails) {
  const id = firstRelated(details.clients)?.auth_user_id;
  if (!id) return null;
  const { data, error } = await admin.from("profiles").select("id,role").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.role === "patient" ? data : null;
}

export async function notifyTimedReminder(admin: AdminClient, appointmentId: string, kind: ReminderKind, now = Date.now()) {
  const details = await detailsFor(admin, appointmentId), client = firstRelated(details.clients);
  if (!client || details.status !== "confirmed" || (kind === "online15m" && details.consultation_mode !== "online")) return;
  if (!dueReminders(details, now).includes(kind)) return;
  const event = reminderEvent(details, kind) as NoticeEvent;
  const online = details.consultation_mode === "online";
  const when = kind === "24h" ? "tomorrow" : kind === "1h" ? "in one hour" : "in 15 minutes";
  const title = kind === "online15m" ? "Your online consultation room is ready" : `Appointment ${when}`;
  const instructions = online ? (kind === "online15m" ? "Join Zoom in your patient portal, allow camera and microphone access, and wait for Dr. Kharyl to admit you." : "Join Zoom in your patient portal 15 minutes before your appointment.") : "Please arrive 10 minutes early.";
  const body = `${details.reference_no} is ${when}, ${displayDate(details.appointment_date)} at ${formatSlotLabel(details.appointment_time.slice(0, 5))} PHT. ${instructions}`;
  const patient = await patientAccount(admin, details);
  const patientHref = online ? "/dashboard/patient?view=online" : "/dashboard/patient";
  const { data: doctors, error } = kind === "24h" ? { data: [], error: null } : await admin.from("profiles").select("id,email,role").in("role", ["doctor", "superadmin"]);
  if (error) throw error;
  const doctorTitle = `${online ? "Online consultation" : "Appointment"} ${when}`;
  const doctorBody = `${client.full_name}: ${details.reference_no} at ${formatSlotLabel(details.appointment_time.slice(0, 5))} PHT. ${online ? "Open Consultations to start Zoom inside your workspace." : "Review the patient record before the visit."}`;
  const doctorHref = online ? "/dashboard/doctor?view=consultations" : "/dashboard/doctor?view=all-appts";
  await Promise.all([
    patient ? addAppNotice(admin, patient.id, details, event, title, body, patientHref) : Promise.resolve(),
    client.email ? sendEmailOnce(admin, details, event, client.email, `${title} - ${details.reference_no}`, emailHtml("Appointment reminder", title, body, details, online ? "Open online consultation" : "View appointment", patientHref)) : Promise.resolve(),
    kind === "24h" ? sendSmsOnce(admin, details, event, reminderSms(details)) : Promise.resolve(),
    ...(doctors || []).flatMap(doctor => [
      addAppNotice(admin, doctor.id, details, event, doctorTitle, doctorBody, doctorHref),
      doctor.email ? sendEmailOnce(admin, details, event, doctor.email, `${doctorTitle} - ${details.reference_no}`, emailHtml("Doctor reminder", doctorTitle, doctorBody, details, "Open workspace", doctorHref)) : Promise.resolve(),
    ]),
  ]);
}

export type ReadyPrescription = Pick<MedicalDocument, "id" | "reference_no" | "appointment_id" | "document_type" | "released_to_patient">;
export async function notifyPrescriptionReady(admin: AdminClient, document: ReadyPrescription) {
  if (document.document_type !== "prescription" || !document.released_to_patient) return;
  const details = await detailsFor(admin, document.appointment_id), client = firstRelated(details.clients);
  if (!client) return;
  const event = `prescription_ready:${document.id}` as const;
  const title = "Your prescription is ready";
  const body = `${document.reference_no} has been issued by Dr. Kharyl. Open Medical Documents in your patient portal to view or download your prescription PDF.`;
  const href = "/dashboard/patient?view=documents";
  const patient = await patientAccount(admin, details);
  await Promise.all([
    patient ? addAppNotice(admin, patient.id, details, event, title, body, href) : Promise.resolve(),
    client.email ? sendEmailOnce(admin, details, event, client.email, `${title} - ${document.reference_no}`, emailHtml("Prescription ready", title, body, details, "View prescription", href)) : Promise.resolve(),
  ]);
}

export async function notifyAppointmentStatusChanged(admin: AdminClient, appointmentId: string, status: "confirmed" | "completed" | "cancelled" | "no_show") {
  const details = await detailsFor(admin, appointmentId);
  const client = firstRelated(details.clients);
  if (!client?.email) return;
  const users = await recipients(admin, client.email);
  const patient = users.find((item) => item.email?.toLowerCase() === client.email?.toLowerCase());
  const messages = {
    confirmed: ["Appointment confirmed", `${details.reference_no} was confirmed by the clinic.`],
    completed: ["Appointment completed", `${details.reference_no} was marked completed.`],
    cancelled: ["Appointment cancelled", `${details.reference_no} was cancelled. Contact the clinic if you need assistance.`],
    no_show: ["Appointment marked no-show", `${details.reference_no} was marked as a no-show. Contact the clinic to reschedule.`],
  } as const;
  const [title, body] = messages[status];
  const event = `appointment_${status}` as Extract<NoticeEvent, "appointment_confirmed" | "appointment_completed" | "appointment_cancelled" | "appointment_no_show">;
  if (patient) await addAppNotice(admin, patient.id, details, event, title, body, "/dashboard/patient");
  if (status === "cancelled") {
    await Promise.all(users.filter((item) => ["superadmin", "doctor", "secretary"].includes(item.role)).map((staff) =>
      addAppNotice(admin, staff.id, details, event, "Appointment cancelled", `${client.full_name} cancelled ${details.reference_no}.`, staff.role === "secretary" ? "/dashboard/secretary" : "/dashboard/doctor")
    ));
    const clinicalLeaderEmails = Array.from(new Set(staffEmailRecipients(users).map((item) => String(item.email).toLowerCase())));
    await Promise.all(clinicalLeaderEmails.map((email) => sendEmailOnce(admin, details, event, email, `Appointment cancelled - ${details.reference_no}`, emailHtml("Clinic appointment update", "An appointment was cancelled", `${client.full_name}'s appointment was cancelled.`, details, "Open clinic dashboard", "/dashboard/doctor?view=all-appts"))));
  }
  await sendEmailOnce(admin, details, event, client.email, `${title} · ${details.reference_no}`, emailHtml("Appointment update", title, body, details, "View appointment", "/dashboard/patient"));
  if (status === "confirmed") await sendSmsOnce(admin, details, "reservation_paid", confirmationSms(details));
}

export async function notifyRescheduleRequested(admin: AdminClient, appointmentId: string, requestId: string, requestedDate: string, requestedTime: string) {
  const details = await detailsFor(admin, appointmentId);
  const client = firstRelated(details.clients);
  if (!client?.email) return;
  const users = await recipients(admin, client.email);
  const event = `reschedule_requested:${requestId}` as const;
  const requested = `${displayDate(requestedDate)} at ${formatSlotLabel(requestedTime)}`;
  await Promise.all(users.filter((item) => ["superadmin", "doctor", "secretary"].includes(item.role)).map((staff) =>
    addAppNotice(admin, staff.id, details, event, "Reschedule approval needed", `${client.full_name} requested ${requested} for ${details.reference_no}.`, staff.role === "secretary" ? "/dashboard/secretary" : "/dashboard/doctor?view=all-appts")
  ));
  const doctorEmails = staffEmailRecipients(users).map((item) => item.email as string);
  await Promise.all(doctorEmails.map((email) => sendEmailOnce(admin, details, event, email, `Reschedule request · ${details.reference_no}`, emailHtml("Approval needed", "A patient requested a new schedule", `${client.full_name} requested ${requested}. The existing appointment remains active until you approve the request.`, details, "Review request", "/dashboard/doctor?view=all-appts"))));
}

export async function notifyRescheduleDecision(admin: AdminClient, appointmentId: string, requestId: string, decision: "approved" | "rejected") {
  const details = await detailsFor(admin, appointmentId);
  const client = firstRelated(details.clients);
  if (!client?.email) return;
  const users = await recipients(admin, client.email);
  const patient = users.find((item) => item.email?.toLowerCase() === client.email?.toLowerCase());
  const event = `reschedule_${decision}:${requestId}` as const;
  const title = decision === "approved" ? "Reschedule request approved" : "Reschedule request declined";
  const body = decision === "approved"
    ? `${details.reference_no} is now scheduled for ${displayDate(details.appointment_date)} at ${formatSlotLabel(details.appointment_time)}.`
    : `${details.reference_no} keeps its original schedule. Contact the clinic if you need help.`;
  if (patient) await addAppNotice(admin, patient.id, details, event, title, body, "/dashboard/patient");
  await sendEmailOnce(admin, details, event, client.email, `${title} · ${details.reference_no}`, emailHtml("Appointment update", title, body, details, "View appointment", "/dashboard/patient"));
}
