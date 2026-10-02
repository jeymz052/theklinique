import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeLandingSocialContent } from "@/lib/landing-social";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function admin() { if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured."); return createClient(url, serviceKey, { auth: { persistSession: false } }); }
async function userFor(request: Request) { const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); if (!token || !url || !anonKey) return null; const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }); const { data } = await client.auth.getUser(); return data.user; }
async function canManage(user: User | null) { if (!user) return false; const { data } = await admin().from("profiles").select("role").eq("id", user.id).maybeSingle(); return ["doctor", "superadmin", "secretary"].includes(String(data?.role)) || ["doctor", "superadmin", "secretary"].includes(String(user.app_metadata?.role)); }

async function resolveFacebookShareUrl(value: string) {
  try {
    const source = new URL(value);
    if (!/(^|\.)facebook\.com$/i.test(source.hostname) || !source.pathname.toLowerCase().startsWith("/share/")) return value;
    const response = await fetch(source, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
    const location = response.headers.get("location");
    if (!location) return value;
    const resolved = new URL(location, source);
    if (!/(^|\.)facebook\.com$/i.test(resolved.hostname)) return value;
    resolved.protocol = "https:";
    resolved.hostname = "www.facebook.com";
    resolved.searchParams.delete("rdid");
    resolved.searchParams.delete("share_url");
    return resolved.toString();
  } catch {
    return value;
  }
}

async function resolveLandingSocialLinks(content: Record<string, unknown>) {
  const normalized = normalizeLandingSocialContent(content);
  const posts = Array.isArray(normalized.socialPosts) ? await Promise.all(normalized.socialPosts.map(async (post) => {
    if (!post || typeof post !== "object" || typeof post.url !== "string") return post;
    return { ...post, url: await resolveFacebookShareUrl(post.url) };
  })) : normalized.socialPosts;
  const socialPostUrl = typeof normalized.socialPostUrl === "string" ? await resolveFacebookShareUrl(normalized.socialPostUrl) : normalized.socialPostUrl;
  return { ...normalized, socialPostUrl, socialPosts: posts };
}

export async function GET() {
  try { const { data, error } = await admin().from("landing_content").select("content, updated_at").eq("id", 1).single(); if (error) throw error; return NextResponse.json(data); }
  catch (error) { console.error("Unable to load landing content:", error); return NextResponse.json({ error: "Unable to load website content." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const user = await userFor(request); if (!await canManage(user)) return NextResponse.json({ error: "Clinic staff access is required." }, { status: 403 });
  try { const body = await request.json(); if (!body.content || typeof body.content !== "object") return NextResponse.json({ error: "Website content is required." }, { status: 400 }); const content = await resolveLandingSocialLinks(body.content); const { data, error } = await admin().from("landing_content").update({ content, updated_at: new Date().toISOString(), updated_by: user!.id }).eq("id", 1).select("content, updated_at").single(); if (error) throw error; return NextResponse.json(data); }
  catch (error) { console.error("Unable to save landing content:", error); return NextResponse.json({ error: "Unable to save website content." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await userFor(request); if (!await canManage(user)) return NextResponse.json({ error: "Clinic staff access is required." }, { status: 403 });
  try { const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image, GIF, or video." }, { status: 400 }); if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "Media must be 50 MB or smaller." }, { status: 400 }); const allowed = ["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm"]; if (!allowed.includes(file.type)) return NextResponse.json({ error: "Use JPG, PNG, WebP, GIF, MP4, or WebM." }, { status: 400 }); const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin"; const path = `${user!.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`; const bytes = new Uint8Array(await file.arrayBuffer()); const { error } = await admin().storage.from("landing-media").upload(path, bytes, { contentType: file.type, upsert: false }); if (error) throw error; const { data } = admin().storage.from("landing-media").getPublicUrl(path); return NextResponse.json({ url: data.publicUrl, path, type: file.type.startsWith("video/") ? "video" : "image", alt: file.name.replace(/\.[^.]+$/, "") }, { status: 201 }); }
  catch (error) { console.error("Unable to upload landing media:", error); return NextResponse.json({ error: "Unable to upload media. Apply the website-content migration first." }, { status: 500 }); }
}
