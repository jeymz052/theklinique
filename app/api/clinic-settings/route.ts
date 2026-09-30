import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminClient() {
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function requestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function canManage(user: User) {
  const email = (user.email || "").toLowerCase();
  if (["thekliniqueph@gmail.com", "estebanjames67@gmail.com"].includes(email)) return true;
  if (["doctor", "superadmin"].includes(String(user.app_metadata?.role || ""))) return true;
  const { data } = await adminClient().from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "doctor" || data?.role === "superadmin";
}

async function authorize(request: Request) {
  const user = await requestUser(request);
  return user && await canManage(user) ? user : null;
}

export async function GET(request: Request) {
  if (!await authorize(request)) return NextResponse.json({ error: "Doctor or superadmin access is required." }, { status: 403 });
  try {
    const db = adminClient();
    const [{ data: settings, error: settingsError }, { data: categories, error: categoryError }, { data: services, error: servicesError }, { data: products, error: productsError }] = await Promise.all([
      db.from("clinic_settings").select("*").eq("id", 1).single(),
      db.from("service_categories").select("id, name, slug, sort_order").order("sort_order"),
      db.from("services").select("id, category_id, name, slug, description, price, price_note, duration_mins, is_active, sort_order").order("sort_order"),
      db.from("products").select("id, category, name, description, price, is_active, sort_order").order("sort_order"),
    ]);
    if (settingsError || categoryError || servicesError || productsError) throw settingsError || categoryError || servicesError || productsError;
    return NextResponse.json({ settings, categories: categories || [], services: services || [], products: products || [] });
  } catch (error) {
    console.error("Unable to load clinic settings:", error);
    return NextResponse.json({ error: "Unable to load clinic settings. Apply the latest database migration first." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Doctor or superadmin access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const db = adminClient();
    if (body.type === "service") {
      const id = String(body.id || "");
      const price = Number(body.price);
      const name = String(body.name || "").trim();
      if (!UUID.test(id) || !name || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Enter a valid service name and non-negative price." }, { status: 400 });
      const { data, error } = await db.from("services").update({ name, price }).eq("id", id).select("id, name, price").single();
      if (error) throw error;
      return NextResponse.json({ service: data });
    }
    if (body.type === "product") {
      const id = String(body.id || "");
      const price = Number(body.price);
      const name = String(body.name || "").trim();
      if (!UUID.test(id) || !name || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Enter a valid package name and non-negative price." }, { status: 400 });
      const { data, error } = await db.from("products").update({ name, price }).eq("id", id).select("id, name, price").single();
      if (error) throw error;
      return NextResponse.json({ product: data });
    }
    if (body.type !== "general") return NextResponse.json({ error: "Unknown settings update." }, { status: 400 });
    const value = body.settings || {};
    const fields = ["clinic_name", "doctor_name", "contact_email", "contact_phone", "address", "city", "province", "postal_code"] as const;
    const update = Object.fromEntries(fields.map((field) => [field, String(value[field] || "").trim()]));
    if (!update.clinic_name || !update.doctor_name || !update.contact_email || !update.contact_phone) return NextResponse.json({ error: "Clinic name, doctor, email, and phone are required." }, { status: 400 });
    const { data, error } = await db.from("clinic_settings").update({ ...update, accepts_walk_ins: value.accepts_walk_ins === true, updated_at: new Date().toISOString(), updated_by: user.id }).eq("id", 1).select("*").single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error("Unable to update clinic settings:", error);
    return NextResponse.json({ error: "Unable to update clinic settings." }, { status: 500 });
  }
}
