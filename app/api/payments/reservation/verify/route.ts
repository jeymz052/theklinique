import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyReservationPaid } from "@/lib/bookingNotifications";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY;

function adminClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function requestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !supabaseUrl || !anonKey) return null;
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    if (!user?.email) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    if (!paymongoSecretKey) return NextResponse.json({ error: "PayMongo is not configured." }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const requestedAppointmentId = typeof body?.appointmentId === "string" ? body.appointmentId : null;
    const admin = adminClient();

    const { data: clients, error: clientsError } = await admin.from("clients").select("id").ilike("email", user.email);
    if (clientsError) throw clientsError;
    const clientIds = (clients || []).map((client) => client.id);
    if (!clientIds.length) return NextResponse.json({ confirmed: false, error: "No patient record was found." }, { status: 404 });

    let appointmentQuery = admin.from("appointments").select("id, reference_no, status, visit_kind, payment_expires_at").in("client_id", clientIds).order("created_at", { ascending: false }).limit(1);
    if (requestedAppointmentId) appointmentQuery = appointmentQuery.eq("id", requestedAppointmentId);
    else appointmentQuery = appointmentQuery.in("status", ["pending", "confirmed"]);
    const { data: appointments, error: appointmentError } = await appointmentQuery;
    if (appointmentError) throw appointmentError;
    const appointment = appointments?.[0];
    if (!appointment) return NextResponse.json({ confirmed: false, error: "Appointment not found." }, { status: 404 });
    if (appointment.status === "cancelled") return NextResponse.json({ confirmed: false, error: "This appointment was cancelled and can no longer be confirmed." }, { status: 409 });
    if (appointment.status === "confirmed") return NextResponse.json({ confirmed: true, appointmentId: appointment.id });

    const { data: payment, error: paymentError } = await admin.from("payments").select("id, paymongo_payment_id, status").eq("appointment_id", appointment.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (paymentError) throw paymentError;
    if (appointment.payment_expires_at && new Date(appointment.payment_expires_at).getTime() <= Date.now() && payment?.status !== "paid") {
      await admin.from("appointments").update({ status: "cancelled", cancellation_reason: "Reservation payment deadline expired", cancelled_at: new Date().toISOString() }).eq("id", appointment.id).eq("status", "pending");
      return NextResponse.json({ confirmed: false, error: "The 15-minute payment window expired. Please book again." }, { status: 409 });
    }
    if (!payment?.paymongo_payment_id) return NextResponse.json({ confirmed: false, error: "The reservation checkout was not found." }, { status: 409 });
    if (payment.status === "paid") {
      await admin.from("appointments").update({ status: "confirmed" }).eq("id", appointment.id).eq("status", "pending");
      return NextResponse.json({ confirmed: true, appointmentId: appointment.id });
    }

    const authorization = `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString("base64")}`;
    const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(payment.paymongo_payment_id)}`, { headers: { Authorization: authorization, Accept: "application/json" }, cache: "no-store" });
    const checkout = await response.json();
    if (!response.ok) return NextResponse.json({ confirmed: false, error: "Unable to verify the PayMongo checkout." }, { status: 502 });
    const attributes = checkout?.data?.attributes;
    const paidPayment = Array.isArray(attributes?.payments) ? attributes.payments.find((item: { attributes?: { status?: string } }) => item?.attributes?.status === "paid") : null;
    const succeeded = Boolean(paidPayment || attributes?.payment_intent?.attributes?.status === "succeeded");
    if (!succeeded || attributes?.reference_number !== appointment.reference_no) {
      return NextResponse.json({ confirmed: false, appointmentId: appointment.id });
    }

    const paidAtSeconds = paidPayment?.attributes?.paid_at;
    const paidAt = typeof paidAtSeconds === "number" ? new Date(paidAtSeconds * 1000).toISOString() : new Date().toISOString();
    const isFollowUp = appointment.visit_kind === "consultation_follow_up";
    const { error: paymentUpdateError } = await admin.from("payments").update({ status: "paid", paid_at: paidAt, metadata: isFollowUp ? { kind: "consultation_follow_up_fee", checkout_session: checkout.data, credited_to_visit: false, full_fee: true } : { kind: "reservation_fee", checkout_session: checkout.data, credited_to_visit: true } }).eq("id", payment.id);
    if (paymentUpdateError) throw paymentUpdateError;
    const { error: appointmentUpdateError } = await admin.from("appointments").update({ status: "confirmed" }).eq("id", appointment.id).eq("status", "pending");
    if (appointmentUpdateError) throw appointmentUpdateError;
    try { await notifyReservationPaid(admin, appointment.id); } catch (notificationError) { console.error("Unable to send verified payment notifications:", notificationError); }
    return NextResponse.json({ confirmed: true, appointmentId: appointment.id });
  } catch (error) {
    console.error("Unable to verify reservation payment:", error);
    return NextResponse.json({ error: "Unable to verify the reservation payment." }, { status: 500 });
  }
}
