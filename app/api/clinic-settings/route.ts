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

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(request: Request) {
  if (!await authorize(request)) return NextResponse.json({ error: "Doctor or superadmin access is required." }, { status: 403 });
  try {
    const db = adminClient();
    const [{ data: settings, error: settingsError }, { data: categories, error: categoryError }, { data: services, error: servicesError }, { data: products, error: productsError }] = await Promise.all([
      db.from("clinic_settings").select("*").eq("id", 1).single(),
      db.from("service_categories").select("id, name, slug, sort_order").order("sort_order"),
      db.from("services").select("id, category_id, subcategory, name, slug, description, price, price_note, duration_mins, is_active, sort_order").eq("is_active", true).order("sort_order"),
      db.from("products").select("id, category, subcategory, name, description, price, is_active, sort_order").eq("is_active", true).order("sort_order"),
    ]);
    if (settingsError || categoryError || servicesError || productsError) throw settingsError || categoryError || servicesError || productsError;
    return NextResponse.json({ settings, categories: categories || [], services: services || [], products: products || [] });
  } catch (error) {
    console.error("Unable to load clinic settings:", error);
    return NextResponse.json({ error: "Unable to load clinic settings. Apply the latest database migration first." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await authorize(request)) return NextResponse.json({ error: "Doctor or superadmin access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const db = adminClient();
    const name = String(body.name || "").trim();
    const price = Number(body.price);
    if (!name || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Enter a name and a non-negative price." }, { status: 400 });
    if (body.type === "service") {
      const categoryId = String(body.categoryId || "");
      const duration = Number(body.durationMins);
      const subcategory = String(body.subcategory || "").trim();
      const slug = slugify(String(body.slug || name));
      if (!UUID.test(categoryId) || !subcategory || !slug || !Number.isInteger(duration) || duration < 5 || duration > 480) return NextResponse.json({ error: "Choose a category and subcategory, then enter a duration between 5 and 480 minutes." }, { status: 400 });
      const { data, error } = await db.from("services").insert({ category_id: categoryId, subcategory, name, slug, description: String(body.description || "").trim() || null, price, duration_mins: duration, is_active: true }).select("id, category_id, subcategory, name, slug, description, price, price_note, duration_mins, is_active, sort_order").single();
      if (error?.code === "23505") return NextResponse.json({ error: "A service with this name or slug already exists." }, { status: 409 });
      if (error) throw error;
      return NextResponse.json({ service: data }, { status: 201 });
    }
    if (body.type === "product") {
      const category = String(body.category || "Clinic Package").trim();
      const subcategory = String(body.subcategory || "").trim();
      if (!subcategory) return NextResponse.json({ error: "Choose a package subcategory." }, { status: 400 });
      const { data, error } = await db.from("products").insert({ category, subcategory, name, description: String(body.description || "").trim() || null, price, is_active: true }).select("id, category, subcategory, name, description, price, is_active, sort_order").single();
      if (error) throw error;
      return NextResponse.json({ product: data }, { status: 201 });
    }
    return NextResponse.json({ error: "Unknown catalog item type." }, { status: 400 });
  } catch (error) {
    console.error("Unable to add catalog item:", error);
    return NextResponse.json({ error: "Unable to add the catalog item." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!await authorize(request)) return NextResponse.json({ error: "Doctor or superadmin access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const id = String(body.id || "");
    const table = body.type === "service" ? "services" : body.type === "product" ? "products" : null;
    if (!table || !UUID.test(id)) return NextResponse.json({ error: "Choose a valid catalog item to remove." }, { status: 400 });

    const db = adminClient();
    const { error: deleteError } = await db.from(table).delete().eq("id", id);
    if (!deleteError) return NextResponse.json({ removed: true, archived: false });

    // Existing appointments and orders deliberately restrict hard deletion.
    // Keep their historical reference intact, but remove the item everywhere
    // patients can create a new booking.
    if (deleteError.code === "23503") {
      const { error: archiveError } = await db.from(table).update({ is_active: false }).eq("id", id);
      if (archiveError) throw archiveError;
      return NextResponse.json({ removed: true, archived: true });
    }
    throw deleteError;
  } catch (error) {
    console.error("Unable to remove catalog item:", error);
    return NextResponse.json({ error: "Unable to remove the catalog item." }, { status: 500 });
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
      const categoryId = String(body.categoryId || "");
      const subcategory = String(body.subcategory || "").trim();
      const duration = Number(body.durationMins);
      if (!UUID.test(id) || !UUID.test(categoryId) || !subcategory || !name || !Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration < 5 || duration > 480) return NextResponse.json({ error: "Enter valid category, subcategory, service details, price, and duration." }, { status: 400 });
      const update: Record<string, unknown> = { name, category_id: categoryId, subcategory, description: String(body.description || "").trim() || null, price, duration_mins: duration };
      if (typeof body.isActive === "boolean") update.is_active = body.isActive;
      const { data, error } = await db.from("services").update(update).eq("id", id).select("id, category_id, subcategory, name, slug, description, price, price_note, duration_mins, is_active").single();
      if (error) throw error;
      return NextResponse.json({ service: data });
    }
    if (body.type === "product") {
      const id = String(body.id || "");
      const price = Number(body.price);
      const name = String(body.name || "").trim();
      const category = String(body.category || "").trim();
      const subcategory = String(body.subcategory || "").trim();
      if (!UUID.test(id) || !name || !category || !subcategory || !Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Enter a valid package name, category, subcategory, and non-negative price." }, { status: 400 });
      const update: Record<string, unknown> = { name, category, subcategory, description: String(body.description || "").trim() || null, price };
      if (typeof body.isActive === "boolean") update.is_active = body.isActive;
      const { data, error } = await db.from("products").update(update).eq("id", id).select("id, category, subcategory, name, description, price, is_active").single();
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
