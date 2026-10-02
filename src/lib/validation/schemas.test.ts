import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  captionSchema,
  changePasswordSchema,
  campaignCreateSchema,
  campaignUpdateSchema,
  createPostSchema,
  forgotPasswordSchema,
  loginSchema,
  mediaUrlSchema,
  postMediaSchema,
  resetPasswordSchema,
  saveDraftSchema,
  scheduleSchema,
  settingsUpdateSchema,
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

describe("password recovery schemas", () => {
  test("accepts a valid recovery email", () => {
    assert.equal(forgotPasswordSchema.safeParse({ email: "user@example.com" }).success, true);
    assert.equal(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success, false);
  });

  test("requires matching reset passwords and the minimum length", () => {
    assert.equal(
      resetPasswordSchema.safeParse({ password: "new-password", confirmPassword: "new-password" }).success,
      true,
    );
    assert.equal(
      resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success,
      false,
    );
    assert.equal(
      resetPasswordSchema.safeParse({ password: "new-password", confirmPassword: "different" }).success,
      false,
    );
  });

  test("requires the current password and a different matching new password", () => {
    const valid = {
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmNewPassword: "new-password",
    };
    assert.equal(changePasswordSchema.safeParse(valid).success, true);
    assert.equal(
      changePasswordSchema.safeParse({ ...valid, currentPassword: "" }).success,
      false,
    );
    assert.equal(
      changePasswordSchema.safeParse({ ...valid, confirmNewPassword: "different" }).success,
      false,
    );
    assert.equal(
      changePasswordSchema.safeParse({ ...valid, newPassword: "old-password", confirmNewPassword: "old-password" }).success,
      false,
    );
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

  test("accepts fractional, whole-number, and unknown video durations", () => {
    for (const duration of [20.4, 20, null]) {
      const result = postMediaSchema.safeParse({
        ...VALID_MEDIA,
        mediaType: "video",
        mimeType: "video/mp4",
        duration,
      });
      assert.equal(result.success, true, `duration ${String(duration)} should be valid`);
    }
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

  test("accepts a library asset reference without trusting a storage key", () => {
    const result = postMediaSchema.safeParse({
      ...VALID_MEDIA,
      kind: "library",
      storageKey: null,
      sourceUrl: null,
      assetId: "00000000-0000-0000-0000-000000000001",
    });
    assert.equal(result.success, true);
  });

  test("rejects a library media item without an asset id", () => {
    const result = postMediaSchema.safeParse({
      ...VALID_MEDIA,
      kind: "library",
      storageKey: null,
      sourceUrl: null,
    });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["assetId"]);
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
  const accountA = "11111111-1111-1111-1111-111111111111";
  const accountB = "22222222-2222-2222-2222-222222222222";
  const valid = {
    caption: "Hello world",
    media: VALID_MEDIA,
    targets: [
      { platform: "instagram", socialAccountId: accountA },
      { platform: "facebook", socialAccountId: accountB },
    ],
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

  test("rejects an empty target list", () => {
    const result = createPostSchema.safeParse({ ...valid, targets: [] });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["targets"]);
    assert.ok(issueMessages(result).includes("Select at least one account."));
  });

  test("rejects an unknown platform", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      targets: [{ platform: "mastodon", socialAccountId: accountA }],
    });
    assert.equal(result.success, false);
    assert.ok(issueMessages(result).includes("Unsupported platform."));
  });

  test("accepts two accounts on the same platform", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      targets: [
        { platform: "tiktok", socialAccountId: accountA },
        { platform: "tiktok", socialAccountId: accountB },
      ],
    });
    assert.equal(result.success, true);
  });

  test("accepts YouTube video settings with the selected target", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      media: {
        ...VALID_MEDIA,
        storageKey: "user-1/post-1.mp4",
        mimeType: "video/mp4",
        mediaType: "video",
        duration: 30,
      },
      targets: [{ platform: "youtube", socialAccountId: accountA }],
      youtube: { title: "Demo video", privacy: "unlisted" },
    });
    assert.equal(result.success, true);
  });

  test("requires YouTube settings when YouTube is selected", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      media: {
        ...VALID_MEDIA,
        storageKey: "user-1/post-1.mp4",
        mimeType: "video/mp4",
        mediaType: "video",
        duration: 30,
      },
      targets: [{ platform: "youtube", socialAccountId: accountA }],
    });
    assert.equal(result.success, false);
    assert.ok(issuePaths(result).includes("youtube"));
  });

  test("rejects the same account twice", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      targets: [
        { platform: "tiktok", socialAccountId: accountA },
        { platform: "tiktok", socialAccountId: accountA },
      ],
    });
    assert.equal(result.success, false);
    assert.deepEqual(issuePaths(result), ["targets"]);
    assert.ok(issueMessages(result).includes("Choose each account only once."));
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
      targets: [{ platform: "facebook", socialAccountId: accountA }],
      caption: "a".repeat(63_207),
    });
    assert.equal(result.success, false);
    assert.ok(issueMessages(result).includes("This caption is too long."));
  });

  test("a caption over Instagram's limit passes when only Facebook is selected", () => {
    const result = createPostSchema.safeParse({
      ...valid,
      targets: [{ platform: "facebook", socialAccountId: accountA }],
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

describe("campaign planning schemas", () => {
  test("accepts a measurable campaign goal and date range", () => {
    const result = campaignCreateSchema.safeParse({
      name: "Launch",
      objective: "promotion",
      targetMetric: "reach",
      targetValue: "25000",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-30T00:00:00.000Z",
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.targetValue, 25_000);
  });

  test("requires custom text for Other and requires metric/value pairs", () => {
    assert.equal(campaignCreateSchema.safeParse({ name: "Launch", objective: "other" }).success, false);
    assert.equal(campaignCreateSchema.safeParse({ name: "Launch", targetMetric: "views" }).success, false);
    assert.equal(campaignCreateSchema.safeParse({ name: "Launch", targetValue: 100 }).success, false);
  });

  test("rejects reversed planning dates and illegal custom objectives", () => {
    assert.equal(
      campaignCreateSchema.safeParse({
        name: "Launch",
        objective: "promotion",
        customObjective: "Not allowed",
      }).success,
      false,
    );
    assert.equal(
      campaignCreateSchema.safeParse({
        name: "Launch",
        startAt: "2026-09-30T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
      }).success,
      false,
    );
  });

  test("accepts a partial goal update", () => {
    const result = campaignUpdateSchema.safeParse({ targetMetric: "likes", targetValue: 500 });
    assert.equal(result.success, true);
  });
});

describe("saveDraftSchema", () => {
  test("accepts an empty draft without media or targets", () => {
    const result = saveDraftSchema.safeParse({
      caption: "",
      media: null,
      targets: [],
      timezone: "UTC",
    });
    assert.equal(result.success, true);
  });

  test("accepts a persisted-media draft", () => {
    const result = saveDraftSchema.safeParse({
      caption: "Work in progress",
      media: VALID_MEDIA,
      targets: [{ platform: "instagram", socialAccountId: "11111111-1111-1111-1111-111111111111" }],
      timezone: "Asia/Jakarta",
    });
    assert.equal(result.success, true);
  });

  test("rejects duplicate draft accounts", () => {
    const result = saveDraftSchema.safeParse({
      caption: "Work in progress",
      media: null,
      targets: [
        { platform: "instagram", socialAccountId: "11111111-1111-1111-1111-111111111111" },
        { platform: "instagram", socialAccountId: "11111111-1111-1111-1111-111111111111" },
      ],
      timezone: "UTC",
    });
    assert.equal(result.success, false);
    assert.ok(issueMessages(result).includes("Choose each account only once."));
  });
});

describe("settingsUpdateSchema", () => {
  test("trims a display name and accepts valid preferences", () => {
    const result = settingsUpdateSchema.safeParse({
      displayName: "  Ega  ",
      timezone: "Asia/Jakarta",
      defaultScheduleTime: "18:30",
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.displayName, "Ega");
  });

  test("allows clearing a display name", () => {
    const result = settingsUpdateSchema.safeParse({ displayName: "   " });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.displayName, null);
  });

  test("rejects invalid timezone, display name and default time", () => {
    assert.equal(
      settingsUpdateSchema.safeParse({ timezone: "Invalid/Timezone" }).success,
      false,
    );
    assert.equal(
      settingsUpdateSchema.safeParse({ displayName: "a".repeat(81) }).success,
      false,
    );
    assert.equal(
      settingsUpdateSchema.safeParse({ defaultScheduleTime: "18:07" }).success,
      false,
    );
  });

  test("rejects an empty update", () => {
    assert.equal(settingsUpdateSchema.safeParse({}).success, false);
  });
});
