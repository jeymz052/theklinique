import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyReminder } from "@/lib/bookingNotifications";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const target = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dateInManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(target);
  const { data, error } = await admin.from("appointments").select("id, appointment_date, appointment_time").eq("appointment_date", dateInManila).in("status", ["paid", "confirmed"]);
  if (error) return NextResponse.json({ error: "Unable to load reminders." }, { status: 500 });
  const due = (data || []).filter((appointment) => {
    const scheduled = new Date(`${appointment.appointment_date}T${appointment.appointment_time}+08:00`).getTime();
    const hoursUntil = (scheduled - Date.now()) / 3_600_000;
    return hoursUntil >= 23 && hoursUntil <= 25;
  });
  await Promise.all(due.map((appointment) => notifyReminder(admin, appointment.id)));
  return NextResponse.json({ ok: true, processed: due.length });
}
