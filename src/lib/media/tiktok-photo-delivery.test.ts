import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

const {
  createTikTokPhotoDeliveryToken,
  createTikTokPhotoDeliveryUrl,
  verifyTikTokPhotoDeliveryToken,
} = await import("./tiktok-photo-delivery");

test("TikTok Photo delivery token is bound to media id and purpose", () => {
  const token = createTikTokPhotoDeliveryToken("media-1", 1_000);

  assert.equal(verifyTikTokPhotoDeliveryToken(token, "media-1", 1_000), true);
  assert.equal(verifyTikTokPhotoDeliveryToken(token, "media-2", 1_000), false);
  assert.equal(verifyTikTokPhotoDeliveryToken(token, "media-1", 4_601), false);
});

test("TikTok Photo delivery URL uses the AutoPost route without exposing a storage URL", () => {
  const url = new URL(
    createTikTokPhotoDeliveryUrl(
      "media-1",
      "https://autopost.blubuk.dpdns.org",
      1_000,
    ),
  );

  assert.equal(url.origin, "https://autopost.blubuk.dpdns.org");
  assert.equal(url.pathname, "/api/media/tiktok/media-1");
  assert.ok(url.searchParams.get("token"));
  assert.equal(url.searchParams.has("storageKey"), false);
});
