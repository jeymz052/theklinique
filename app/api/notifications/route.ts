import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { describeBooking, specificNotice } from "@/lib/bookingNotice";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function userFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser();
  return data.user;
}

function adminClient() {
  if (!url || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  const user = await userFor(request);
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { data, error } = await adminClient().from("app_notifications").select("id, event, title, body, href, read_at, created_at, appointments(consultation_mode,visit_kind,services(name,slug,is_package,service_categories(slug)))").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  const notifications = (data || []).map(({ appointments, ...notice }) => {
    const booking = Array.isArray(appointments) ? appointments[0] : appointments;
    if (!booking || notice.title.startsWith(`${describeBooking(booking).label} · `)) return notice;
    return { ...notice, ...specificNotice(booking, notice.title, notice.body) };
  });
  return NextResponse.json({ notifications }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await userFor(request);
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const body = await request.json();
  const query = adminClient().from("app_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id);
  const { error } = body?.all === true ? await query.is("read_at", null) : await query.eq("id", String(body?.id || ""));
  if (error) return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
