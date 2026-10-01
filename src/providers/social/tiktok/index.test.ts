import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { PublishInput } from "../types";
import { tiktokProvider } from "./index";

const previousClientKey = process.env.TIKTOK_CLIENT_KEY;
const previousClientSecret = process.env.TIKTOK_CLIENT_SECRET;
const previousEncryptionKey = process.env.ENCRYPTION_KEY;

process.env.TIKTOK_CLIENT_KEY = "test-tiktok-client-key";
process.env.TIKTOK_CLIENT_SECRET = "test-tiktok-client-secret";
process.env.ENCRYPTION_KEY = "a".repeat(64);

after(() => {
  if (previousClientKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
  else process.env.TIKTOK_CLIENT_KEY = previousClientKey;

  if (previousClientSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
  else process.env.TIKTOK_CLIENT_SECRET = previousClientSecret;

  if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = previousEncryptionKey;
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function creatorInfo(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      privacy_level_options: ["SELF_ONLY"],
      comment_disabled: false,
      duet_disabled: false,
      stitch_disabled: false,
      max_video_post_duration_sec: 60,
      ...overrides,
    },
    error: { code: "ok", message: "", log_id: "creator-log" },
  };
}

function videoInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    postPlatformId: "post-platform-1",
    account: {
      id: "account-1",
      userId: "user-1",
      platform: "tiktok",
      platformAccountId: "tiktok-account-1",
      username: "tester",
      displayName: "Tester",
      avatarUrl: null,
      encryptedAccessToken: "ciphertext",
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      scopes: "video.publish",
      status: "active",
      lastErrorCode: null,
      lastErrorMessage: null,
      metadata: null,
    },
    accessToken: "test-access-token",
    caption: "Test video",
    media: {
      mediaType: "video",
      mimeType: "video/mp4",
      storageKey: null,
      sourceUrl: "https://media.example/video.mp4",
      fileSize: 1024,
      width: 720,
      height: 1280,
      duration: 20.4,
    },
    resolveMediaUrl: async () => "https://media.example/video.mp4",
    readMedia: async () => ({
      bytes: new Uint8Array([0, 1, 2]),
      mimeType: "video/mp4",
      size: 3,
    }),
    ...overrides,
  };
}

function photoInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return videoInput({
    caption: "Test photo",
    media: {
      mediaType: "image",
      mimeType: "image/jpeg",
      storageKey: "user-1/photo.jpg",
      sourceUrl: null,
      postMediaId: "media-1",
      fileSize: 1024,
      width: 1080,
      height: 1080,
      duration: null,
    },
    resolveMediaUrl: async () => {
      throw new Error("Photo storage must not use the shared resolver");
    },
    resolveTikTokPhotoMediaUrl: async () =>
      "https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1?token=opaque",
    ...overrides,
  });
}

function photoValidationInput(
  overrides: Partial<PublishInput["media"]> = {},
): PublishInput {
  const base = photoInput();
  return photoInput({
    media: { ...base.media, ...overrides },
  });
}

test("TikTok Web Login Kit authorization URL does not use PKCE", async () => {
  const url = new URL(
    await tiktokProvider.getAuthorizationUrl({
      userId: "user-1",
      workspaceId: "workspace-1",
      state: "opaque-state",
      redirectUri: "https://app.example/api/oauth/tiktok/callback",
    }),
  );

  assert.equal(url.origin, "https://www.tiktok.com");
  assert.equal(url.pathname, "/v2/auth/authorize/");
  assert.equal(url.searchParams.get("client_key"), "test-tiktok-client-key");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "user.info.basic,video.upload,video.publish");
  assert.ok(url.searchParams.get("state"));
  assert.equal(url.searchParams.has("code_challenge"), false);
  assert.equal(url.searchParams.has("code_challenge_method"), false);
});

test("Creator Info is queried before Video Init and drives post settings", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  let initBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("creator_info")) {
      return jsonResponse(creatorInfo({ comment_disabled: true, duet_disabled: true }));
    }
    initBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ data: { publish_id: "publish-1" }, error: { code: "ok" } });
  };

  try {
    const result = await tiktokProvider.publish(videoInput());
    assert.equal(result.status, "accepted");
    assert.equal(requests[0]?.includes("creator_info"), true);
    assert.equal(requests[1]?.includes("video/init"), true);
    assert.deepEqual(initBody?.post_info, {
      title: "Test video",
      privacy_level: "SELF_ONLY",
      disable_comment: true,
      disable_duet: true,
      disable_stitch: false,
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Photo Post uses AutoPost delivery URL and creator capabilities", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  let initBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("creator_info")) {
      return jsonResponse(creatorInfo({ comment_disabled: true }));
    }
    initBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ data: { publish_id: "photo-publish-1" }, error: { code: "ok" } });
  };

  try {
    const result = await tiktokProvider.publish(photoInput());
    assert.equal(result.status, "accepted");
    assert.equal(requests[0]?.includes("creator_info"), true);
    assert.equal(requests[1]?.includes("content/init"), true);
    assert.deepEqual(initBody?.post_info, {
      title: "Test photo",
      privacy_level: "SELF_ONLY",
      disable_comment: true,
    });
    assert.equal(initBody?.post_mode, "DIRECT_POST");
    const sourceInfo = initBody?.source_info as Record<string, unknown>;
    assert.equal(sourceInfo.source, "PULL_FROM_URL");
    assert.deepEqual(sourceInfo.photo_images, [
      "https://autopost.blubuk.dpdns.org/api/media/tiktok/media-1?token=opaque",
    ]);
    assert.equal(JSON.stringify(initBody).includes("supabase"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("TikTok Photo validation enforces JPEG, 20 MB, and 1080p limits", async () => {
  const base = photoValidationInput();

  assert.deepEqual(
    await tiktokProvider.validateContent({
      account: base.account,
      media: base.media,
      caption: base.caption,
    }),
    { ok: true },
  );
  assert.deepEqual(
    await tiktokProvider.validateContent({
      account: base.account,
      media: { ...base.media, mimeType: "image/webp" },
      caption: base.caption,
    }),
    { ok: true },
  );

  assert.deepEqual(
    await tiktokProvider.validateContent({
      account: base.account,
      media: { ...base.media, mimeType: "image/png" },
      caption: base.caption,
    }),
    { ok: false, code: "unsupported_media", message: "TikTok rejected this media format." },
  );
  assert.deepEqual(
    await tiktokProvider.validateContent({
      account: base.account,
      media: { ...base.media, fileSize: 20 * 1024 * 1024 + 1 },
      caption: base.caption,
    }),
    { ok: false, code: "media_too_large", message: "This file is too large for TikTok. Try a smaller file." },
  );
  assert.deepEqual(
    await tiktokProvider.validateContent({
      account: base.account,
      media: { ...base.media, mimeType: "image/webp", fileSize: 20 * 1024 * 1024 + 1 },
      caption: base.caption,
    }),
    { ok: false, code: "media_too_large", message: "This file is too large for TikTok. Try a smaller file." },
  );
  assert.deepEqual(
    await tiktokProvider.validateContent({
      account: base.account,
      media: { ...base.media, width: 1081 },
      caption: base.caption,
    }),
    { ok: false, code: "unsupported_media", message: "TikTok rejected this media format." },
  );
  assert.deepEqual(
    await tiktokProvider.validateContent({
      account: base.account,
      media: { ...base.media, mimeType: "image/webp", width: 1081 },
      caption: base.caption,
    }),
    { ok: false, code: "unsupported_media", message: "TikTok rejected this media format." },
  );
});

test("Creator Info failure prevents Video Init", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return jsonResponse(
      { error: { code: "scope_not_authorized", message: "scope denied", log_id: "log-1" } },
      401,
    );
  };

  try {
    await assert.rejects(() => tiktokProvider.publish(videoInput()));
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.includes("creator_info"), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Unavailable SELF_ONLY privacy prevents Video Init", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return jsonResponse(creatorInfo({ privacy_level_options: ["PUBLIC_TO_EVERYONE"] }));
  };

  try {
    await assert.rejects(() => tiktokProvider.publish(videoInput()));
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Creator duration limit prevents Video Init", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return jsonResponse(creatorInfo({ max_video_post_duration_sec: 10 }));
  };

  try {
    await assert.rejects(() => tiktokProvider.publish(videoInput()));
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Server-side media uses FILE_UPLOAD without PULL_FROM_URL", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  const uploadHeaders: Headers[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("creator_info")) return jsonResponse(creatorInfo());
    if (url.includes("video/init")) {
      return jsonResponse({
        data: { publish_id: "publish-file", upload_url: "https://upload.example/opaque" },
        error: { code: "ok" },
      });
    }
    uploadHeaders.push(new Headers(init?.headers));
    return new Response(null, { status: 201 });
  };

  try {
    const base = videoInput();
    const result = await tiktokProvider.publish(
      videoInput({
        media: { ...base.media, storageKey: "user-1/video.mp4", sourceUrl: null },
      }),
    );
    assert.equal(result.status, "accepted");
    assert.equal(requests.some((url) => url.includes("creator_info")), true);
    assert.equal(requests.some((url) => url.includes("video/init")), true);
    assert.equal(requests.some((url) => url.includes("upload.example")), true);
    assert.equal(uploadHeaders[0]?.get("content-length"), "3");
    assert.equal(uploadHeaders[0]?.get("content-range"), "bytes 0-2/3");
    assert.equal(uploadHeaders[0]?.get("content-type"), "video/mp4");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("FILE_UPLOAD sends sequential chunks for files larger than 64 MB", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ range: string | null; length: string | null }> = [];
  const size = 64 * 1024 * 1024 + 1;
  const bytes = new Uint8Array(size);

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("creator_info")) return jsonResponse(creatorInfo());
    if (url.includes("video/init")) {
      return jsonResponse({
        data: { publish_id: "publish-chunks", upload_url: "https://upload.example/opaque" },
        error: { code: "ok" },
      });
    }
    const headers = new Headers(init?.headers);
    requests.push({
      range: headers.get("content-range"),
      length: headers.get("content-length"),
    });
    return new Response(null, { status: requests.length === 2 ? 201 : 206 });
  };

  try {
    const base = videoInput();
    await tiktokProvider.publish(
      videoInput({
        media: { ...base.media, storageKey: "user-1/large-video.mp4", sourceUrl: null },
        readMedia: async () => ({ bytes, mimeType: "video/mp4", size }),
      }),
    );
    assert.deepEqual(requests, [
      {
        range: `bytes 0-${64 * 1024 * 1024 - 1}/${size}`,
        length: String(64 * 1024 * 1024),
      },
      {
        range: `bytes ${64 * 1024 * 1024}-${size - 1}/${size}`,
        length: "1",
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("PULL_FROM_URL remains available for HTTPS URL media", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    if (String(input).includes("creator_info")) return jsonResponse(creatorInfo());
    return jsonResponse({ data: { publish_id: "publish-url" }, error: { code: "ok" } });
  };

  try {
    const result = await tiktokProvider.publish(videoInput());
    assert.equal(result.status, "accepted");
    assert.equal(requests.some((url) => url.includes("creator_info")), true);
    assert.equal(requests.some((url) => url.includes("video/init")), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Invalid non-HTTPS media URL prevents Video Init", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    if (String(input).includes("creator_info")) return jsonResponse(creatorInfo());
    throw new Error("Video Init must not be called");
  };

  try {
    await assert.rejects(
      () =>
        tiktokProvider.publish(
          videoInput({ resolveMediaUrl: async () => "http://media.example/video.mp4" }),
        ),
    );
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Status fetch uses the TikTok publish_id", async () => {
  const previousFetch = globalThis.fetch;
  let statusBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    statusBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({
      data: {
        status: "PUBLISH_COMPLETE",
        publish_id: "publish-from-init",
        publicly_available_post_id: ["post-1"],
      },
      error: { code: "ok" },
    });
  };

  try {
    const getPublishStatus = tiktokProvider.getPublishStatus;
    assert.ok(getPublishStatus);
    const result = await getPublishStatus({
      account: videoInput().account,
      accessToken: "test-access-token",
      externalPostId: "internal-post-id",
      statusToken: "publish-from-init",
      responseLog: null,
    });
    assert.equal(result.status, "published");
    assert.equal(statusBody?.publish_id, "publish-from-init");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
