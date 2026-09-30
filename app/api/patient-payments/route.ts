import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anon || !service) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const auth = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData } = await auth.auth.getUser();
  if (!authData.user?.email) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: clients, error: clientError } = await admin.from("clients").select("id").eq("email", authData.user.email.toLowerCase());
    if (clientError) throw clientError;
    const clientIds = (clients || []).map((item) => item.id);
    if (!clientIds.length) return NextResponse.json({ payments: [] });
    const { data, error } = await admin.from("payments")
      .select("id, appointment_id, amount, currency, method, status, paymongo_payment_id, paid_at, refunded_at, refund_amount, created_at, appointments!inner(reference_no, appointment_date, appointment_time, visit_kind, client_id, services(name))")
      .in("appointments.client_id", clientIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ payments: data || [] });
  } catch (error) {
    console.error("Unable to load patient payments:", error);
    return NextResponse.json({ error: "Unable to load payment history." }, { status: 500 });
  }
}
