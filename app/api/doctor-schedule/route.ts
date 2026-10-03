import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isIsoDate, normalizeTime } from "@/lib/bookingAvailability";

export const dynamic = "force-dynamic";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminClient() {
  if (!url || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function requestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function isDoctor(user: User) {
  const email = (user.email || "").toLowerCase().trim();
  if (email === "thekliniqueph@gmail.com" || email === "estebanjames67@gmail.com") return true;
  const claimed = String(user.app_metadata?.role || "");
  if (claimed === "doctor" || claimed === "superadmin") return true;
  const { data } = await adminClient().from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "doctor" || data?.role === "superadmin";
}

async function authorize(request: Request) {
  const user = await requestUser(request);
  return user && await isDoctor(user) ? user : null;
}

export async function GET(request: Request) {
  if (!await authorize(request)) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  try {
    const admin = adminClient();
    const [{ data: schedules, error: scheduleError }, { data: blocks, error: blockError }] = await Promise.all([
      admin.from("availability_schedules").select("id, day_of_week, open_time, close_time, is_active").order("day_of_week"),
      admin.from("blocked_dates").select("id, blocked_date, reason, created_at").order("blocked_date", { ascending: true }),
    ]);
    if (scheduleError || blockError) throw scheduleError || blockError;
    return NextResponse.json({ schedules: schedules || [], blocks: blocks || [] });
  } catch (error) {
    console.error("Unable to load doctor schedule:", error);
    return NextResponse.json({ error: "Unable to load the doctor schedule." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const dayOfWeek = Number(body.dayOfWeek);
    const openTime = normalizeTime(String(body.openTime || ""));
    const closeTime = normalizeTime(String(body.closeTime || ""));
    const isActive = body.isActive === true;
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !TIME_PATTERN.test(openTime) || !TIME_PATTERN.test(closeTime) || openTime >= closeTime) {
      return NextResponse.json({ error: "Choose a valid day and opening/closing time." }, { status: 400 });
    }
    const { data, error } = await adminClient().from("availability_schedules").upsert({
      day_of_week: dayOfWeek,
      open_time: openTime,
      close_time: closeTime,
      is_active: isActive,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }, { onConflict: "day_of_week" }).select("id, day_of_week, open_time, close_time, is_active").single();
    if (error) throw error;
    return NextResponse.json({ schedule: data });
  } catch (error) {
    console.error("Unable to update doctor schedule:", error);
    return NextResponse.json({ error: "Unable to update the doctor schedule." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const startDate = String(body.startDate || body.date || "");
    const endDate = String(body.endDate || startDate);
    const reason = String(body.reason || "").trim();
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
      return NextResponse.json({ error: "Choose a valid date range. The end date must be on or after the start date." }, { status: 400 });
    }
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const totalDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (totalDays > 366) return NextResponse.json({ error: "A blocked-date range cannot exceed 366 days." }, { status: 400 });
    const rows = Array.from({ length: totalDays }, (_, index) => ({
      blocked_date: new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10),
      reason: reason || null,
      created_by: user.id,
    }));
    const { data, error } = await adminClient().from("blocked_dates").upsert(rows, {
      onConflict: "blocked_date",
      ignoreDuplicates: true,
    }).select("id, blocked_date, reason, created_at");
    if (error) throw error;
    return NextResponse.json({ blocks: data || [], added: data?.length || 0, requested: totalDays }, { status: 201 });
  } catch (error) {
    console.error("Unable to block date:", error);
    return NextResponse.json({ error: "Unable to add the blocked date." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!await authorize(request)) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "A valid blocked-date ID is required." }, { status: 400 });
  try {
    const { error } = await adminClient().from("blocked_dates").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unable to remove blocked date:", error);
    return NextResponse.json({ error: "Unable to remove the blocked date." }, { status: 500 });
  }
}
