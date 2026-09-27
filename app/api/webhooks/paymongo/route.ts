import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

function isVerified(rawBody: string, signature: string | null) {
  if (!webhookSecret || !signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = parts.t;
  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const received = parts.li || parts.te;
  if (!timestamp || !received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!isVerified(rawBody, request.headers.get("paymongo-signature") || request.headers.get("x-paymongo-signature"))) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);
    const payload = event?.data;
    if (payload?.type !== "checkout_session.payment.paid") return NextResponse.json({ ok: true });

    const checkout = payload?.data;
    const checkoutId = checkout?.id;
    if (typeof checkoutId !== "string" || !supabaseUrl || !serviceRoleKey) return NextResponse.json({ ok: true });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { error } = await admin
      .from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), metadata: { kind: "reservation_fee", checkout_session: checkout, credited_to_visit: true } })
      .eq("paymongo_payment_id", checkoutId)
      .eq("status", "awaiting_payment");
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to process PayMongo webhook:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
