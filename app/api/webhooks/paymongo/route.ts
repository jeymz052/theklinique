import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyReservationPaid } from "@/lib/bookingNotifications";
import { bookingPayment } from "@/lib/consultation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function isVerified(rawBody: string, signature: string | null, livemode: boolean) {
  if (!webhookSecret || !signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = parts.t;
  const timestampSeconds = Number(timestamp);
  if (!timestamp || !Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const received = livemode ? parts.li : parts.te;
  if (!received || !/^[a-f0-9]{64}$/i.test(received) || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const eventAttributes = event?.data?.attributes;
  if (typeof eventAttributes?.livemode !== "boolean") {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (!isVerified(rawBody, request.headers.get("paymongo-signature"), eventAttributes.livemode)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  try {
    if (eventAttributes?.type !== "checkout_session.payment.paid") return NextResponse.json({ ok: true });

    const checkout = eventAttributes?.data;
    const checkoutId = checkout?.id;
    if (typeof checkoutId !== "string" || !supabaseUrl || !serviceRoleKey) return NextResponse.json({ ok: true });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const reference = checkout?.attributes?.reference_number;
    if (typeof reference !== "string") return NextResponse.json({ error: "Missing appointment reference." }, { status: 400 });
    const lookup = await admin.from("appointments").select("id, consultation_mode, visit_kind").eq("reference_no", reference).maybeSingle();
    if (lookup.error) throw lookup.error;
    if (!lookup.data) return NextResponse.json({ ok: true });
    const terms = bookingPayment(lookup.data.consultation_mode === "online" ? "online" : "clinic", lookup.data.visit_kind === "consultation_follow_up");
    const paidPayment = checkout.attributes.payments?.find((item: { attributes?: { status?: string } }) => item.attributes?.status === "paid");
    const paidAttributes = paidPayment?.attributes || checkout.attributes.payment_intent?.attributes;
    if (paidAttributes?.amount !== terms.amount * 100 || paidAttributes?.currency !== "PHP") return NextResponse.json({ error: "Payment amount does not match the appointment fee." }, { status: 400 });
    const paymentUpdate = await admin.from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), paymongo_payment_id: checkoutId, metadata: { ...terms, checkout_session: checkout } })
      .eq("appointment_id", lookup.data.id).eq("amount", terms.amount)
      .in("status", ["awaiting_payment", "waived"]).select("appointment_id");
    const payments = paymentUpdate.data;
    if (paymentUpdate.error) throw paymentUpdate.error;
    const appointmentIds = (payments || []).map((payment) => payment.appointment_id).filter(Boolean);
    if (appointmentIds.length) {
      const { data: confirmedAppointments, error: appointmentError } = await admin
        .from("appointments")
        .update({ status: "confirmed" })
        .in("id", appointmentIds)
        .in("status", ["pending", "confirmed"])
        .select("id");
      if (appointmentError) throw appointmentError;
      await Promise.all((confirmedAppointments || []).map(async ({ id: appointmentId }) => {
        try {
          await notifyReservationPaid(admin, appointmentId);
        } catch (notificationError) {
          console.error("Unable to send payment notifications:", notificationError);
        }
      }));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to process PayMongo webhook:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
