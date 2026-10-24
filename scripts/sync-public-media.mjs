// Keep Supabase as the CMS source and serve published images from this app.
// Run after publishing new images, then deploy the generated public files.
// Run: node --env-file=.env.local scripts/sync-public-media.mjs
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

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

const urls = new Set();
function collect(value) {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      // Only deliberately public website media; never signed/private objects.
      if (url.origin === new URL(origin).origin && url.pathname.startsWith("/storage/v1/object/public/landing-media/") && !url.search && /\.(png|jpe?g|webp)$/i.test(url.pathname)) urls.add(url.href);
    } catch { /* Ignore content text and local files. */ }
  } else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
}
collect(landing.data.content);
collect(blog.data);

const directory = new URL("../public/website-media/", import.meta.url);
const manifestFile = new URL("../lib/public-media-manifest.json", import.meta.url);
await mkdir(directory, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestFile, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }

let originalBytes = 0;
let optimizedBytes = 0;
let downloaded = 0;
let processed = 0;
let savePending = Promise.resolve();
async function saveManifest() {
  savePending = savePending.then(() => writeFile(manifestFile, `${JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`));
  await savePending;
}
async function downloadImage(url) {
  const head = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!head.ok) throw new Error(`Public image metadata failed (${head.status}).`);
  const size = Number(head.headers.get("content-length"));
  if (!size || size > 50 * 1024 * 1024) throw new Error("Public image has an invalid size or exceeds 50 MB.");
  const chunks = [];
  const downloadUrl = new URL(url);
  downloadUrl.pathname = downloadUrl.pathname.replace("/storage/v1/object/public/", "/storage/v1/object/");
  // Short range requests recover from interrupted large downloads without
  // repeatedly downloading the entire original from Supabase.
  for (let offset = 0; offset < size; offset += 256 * 1024) {
    const end = Math.min(offset + 256 * 1024 - 1, size - 1);
    let chunk;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(downloadUrl, { headers: { Range: `bytes=${offset}-${end}`, apikey: key, Authorization: `Bearer ${key}` }, redirect: "error", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Public image download failed (${response.status}).`);
        chunk = Buffer.from(await response.arrayBuffer());
        if (response.status === 200) {
          if (chunk.length !== size) throw new Error("Incomplete public image download.");
          return chunk; // Server did not support ranges.
        }
        if (chunk.length !== end - offset + 1) throw new Error("Incomplete public image range.");
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        console.log(`Retrying an interrupted image range (${attempt}/3)...`);
      }
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function syncImage(url) {
  const cached = manifest[url];
  if (cached) {
    try {
      await readFile(new URL(`../public${cached.src}`, import.meta.url));
      originalBytes += cached.originalBytes;
      optimizedBytes += cached.bytes;
      processed++;
      return;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  console.log(`Optimizing public image (${processed} of ${urls.size} already complete)...`);
  const bytes = await downloadImage(url);
  const metadata = await sharp(bytes).metadata();
  if ((metadata.pages || 1) > 1) return; // Preserve animated uploads on their existing URL.
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  const filename = `${createHash("sha256").update(data).digest("hex").slice(0, 24)}.webp`;
  await writeFile(new URL(filename, directory), data);
  manifest[url] = { src: `/website-media/${filename}`, width: info.width, height: info.height, bytes: data.length, originalBytes: bytes.length };
  await saveManifest();
  originalBytes += bytes.length;
  optimizedBytes += data.length;
  downloaded++;
  processed++;
}
const sortedUrls = [...urls].sort();
for (let index = 0; index < sortedUrls.length; index += 3) {
  await Promise.all(sortedUrls.slice(index, index + 3).map(syncImage));
}
await saveManifest();
console.log(JSON.stringify({
  publicImages: urls.size,
  downloaded,
  originalBytes,
  optimizedBytes,
  reductionPercent: originalBytes ? Math.round((1 - optimizedBytes / originalBytes) * 1000) / 10 : 0,
  output: fileURLToPath(directory),
  note: "No Supabase objects or database rows were modified. Deploy the generated files and manifest together.",
}, null, 2));
