import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { MediaValidationError, preparePublicMedia } from "@/lib/mediaUpload";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !url || !anonKey || !serviceKey) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const auth = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await db.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (!["doctor", "superadmin", "secretary"].includes(String(profile?.role))) return NextResponse.json({ error: "Clinic staff access is required." }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose media up to 50 MB." }, { status: 400 });
    const media = await preparePublicMedia(file);
    const path = `blog/${userData.user.id}/${Date.now()}-${crypto.randomUUID()}.${media.extension}`;
    const { error } = await db.storage.from("landing-media").upload(path, media.bytes, {
      contentType: media.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;
    const { data } = db.storage.from("landing-media").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, type: media.contentType.startsWith("video/") ? "video" : "image" }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Unable to upload blog media:", error);
    return NextResponse.json({ error: "Unable to upload blog media." }, { status: 500 });
  }
}
