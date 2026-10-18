import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function admin() {
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function userFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function canManage(user: User | null) {
  if (!user) return false;
  const { data } = await admin().from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = String(data?.role || user.app_metadata?.role || "");
  return ["doctor", "superadmin", "secretary"].includes(role);
}

function validIds(value: unknown) {
  return Array.isArray(value) && value.every((id) => typeof id === "string" && UUID.test(id)) ? value as string[] : null;
}

export async function PATCH(request: Request) {
  if (!await canManage(await userFor(request))) return NextResponse.json({ error: "Clinic staff access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const serviceIds = validIds(body.serviceIds);
    const productIds = validIds(body.productIds);
    if (!serviceIds || !productIds || new Set(serviceIds).size !== serviceIds.length || new Set(productIds).size !== productIds.length) {
      return NextResponse.json({ error: "The catalog order contains invalid or duplicate items." }, { status: 400 });
    }

    const db = admin();
    const [{ data: services, error: servicesError }, { data: categories, error: categoriesError }, { data: products, error: productsError }] = await Promise.all([
      db.from("services").select("id, category_id, slug").eq("is_active", true),
      db.from("service_categories").select("id, slug"),
      db.from("products").select("id").eq("is_active", true),
    ]);
    if (servicesError || categoriesError || productsError) throw servicesError || categoriesError || productsError;
    const hiddenCategoryIds = new Set((categories || []).filter((item) => ["consultations", "package-bookings"].includes(item.slug)).map((item) => item.id));
    const activeServiceIds = (services || []).filter((item) => item.slug !== "glow-plans-package-booking" && !hiddenCategoryIds.has(item.category_id)).map((item) => item.id);
    const activeProductIds = (products || []).map((item) => item.id);
    if (serviceIds.length !== activeServiceIds.length || productIds.length !== activeProductIds.length || activeServiceIds.some((id) => !serviceIds.includes(id)) || activeProductIds.some((id) => !productIds.includes(id))) {
      return NextResponse.json({ error: "The catalog changed while you were arranging it. Reload and try again." }, { status: 409 });
    }

    const updates = [
      ...serviceIds.map((id, index) => db.from("services").update({ sort_order: (index + 1) * 10 }).eq("id", id)),
      ...productIds.map((id, index) => db.from("products").update({ sort_order: (index + 1) * 10 }).eq("id", id)),
    ];
    const results = await Promise.all(updates);
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Unable to save catalog order:", error);
    return NextResponse.json({ error: "Unable to save the booking catalog order." }, { status: 500 });
  }
}
