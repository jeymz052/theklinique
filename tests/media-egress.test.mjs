import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { MediaValidationError, preparePublicMedia } from "../lib/mediaUpload.ts";

test("large transparent uploads become smaller images without losing transparency", async () => {
  const input = await sharp({ create: { width: 3000, height: 2200, channels: 4, background: { r: 210, g: 120, b: 150, alpha: 0.5 } } }).png().toBuffer();
  const output = await preparePublicMedia(new File([input], "clinic.png", { type: "image/png" }));
  const metadata = await sharp(output.bytes).metadata();
  assert.equal(output.contentType, "image/webp");
  assert.equal(output.extension, "webp");
  assert.ok(output.bytes.length < input.length);
  assert.ok(metadata.width <= 1920 && metadata.height <= 1920);
  assert.ok(metadata.hasAlpha);
});

test("unreadable images and unsupported uploads return validation errors", async () => {
  await assert.rejects(preparePublicMedia(new File(["invalid"], "invalid.png", { type: "image/png" })), MediaValidationError);
  await assert.rejects(preparePublicMedia(new File(["document"], "document.pdf", { type: "application/pdf" })), MediaValidationError);
  await assert.rejects(preparePublicMedia(new File([], "empty.png", { type: "image/png" })), MediaValidationError);
});

test("videos retain their original bytes and media type", async () => {
  const input = Buffer.from("video fixture");
  const output = await preparePublicMedia(new File([input], "clip.mp4", { type: "video/mp4" }));
  assert.deepEqual(output.bytes, input);
  assert.equal(output.contentType, "video/mp4");
  assert.equal(output.extension, "mp4");
});
