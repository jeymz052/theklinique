import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { BookingSlot, clinicNow, formatSlotLabel, hourlyTimes, isIsoDate, normalizeTime } from "@/lib/bookingAvailability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || "";
  if (!isIsoDate(date)) return NextResponse.json({ error: "Please select a valid date." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return NextResponse.json({ error: "Supabase server credentials are not configured." }, { status: 500 });

  try {
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const [{ data: schedule, error: scheduleError }, { data: blockedDate, error: blockedError }, { data: appointments, error: appointmentsError }] = await Promise.all([
      admin.from("availability_schedules").select("open_time, close_time").eq("day_of_week", dayOfWeek).eq("is_active", true).maybeSingle(),
      admin.from("blocked_dates").select("reason").eq("blocked_date", date).maybeSingle(),
      admin.from("appointments").select("appointment_time").eq("appointment_date", date).not("status", "in", '("cancelled","no_show")'),
    ]);
    if (scheduleError || blockedError || appointmentsError) throw scheduleError || blockedError || appointmentsError;
    if (!schedule) return NextResponse.json({ date, isOpen: false, reason: "The clinic is closed on this day.", slots: [] });

    const now = clinicNow();
    const reserved = new Set((appointments || []).map((item) => normalizeTime(item.appointment_time)));
    const slots: BookingSlot[] = hourlyTimes(schedule.open_time, schedule.close_time).map((time) => ({
      time,
      label: formatSlotLabel(time),
      status: date < now.date || (date === now.date && time <= now.time) ? "past" : blockedDate || reserved.has(time) ? "unavailable" : "available",
    }));
    return NextResponse.json({
      date,
      isOpen: !blockedDate,
      reason: blockedDate ? blockedDate.reason || "The clinic is unavailable on this date." : null,
      hours: `${formatSlotLabel(schedule.open_time)} – ${formatSlotLabel(schedule.close_time)}`,
      slots,
    });
  } catch (error) {
    console.error("Unable to load booking availability:", error);
    return NextResponse.json({ error: "Unable to load appointment availability." }, { status: 500 });
  }
}
