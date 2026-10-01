import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

const { createTikTokPhotoDeliveryToken } = await import("@/lib/media/tiktok-photo-delivery");
const { handleTikTokPhotoGet } = await import("./tiktok/[id]/route");

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    findMedia: async () => ({
      mediaType: "image",
      mimeType: "image/jpeg",
      storageKey: "private/user-1/photo.jpg",
      ...overrides,
    }),
    download: async () => ({
      bytes: jpegBytes,
      mimeType: "image/jpeg",
      size: jpegBytes.byteLength,
    }),
  };
}

test("TikTok Photo route is anonymous and returns JPEG bytes directly", async () => {
  const token = createTikTokPhotoDeliveryToken("media-1");
  const response = await handleTikTokPhotoGet(
    new Request(`https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1?token=${token}`),
    "media-1",
    dependencies(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), jpegBytes);
});

test("TikTok Photo route rejects missing or mismatched bearer tokens", async () => {
  const missing = await handleTikTokPhotoGet(
    new Request("https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1"),
    "media-1",
    dependencies(),
  );
  assert.equal(missing.status, 401);

  const wrong = await handleTikTokPhotoGet(
    new Request(
      `https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1?token=${createTikTokPhotoDeliveryToken("media-2")}`,
    ),
    "media-1",
    dependencies(),
  );
  assert.equal(wrong.status, 401);

  const expired = await handleTikTokPhotoGet(
    new Request(
      `https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1?token=${createTikTokPhotoDeliveryToken("media-1", Math.floor(Date.now() / 1000) - 3_601)}`,
    ),
    "media-1",
    dependencies(),
  );
  assert.equal(expired.status, 401);
});

test("TikTok Photo route never treats a non-JPEG row or bytes as a photo", async () => {
  const rowMismatch = await handleTikTokPhotoGet(
    new Request(
      `https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1?token=${createTikTokPhotoDeliveryToken("media-1")}`,
    ),
    "media-1",
    dependencies({ mimeType: "image/png" }),
  );
  assert.equal(rowMismatch.status, 404);

  const bytesMismatch = await handleTikTokPhotoGet(
    new Request(
      `https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1?token=${createTikTokPhotoDeliveryToken("media-1")}`,
    ),
    "media-1",
    {
      ...dependencies(),
      download: async () => ({
        bytes: new Uint8Array(12),
        mimeType: "image/jpeg",
        size: 12,
      }),
    },
  );
  assert.equal(bytesMismatch.status, 404);
});

test("TikTok Photo route returns WebP bytes with the WebP content type", async () => {
  const token = createTikTokPhotoDeliveryToken("media-webp");
  const response = await handleTikTokPhotoGet(
    new Request(`https://autopost.blubuk.dpdns.org/api/media/tiktok/media-webp?token=${token}`),
    "media-webp",
    {
      findMedia: async () => ({
        mediaType: "image",
        mimeType: "image/webp",
        storageKey: "private/user-1/photo.webp",
      }),
      download: async () => ({
        bytes: webpBytes,
        mimeType: "image/webp",
        size: webpBytes.byteLength,
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("location"), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), webpBytes);
});
