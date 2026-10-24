import sharp from "sharp";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm" };

export class MediaValidationError extends Error {}

export async function preparePublicMedia(file: File) {
  if (!file.size || file.size > 50 * 1024 * 1024) throw new MediaValidationError("Choose media up to 50 MB.");
  if (!allowedTypes.has(file.type)) throw new MediaValidationError("Use JPG, PNG, WebP, GIF, MP4, or WebM.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const original = { bytes, contentType: file.type, extension: extensions[file.type] };
  if (!file.type.startsWith("image/")) return original;

  try {
    const metadata = await sharp(bytes).metadata();
    if ((metadata.pages || 1) > 1) return original;
    const optimized = await sharp(bytes)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    // Keep tiny images when re-encoding would increase their size.
    return optimized.length < bytes.length
      ? { bytes: optimized, contentType: "image/webp", extension: "webp" }
      : original;
  } catch {
    throw new MediaValidationError("This image could not be read. Choose a valid JPG, PNG, WebP, or GIF.");
  }
}
