import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { RESERVATION_FEE_CENTAVOS, RESERVATION_FEE_PHP } from "@/lib/reservation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY;

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function getRequestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !supabaseUrl || !anonKey) return null;
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user?.email) return NextResponse.json({ error: "Sign in is required to pay the reservation fee." }, { status: 401 });
    if (!paymongoSecretKey) return NextResponse.json({ error: "PayMongo is not configured yet. Add PAYMONGO_SECRET_KEY to enable reservation payments." }, { status: 503 });

    const { appointmentId } = await request.json();
    if (typeof appointmentId !== "string") return NextResponse.json({ error: "Invalid appointment." }, { status: 400 });

    const admin = getAdminClient();
    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select("id, reference_no, clients!inner(email, full_name, phone)")
      .eq("id", appointmentId)
      .eq("clients.email", user.email)
      .single();
    if (appointmentError || !appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    const client = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients;
    if (!client) return NextResponse.json({ error: "Patient details were not found for this appointment." }, { status: 404 });

    const origin = new URL(request.url).origin;
    const authorization = `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString("base64")}`;
    const paymongoResponse = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        data: {
          attributes: {
            billing: {
              name: client.full_name,
              email: client.email,
              phone: client.phone,
            },
            line_items: [{ amount: RESERVATION_FEE_CENTAVOS, currency: "PHP", name: "The Klinique reservation fee", quantity: 1 }],
            payment_method_types: ["qrph"],
            description: `Reservation fee for ${appointment.reference_no}`,
            reference_number: appointment.reference_no,
            success_url: `${origin}/booking?payment=return`,
            cancel_url: `${origin}/booking?payment=cancelled`,
          },
        },
      }),
    });
    const paymongo = await paymongoResponse.json();
    if (!paymongoResponse.ok) {
      console.error("PayMongo checkout error:", paymongo);
      return NextResponse.json({ error: "Unable to create the PayMongo checkout session." }, { status: 502 });
    }

    const checkoutUrl = paymongo?.data?.attributes?.checkout_url;
    if (typeof checkoutUrl !== "string") return NextResponse.json({ error: "PayMongo did not return a checkout URL." }, { status: 502 });

    await admin
      .from("payments")
      .update({ paymongo_payment_id: paymongo.data.id, status: "awaiting_payment", metadata: { kind: "reservation_fee", checkout_id: paymongo.data.id, credited_to_visit: true } })
      .eq("appointment_id", appointment.id)
      .eq("amount", RESERVATION_FEE_PHP);

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    console.error("Unable to create reservation checkout:", error);
    return NextResponse.json({ error: "Unable to start the reservation payment." }, { status: 500 });
  }
}
