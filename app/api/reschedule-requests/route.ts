import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { clinicNow, hourlyTimes, isIsoDate, normalizeTime } from "@/lib/bookingAvailability";
import { notifyRescheduleDecision, notifyRescheduleRequested } from "@/lib/bookingNotifications";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
type ClinicRole = "superadmin" | "doctor" | "secretary" | "patient";

function adminClient() {
  if (!url || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function requestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function roleFor(user: User): Promise<ClinicRole> {
  const claim = String(user.app_metadata?.role || "");
  if (["superadmin", "doctor", "secretary", "patient"].includes(claim)) return claim as ClinicRole;
  const { data } = await adminClient().from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (["superadmin", "doctor", "secretary"].includes(String(data?.role)) ? data?.role : "patient") as ClinicRole;
}

function isStaff(role: ClinicRole) {
  return ["superadmin", "doctor", "secretary"].includes(role);
}

function isApprover(role: ClinicRole) {
  return role === "doctor" || role === "superadmin";
}

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

type RequestRow = {
  id: string; appointment_id: string; requested_date: string; requested_time: string; reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled"; review_note: string | null; created_at: string;
  appointments: { reference_no: string; appointment_date: string; appointment_time: string; clients: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null; services: { name: string } | { name: string }[] | null } | null;
};

function serialize(row: RequestRow) {
  const appointment = first(row.appointments);
  return {
    id: row.id, appointmentId: row.appointment_id, referenceNo: appointment?.reference_no || "",
    patient: first(appointment?.clients || null)?.full_name || "Unknown patient",
    service: first(appointment?.services || null)?.name || "Consultation",
    currentDate: appointment?.appointment_date || "", currentTime: appointment?.appointment_time?.slice(0, 5) || "",
    requestedDate: row.requested_date, requestedTime: row.requested_time.slice(0, 5), reason: row.reason || "",
    status: row.status, reviewNote: row.review_note || "", createdAt: row.created_at,
  };
}

const requestSelect = "id, appointment_id, requested_date, requested_time, reason, status, review_note, created_at, appointments(reference_no, appointment_date, appointment_time, clients(full_name, email), services(name))";

async function validateSlot(date: string, time: string, appointmentId: string) {
  if (!isIsoDate(date) || !/^\d{2}:00(?::00)?$/.test(time)) return "Select a valid one-hour appointment slot.";
  const admin = adminClient();
  const normalized = normalizeTime(time);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const [{ data: schedule, error: scheduleError }, { data: blocked, error: blockedError }, { data: conflict, error: conflictError }] = await Promise.all([
    admin.from("availability_schedules").select("open_time, close_time").eq("day_of_week", day).eq("is_active", true).maybeSingle(),
    admin.from("blocked_dates").select("id").eq("blocked_date", date).maybeSingle(),
    admin.from("appointments").select("id").eq("appointment_date", date).eq("appointment_time", `${normalized}:00`).neq("id", appointmentId).not("status", "in", '("cancelled","no_show")').limit(1),
  ]);
  if (scheduleError || blockedError || conflictError) throw scheduleError || blockedError || conflictError;
  const now = clinicNow();
  if (!schedule || !hourlyTimes(schedule.open_time, schedule.close_time).includes(normalized)) return "The clinic is closed during that time.";
  if (blocked) return "The clinic is unavailable on the selected date.";
  if (date < now.date || (date === now.date && normalized <= now.time)) return "Choose a future appointment time.";
  if (conflict?.length) return "That time was just booked. Choose another available slot.";
  return null;
}

export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const role = await roleFor(user);
    let query = adminClient().from("appointment_reschedule_requests").select(requestSelect).order("created_at", { ascending: false });
    if (isStaff(role)) query = query.eq("status", "pending");
    else query = query.eq("requested_by", user.id);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ requests: ((data || []) as unknown as RequestRow[]).map(serialize) });
  } catch (error) {
    console.error("Unable to load reschedule requests:", error);
    return NextResponse.json({ error: "Unable to load reschedule requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requestUser(request);
  if (!user?.email) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (isStaff(await roleFor(user))) return NextResponse.json({ error: "This action is for patient accounts." }, { status: 403 });
  try {
    const body = await request.json();
    const appointmentId = String(body.appointmentId || "");
    const requestedDate = String(body.requestedDate || "");
    const requestedTime = normalizeTime(String(body.requestedTime || ""));
    const reason = String(body.reason || "").trim().slice(0, 1000);
    if (!appointmentId || !requestedDate || !requestedTime || !reason) return NextResponse.json({ error: "Choose a new schedule and provide a reason." }, { status: 400 });
    const admin = adminClient();
    const { data: appointment, error: appointmentError } = await admin.from("appointments").select("id, appointment_date, appointment_time, status, clients!inner(email)").eq("id", appointmentId).single();
    if (appointmentError || !appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    const client = first(appointment.clients as { email: string | null } | { email: string | null }[]);
    if (client?.email?.toLowerCase() !== user.email.toLowerCase()) return NextResponse.json({ error: "You cannot change this appointment." }, { status: 403 });
    if (appointment.status !== "confirmed") return NextResponse.json({ error: "Only confirmed upcoming appointments can be rescheduled." }, { status: 409 });
    const now = clinicNow();
    if (appointment.appointment_date < now.date || (appointment.appointment_date === now.date && normalizeTime(appointment.appointment_time) <= now.time)) return NextResponse.json({ error: "Past appointments cannot be rescheduled online." }, { status: 409 });
    if (appointment.appointment_date === requestedDate && normalizeTime(appointment.appointment_time) === requestedTime) return NextResponse.json({ error: "Choose a different date or time." }, { status: 400 });
    const slotError = await validateSlot(requestedDate, requestedTime, appointmentId);
    if (slotError) return NextResponse.json({ error: slotError }, { status: 409 });
    const { data, error } = await admin.from("appointment_reschedule_requests").insert({ appointment_id: appointmentId, requested_by: user.id, requested_date: requestedDate, requested_time: `${requestedTime}:00`, reason }).select(requestSelect).single();
    if (error?.code === "23505") return NextResponse.json({ error: "A reschedule request is already awaiting review." }, { status: 409 });
    if (error || !data) throw error || new Error("Request was not saved.");
    try { await notifyRescheduleRequested(admin, appointmentId, data.id, requestedDate, requestedTime); } catch (notificationError) { console.error("Unable to notify staff about reschedule request:", notificationError); }
    return NextResponse.json({ request: serialize(data as unknown as RequestRow) });
  } catch (error) {
    console.error("Unable to create reschedule request:", error);
    return NextResponse.json({ error: "Unable to submit the reschedule request." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requestUser(request);
  if (!user || !isApprover(await roleFor(user))) return NextResponse.json({ error: "Only the doctor can review reschedule requests." }, { status: 403 });
  try {
    const body = await request.json();
    const requestId = String(body.requestId || "");
    const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
    const reviewNote = String(body.reviewNote || "").trim().slice(0, 1000);
    if (!requestId || !decision) return NextResponse.json({ error: "Invalid review action." }, { status: 400 });
    const admin = adminClient();
    const { data: pending, error: pendingError } = await admin.from("appointment_reschedule_requests").select("id, appointment_id, requested_date, requested_time, status, appointments(appointment_date, appointment_time, status)").eq("id", requestId).single();
    if (pendingError || !pending) return NextResponse.json({ error: "Reschedule request not found." }, { status: 404 });
    if (pending.status !== "pending") return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
    const appointment = first(pending.appointments as { appointment_date: string; appointment_time: string; status: string } | { appointment_date: string; appointment_time: string; status: string }[]);
    if (!appointment || appointment.status !== "confirmed") return NextResponse.json({ error: "The appointment is no longer eligible for rescheduling." }, { status: 409 });
    if (decision === "approved") {
      const slotError = await validateSlot(pending.requested_date, pending.requested_time, pending.appointment_id);
      if (slotError) return NextResponse.json({ error: slotError }, { status: 409 });
      const { error: moveError } = await admin.from("appointments").update({ appointment_date: pending.requested_date, appointment_time: pending.requested_time }).eq("id", pending.appointment_id).eq("status", "confirmed");
      if (moveError?.code === "23505") return NextResponse.json({ error: "That requested slot has already been booked." }, { status: 409 });
      if (moveError) throw moveError;
    }
    const { error: reviewError } = await admin.from("appointment_reschedule_requests").update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: reviewNote || null, updated_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending");
    if (reviewError) {
      if (decision === "approved") await admin.from("appointments").update({ appointment_date: appointment.appointment_date, appointment_time: appointment.appointment_time }).eq("id", pending.appointment_id);
      throw reviewError;
    }
    try { await notifyRescheduleDecision(admin, pending.appointment_id, requestId, decision); } catch (notificationError) { console.error("Unable to notify patient about reschedule decision:", notificationError); }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to review reschedule request:", error);
    return NextResponse.json({ error: "Unable to review the reschedule request." }, { status: 500 });
  }
}
