import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { clinicNow, isIsoDate } from "@/lib/bookingAvailability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return NextResponse.json({ error: "Supabase server credentials are not configured." }, { status: 500 });
  const params = new URL(request.url).searchParams;
  const start = params.get("start") || clinicNow().date;
  const end = params.get("end");
  if (!isIsoDate(start) || (end && (!isIsoDate(end) || end < start))) return NextResponse.json({ error: "Please provide a valid blocked-date range." }, { status: 400 });
  try {
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    let query = admin.from("blocked_dates").select("blocked_date, reason").gte("blocked_date", start).order("blocked_date").limit(366);
    if (end) query = query.lte("blocked_date", end);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ blocks: data || [] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Unable to load public blocked dates:", error);
    return NextResponse.json({ error: "Unable to load blocked dates." }, { status: 500 });
  }
}
