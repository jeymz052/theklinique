import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function userFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await auth.auth.getUser();
  return error ? null : data.user;
}

export async function GET(request: Request) {
  const user = await userFor(request);
  if (!user?.email) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (!url || !serviceKey) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const columns = "full_name, email, phone, date_of_birth, address, allergies, medical_history, current_medications, emergency_contact_name, emergency_contact_phone";
    const linked = await admin.from("clients")
      .select(columns)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (linked.error) throw linked.error;
    const fallback = linked.data ? null : await admin.from("clients")
      .select("full_name, email, phone, date_of_birth, address, allergies, medical_history, current_medications, emergency_contact_name, emergency_contact_phone")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    if (fallback?.error) throw fallback.error;
    return NextResponse.json({ profile: linked.data || fallback?.data || null });
  } catch (error) {
    console.error("Unable to load patient booking profile:", error);
    return NextResponse.json({ error: "Unable to load your saved patient details." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await userFor(request);
  if (!user?.email) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (!url || !serviceKey) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  try {
    const body = await request.json();
    const fullName = String(body.fullName || "").trim();
    const phone = String(body.phone || "").trim();
    const dateOfBirth = String(body.dateOfBirth || "");
    if (!fullName || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return NextResponse.json({ error: "Name, phone number, and date of birth are required." }, { status: 400 });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const record = {
      auth_user_id: user.id, full_name: fullName, email: user.email.toLowerCase(), phone, date_of_birth: dateOfBirth,
      address: String(body.address || "").trim() || null,
      emergency_contact_name: String(body.emergencyContactName || "").trim() || null,
      emergency_contact_phone: String(body.emergencyContactPhone || "").trim() || null,
      allergies: String(body.allergies || "").trim() || null,
      medical_history: String(body.medicalHistory || "").trim() || null,
      current_medications: String(body.currentMedications || "").trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("clients").upsert(record, { onConflict: "email" }).select("full_name, email, phone, date_of_birth, address, allergies, medical_history, current_medications, emergency_contact_name, emergency_contact_phone").single();
    if (error) throw error;
    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error("Unable to update patient profile:", error);
    return NextResponse.json({ error: "Unable to update your account details." }, { status: 500 });
  }
}
