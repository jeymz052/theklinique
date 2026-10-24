// Read-only audit. Downloads metadata with HEAD, never the media bodies.
// Run: node --env-file=.env.local scripts/audit-storage-egress.mjs
import { createClient } from "@supabase/supabase-js";

const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!origin || !key) throw new Error("Configure Supabase server credentials first.");
const db = createClient(origin, key, { auth: { persistSession: false } });
const [landing, blog] = await Promise.all([
  db.from("landing_content").select("content").eq("id", 1).single(),
  db.from("blog_posts").select("hero_url,blocks").eq("status", "published"),
]);
if (landing.error) throw new Error(`Landing content: ${landing.error.message}`);
if (blog.error) throw new Error(`Blog posts: ${blog.error.message}`);

const assets = new Map();
function collect(value, context) {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.origin !== new URL(origin).origin || !url.pathname.startsWith("/storage/v1/object/public/landing-media/")) return;
      if (!assets.has(url.href)) assets.set(url.href, { contexts: [] });
      assets.get(url.href).contexts.push(context);
    } catch { /* Text and local paths are not storage objects. */ }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${context}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([name, item]) => collect(item, `${context}.${name}`));
  }
}
collect(landing.data.content, "landing");
collect(blog.data, "publishedBlogs");

const rows = [];
const entries = [...assets.entries()];
for (let index = 0; index < entries.length; index += 4) {
  rows.push(...await Promise.all(entries.slice(index, index + 4).map(async ([url, asset]) => {
    const response = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(15000) });
    return {
      file: decodeURIComponent(new URL(url).pathname.split("/").pop()),
      bytes: Number(response.headers.get("content-length")) || 0,
      type: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
      status: response.status,
      usedIn: asset.contexts,
    };
  })));
}
rows.sort((a, b) => b.bytes - a.bytes);
console.log(JSON.stringify({
  uniquePublicAssets: rows.length,
  totalOriginalBytes: rows.reduce((sum, asset) => sum + asset.bytes, 0),
  note: "Sizes are original objects, not measured visitor traffic. No patient data or private storage is inspected.",
  assets: rows,
}, null, 2));
