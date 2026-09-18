import assert from "node:assert/strict";
import { after } from "node:test";
import { test } from "node:test";

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

test("TikTok Web Login Kit authorization URL does not use PKCE", async () => {
  const url = new URL(
    await tiktokProvider.getAuthorizationUrl({
      userId: "user-1",
      workspaceId: "workspace-1",
      state: "opaque-state",
      redirectUri: "https://milan-take-clear-rat.trycloudflare.com/api/oauth/tiktok/callback",
    }),
  );

  assert.equal(url.origin, "https://www.tiktok.com");
  assert.equal(url.pathname, "/v2/auth/authorize/");
  assert.equal(url.searchParams.get("client_key"), "test-tiktok-client-key");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://milan-take-clear-rat.trycloudflare.com/api/oauth/tiktok/callback",
  );
  assert.equal(url.searchParams.get("scope"), "user.info.basic,video.upload,video.publish");
  assert.ok(url.searchParams.get("state"));
  assert.equal(url.searchParams.has("code_challenge"), false);
  assert.equal(url.searchParams.has("code_challenge_method"), false);
});

test("TikTok video Direct Post uses SELF_ONLY privacy for unaudited clients", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        data: { publish_id: "publish-1" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const result = await tiktokProvider.publish({
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
        bytes: new Uint8Array([0]),
        mimeType: "video/mp4",
        size: 1,
      }),
    });

    assert.equal(result.status, "accepted");
    assert.equal(
      (requestBody.post_info as Record<string, unknown>)?.privacy_level,
      "SELF_ONLY",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
