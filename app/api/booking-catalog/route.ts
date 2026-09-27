import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server credentials are not configured." }, { status: 500 });
  }

  try {
    const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const [{ data: categories, error: categoriesError }, { data: services, error: servicesError }, { data: products, error: productsError }] = await Promise.all([
      supabase.from("service_categories").select("id, name, slug, sort_order").order("sort_order"),
      supabase.from("services").select("id, category_id, name, slug, description, price, price_note, duration_mins").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("id, name, description, price, category").eq("is_active", true).order("sort_order"),
    ]);
    if (categoriesError || servicesError || productsError) throw categoriesError || servicesError || productsError;
    return NextResponse.json({ categories: categories || [], services: services || [], products: products || [] });
  } catch (error) {
    console.error("Unable to load booking catalog:", error);
    return NextResponse.json({ error: "Unable to load the appointment catalog." }, { status: 500 });
  }
}
