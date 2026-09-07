import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  ACCEPTED_UPLOAD_MIME_TYPES,
  captionLimitConstrainers,
  captionLimitFor,
  MAX_REMOTE_DOWNLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  mimeTypeToMediaType,
  PLATFORM_LIMITS,
  REMOTE_FETCH_TIMEOUT_MS,
  UPLOAD_HINT,
} from "@/lib/validation/limits";
import { PLATFORMS } from "@/lib/status";

describe("captionLimitFor", () => {
  test("the strictest selected platform wins", () => {
    assert.equal(captionLimitFor(["instagram", "facebook"]), 2_200);
    assert.equal(captionLimitFor(["facebook"]), 63_206);
    assert.equal(captionLimitFor(["facebook", "instagram"]), 2_200);
    assert.equal(captionLimitFor(["instagram", "facebook", "tiktok"]), 2_200);
  });

  test("an empty selection falls back to the Instagram-safe limit", () => {
    assert.equal(captionLimitFor([]), 2_200);
  });

  test("single platforms use their own limit", () => {
    assert.equal(captionLimitFor(["instagram"]), 2_200);
    assert.equal(captionLimitFor(["tiktok"]), 2_200);
  });

  test("the limit never exceeds every platform's own limit", () => {
    for (const platform of PLATFORMS) {
      assert.ok(
        captionLimitFor(PLATFORMS) <= PLATFORM_LIMITS[platform].captionLength,
      );
    }
  });
});

describe("captionLimitConstrainers", () => {
  test("names only the platforms that set the limit", () => {
    assert.deepEqual(
      captionLimitConstrainers(["instagram", "facebook", "tiktok"], 2_200),
      ["instagram", "tiktok"],
    );
    assert.deepEqual(
      captionLimitConstrainers(["instagram", "facebook", "tiktok"], 63_206),
      ["facebook"],
    );
    assert.deepEqual(captionLimitConstrainers(["facebook"], 63_206), ["facebook"]);
    assert.deepEqual(captionLimitConstrainers([], 2_200), []);
  });

  test("the constrainer set is consistent with captionLimitFor", () => {
    const limit = captionLimitFor(PLATFORMS);
    const constrainers = captionLimitConstrainers(PLATFORMS, limit);
    assert.deepEqual(constrainers, ["instagram", "tiktok"]);
    assert.equal(captionLimitFor(constrainers), limit);
  });
});

describe("mimeTypeToMediaType", () => {
  test("maps the accepted types", () => {
    assert.equal(mimeTypeToMediaType("image/jpeg"), "image");
    assert.equal(mimeTypeToMediaType("image/png"), "image");
    assert.equal(mimeTypeToMediaType("image/webp"), "image");
    assert.equal(mimeTypeToMediaType("video/mp4"), "video");
    assert.equal(mimeTypeToMediaType("video/quicktime"), "video");
  });

  test("rejects everything else", () => {
    assert.equal(mimeTypeToMediaType("image/gif"), null);
    assert.equal(mimeTypeToMediaType("application/pdf"), null);
    assert.equal(mimeTypeToMediaType("video/webm"), null);
    assert.equal(mimeTypeToMediaType(""), null);
  });
});

describe("upload allow-list", () => {
  test("the accepted mime types and extensions agree", () => {
    assert.deepEqual([...ACCEPTED_UPLOAD_MIME_TYPES], [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ]);
    assert.deepEqual([...ACCEPTED_UPLOAD_EXTENSIONS], [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".mp4",
      ".mov",
    ]);
  });

  test("every accepted mime type maps to a media type", () => {
    for (const mimeType of ACCEPTED_UPLOAD_MIME_TYPES) {
      assert.notEqual(mimeTypeToMediaType(mimeType), null, mimeType);
    }
  });

  test("size and timeout budgets", () => {
    assert.equal(MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
    assert.equal(MAX_REMOTE_DOWNLOAD_BYTES, 50 * 1024 * 1024);
    assert.equal(REMOTE_FETCH_TIMEOUT_MS, 15_000);
  });

  test("the upload hint names the formats a user recognises", () => {
    assert.equal(UPLOAD_HINT, "JPEG, PNG, WebP, MP4 or MOV · up to 50 MB");
  });
});

describe("PLATFORM_LIMITS", () => {
  test("covers exactly the three supported platforms", () => {
    assert.deepEqual(Object.keys(PLATFORM_LIMITS), ["instagram", "facebook", "tiktok"]);
  });

  test("captions respect the documented platform caps", () => {
    assert.equal(PLATFORM_LIMITS.instagram.captionLength, 2_200);
    assert.equal(PLATFORM_LIMITS.tiktok.captionLength, 2_200);
    assert.equal(PLATFORM_LIMITS.facebook.captionLength, 63_206);
  });

  test("video duration bounds are the ones the platforms publish", () => {
    assert.equal(PLATFORM_LIMITS.instagram.minDurationSec, 3);
    assert.equal(PLATFORM_LIMITS.instagram.maxDurationSec, 90);
    assert.equal(PLATFORM_LIMITS.facebook.minDurationSec, 1);
    assert.equal(PLATFORM_LIMITS.facebook.maxDurationSec, 600);
    assert.equal(PLATFORM_LIMITS.tiktok.minDurationSec, 3);
    assert.equal(PLATFORM_LIMITS.tiktok.maxDurationSec, 600);
  });

  test("every platform accepts exactly the uploaded allow-list's images and videos", () => {
    for (const platform of PLATFORMS) {
      const limits = PLATFORM_LIMITS[platform];
      assert.deepEqual([...limits.imageMimeTypes], [
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);
      assert.deepEqual([...limits.videoMimeTypes], ["video/mp4", "video/quicktime"]);
       assert.ok(limits.maxBytes >= MAX_UPLOAD_BYTES);
    }
  });

  test("Instagram is the only platform with an upper resolution bound", () => {
    assert.equal(PLATFORM_LIMITS.instagram.maxWidth, 4_096);
    assert.equal(PLATFORM_LIMITS.instagram.maxHeight, 4_096);
    assert.equal(PLATFORM_LIMITS.instagram.minWidth, 320);
    assert.equal(PLATFORM_LIMITS.instagram.minHeight, 320);
    assert.equal(PLATFORM_LIMITS.facebook.maxWidth, undefined);
    assert.equal(PLATFORM_LIMITS.tiktok.maxWidth, undefined);
    assert.equal(PLATFORM_LIMITS.facebook.minWidth, 200);
    assert.equal(PLATFORM_LIMITS.tiktok.minWidth, 200);
  });
});
