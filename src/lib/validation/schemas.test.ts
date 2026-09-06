import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  captionSchema,
  createPostSchema,
  loginSchema,
  mediaUrlSchema,
  postMediaSchema,
  scheduleSchema,
} from "@/lib/validation/schemas";

const VALID_MEDIA = {
  kind: "upload",
  storageKey: "user-1/post-1.jpg",
  sourceUrl: null,
  mediaType: "image",
  mimeType: "image/jpeg",
  fileSize: 2 * 1024 * 1024,
  width: 1080,
  height: 1080,
  duration: null,
} as const;

function issuePaths(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

function issueMessages(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("loginSchema", () => {
  test("accepts an email and password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "hunter2" });
    assert.equal(result.success, true);
  });

  test("trims the email", () => {
    const result = loginSchema.safeParse({ email: "  user@example.com  ", password: "hunter2" });
    assert.equal(result.success, true);
    assert.equal(result.success && result.data.email, "user@example.com");
  });

  test("rejects a malformed email and an empty password", () => {
    assert.equal(loginSchema.safeParse({ email: "nope", password: "hunter2" }).success, false);
    assert.equal(loginSchema.safeParse({ email: "user@example.com", password: "" }).success, false);
  });
});

describe("captionSchema", () => {
  test("accepts a normal caption and trims it", () => {
    const result = captionSchema.safeParse({ caption: "  Hello world  " });
    assert.equal(result.success, true);
    assert.equal(result.success && result.data.caption, "Hello world");
  });

  test("rejects a missing or empty caption", () => {
    const missing = captionSchema.safeParse({});
    assert.equal(missing.success, false);
    assert.deepEqual(issuePaths(missing), ["caption"]);

    const empty = captionSchema.safeParse({ caption: "   " });
    assert.equal(empty.success, false);
    assert.ok(issueMessages(empty).includes("Write a caption before publishing."));
  });

  test("rejects a caption over the largest platform limit", () => {
    assert.equal(captionSchema.safeParse({ caption: "a".repeat(63_206) }).success, true);
    assert.equal(captionSchema.safeParse({ caption: "a".repeat(63_207) }).success, false);
  });
});

describe("mediaUrlSchema", () => {
  test("accepts an HTTPS URL", () => {
    const result = mediaUrlSchema.safeParse({ url: "https://cdn.example.com/photo.jpg" });
    assert.equal(result.success, true);
  });

  test("rejects a non-HTTPS url", () => {
    const result = mediaUrlSchema.safeParse({ url: "http://cdn.example.com/photo.jpg" });
    assert.equal(result.success, false);
    assert.ok(issueMessages(result).includes("Only HTTPS URLs are supported."));
  });

  test("rejects other schemes, junk and an empty value", () => {
    assert.equal(mediaUrlSchema.safeParse({ url: "file:///etc/passwd" }).success, false);
    assert.equal(mediaUrlSchema.safeParse({ url: "not a url" }).success, false);
    assert.equal(mediaUrlSchema.safeParse({ url: "" }).success, false);
    assert.equal(mediaUrlSchema.safeParse({}).success, false);
  });

  test("rejects a URL longer than 2048 characters", () => {
    const result = mediaUrlSchema.safeParse({ url: `https://example.com/${"a".repeat(2048)}` });
    assert.equal(result.success, false);
  });
});

describe("scheduleSchema", () => {
  test("accepts an ISO date, a 24 hour time and a timezone", () => {
    const result = scheduleSchema.safeParse({
      date: "2026-09-05",
      time: "20:00",
      timezone: "Asia/Jakarta",
    });
    assert.equal(result.success, true);
  });

  test("rejects a malformed date", () => {
    const result = scheduleSchema.safeParse({
      date: "05-09-2026",
      time: "20:00",
      timezone: "Asia/Jakarta",
    });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["date"]);
    assert.ok(issueMessages(result).includes("Choose a valid date."));
  });

  test("rejects a malformed time", () => {
    const result = scheduleSchema.safeParse({
      date: "2026-09-05",
      time: "8pm",
      timezone: "Asia/Jakarta",
    });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["time"]);
    assert.ok(issueMessages(result).includes("Choose a valid time."));

    assert.equal(
      scheduleSchema.safeParse({ date: "2026-09-05", time: "20", timezone: "UTC" }).success,
      false,
    );
    assert.equal(
      scheduleSchema.safeParse({ date: "2026-09-05", time: "24:00", timezone: "UTC" }).success,
      true,
      "the regex only checks the shape; the boundary is enforced elsewhere",
    );
  });

  test("rejects an empty timezone", () => {
    const result = scheduleSchema.safeParse({ date: "2026-09-05", time: "20:00", timezone: "  " });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["timezone"]);
  });
});

describe("postMediaSchema", () => {
  test("accepts an uploaded image", () => {
    assert.equal(postMediaSchema.safeParse(VALID_MEDIA).success, true);
  });

  test("accepts a pasted url image", () => {
    const result = postMediaSchema.safeParse({
      ...VALID_MEDIA,
      kind: "url",
      sourceUrl: "https://cdn.example.com/photo.jpg",
    });
    assert.equal(result.success, true);
  });

  test("a url media item without a sourceUrl is rejected", () => {
    const result = postMediaSchema.safeParse({ ...VALID_MEDIA, kind: "url", sourceUrl: null });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["sourceUrl"]);
  });

  test("rejects an unsupported mime type", () => {
    const result = postMediaSchema.safeParse({ ...VALID_MEDIA, mimeType: "image/gif" });
    assert.equal(result.success, false);
    assert.ok(
      issueMessages(result).includes(
        "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.",
      ),
    );
  });
});

describe("createPostSchema", () => {
  const valid = {
    caption: "Hello world",
    media: VALID_MEDIA,
    platforms: ["instagram", "facebook"],
    schedule: null,
  };

  test("accepts a valid payload", () => {
    const result = createPostSchema.safeParse(valid);
    assert.equal(result.success, true);
  });

  test("accepts a scheduled payload", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      schedule: { date: "2026-09-05", time: "20:00", timezone: "Asia/Jakarta" },
    });
    assert.equal(result.success, true);
  });

  test("rejects a missing caption", () => {
    const result = createPostSchema.safeParse({ ...valid, caption: undefined });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["caption"]);
  });

  test("rejects an empty platform list", () => {
    const result = createPostSchema.safeParse({ ...valid, platforms: [] });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["platforms"]);
    assert.ok(issueMessages(result).includes("Select at least one platform."));
  });

  test("rejects an unknown platform", () => {
    const result = createPostSchema.safeParse({ ...valid, platforms: ["threads"] });
    assert.equal(result.success, false);
    assert.ok(issueMessages(result).includes("Unsupported platform."));
  });

  test("rejects the same platform twice", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      platforms: ["instagram", "instagram"],
    });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["platforms"]);
    assert.ok(issueMessages(result).includes("Choose one account per platform."));
  });

  test("rejects a caption over the strictest selected platform's limit", () => {
    const result = createPostSchema.safeParse({ ...valid, caption: "a".repeat(2_201) });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["caption"]);
    assert.ok(issueMessages(result).includes("This caption is too long for Instagram."));
  });

  test("names Facebook when Facebook is the constraining platform", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      platforms: ["facebook"],
      caption: "a".repeat(63_207),
    });
    assert.equal(result.success, false);
    assert.ok(issueMessages(result).includes("This caption is too long."));
  });

  test("a caption over Instagram's limit passes when only Facebook is selected", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      platforms: ["facebook"],
      caption: "a".repeat(5_000),
    });
    assert.equal(result.success, true);
  });

  test("rejects a malformed schedule", () => {
    const malformedDate = createPostSchema.safeParse({
      ...valid,
      schedule: { date: "05-09-2026", time: "20:00", timezone: "Asia/Jakarta" },
    });
    assert.equal(malformedDate.success, false);

    const malformedTime = createPostSchema.safeParse({
      ...valid,
      schedule: { date: "2026-09-05", time: "8pm", timezone: "Asia/Jakarta" },
    });
    assert.equal(malformedTime.success, false);
  });

  test("an http:// sourceUrl currently passes (HTTPS is not enforced here)", () => {
    // Documents current behaviour: `postMediaSchema.sourceUrl` is only
    // `z.string().url()` (schemas.ts:79) while `mediaUrlSchema` (schemas.ts:57)
    // refines on `https://`. An `http://` reference therefore survives the
    // create-post payload. Reported, not fixed.
    const result = postMediaSchema.safeParse({
      ...VALID_MEDIA,
      kind: "url",
      sourceUrl: "http://cdn.example.com/photo.jpg",
    });
    assert.equal(result.success, true);
    assert.equal(
      mediaUrlSchema.safeParse({ url: "http://cdn.example.com/photo.jpg" }).success,
      false,
      "the same URL is refused at the point of entry",
    );
  });
});
