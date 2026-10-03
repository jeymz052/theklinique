import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function admin() {
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !url || !anonKey) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const auth = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authData, error: authError } = await auth.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

    const query = new URL(request.url).searchParams;
    const start = query.get("start") || "";
    const end = query.get("end") || "";
    if (!DATE.test(start) || !DATE.test(end) || start > end) return NextResponse.json({ error: "Enter a valid calendar range." }, { status: 400 });

    const db = admin();
    const [{ data: profile }, { data: appointments, error: appointmentError }, { data: blocks, error: blockError }] = await Promise.all([
      db.from("profiles").select("role").eq("id", authData.user.id).maybeSingle(),
      db.from("appointments").select("id, reference_no, appointment_date, appointment_time, status, clients(full_name, email), services(name, service_categories(name, calendar_color))").gte("appointment_date", start).lte("appointment_date", end).neq("status", "cancelled").order("appointment_date").order("appointment_time"),
      db.from("blocked_dates").select("id, blocked_date, reason").gte("blocked_date", start).lte("blocked_date", end).order("blocked_date"),
    ]);
    if (appointmentError || blockError) throw appointmentError || blockError;
    const staff = ["doctor", "superadmin", "secretary"].includes(String(profile?.role));
    const email = (authData.user.email || "").toLowerCase();
    const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;
    const events = (appointments || []).map((row) => {
      const client = first(row.clients as { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null);
      const service = first(row.services as { name: string; service_categories:{name:string;calendar_color:string}|{name:string;calendar_color:string}[]|null } | { name: string; service_categories:{name:string;calendar_color:string}|{name:string;calendar_color:string}[]|null }[] | null);
      const category = first(service?.service_categories || null);
      const own = Boolean(client?.email && client.email.toLowerCase() === email);
      return { id: row.id, date: row.appointment_date, time: row.appointment_time.slice(0, 5), status: row.status, title: staff || own ? service?.name || "Appointment" : "Booked", category: staff || own ? category?.name || "Appointment" : "Booked", color: category?.calendar_color || "#c65373", patient: staff ? client?.full_name || "Patient" : own ? "My appointment" : "", reference: staff || own ? row.reference_no : "", own };
    });
    return NextResponse.json({ events, blocks: blocks || [], role: profile?.role || "patient" });
  } catch (error) {
    console.error("Unable to load shared calendar:", error);
    return NextResponse.json({ error: "Unable to load the clinic calendar." }, { status: 500 });
  }
}
