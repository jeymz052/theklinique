import manifest from "@/lib/public-media-manifest.json";

type PublicAsset = { src: string; width: number; height: number; bytes: number; originalBytes: number };
const publicAssets: Record<string, PublicAsset> = manifest;

export function publicMediaAsset(src: string) {
  return publicAssets[src];
}

export function publicMediaUrl(src: string) {
  return publicMediaAsset(src)?.src || src;
}

export function isOptimizablePublicImage(src: string) {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const url = new URL(src);
    return url.origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.invalid").origin
      && url.pathname.startsWith("/storage/v1/object/public/landing-media/")
      && !url.search;
  } catch {
    return false;
  }
}
