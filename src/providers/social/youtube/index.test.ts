import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { ProviderError } from "@/lib/errors";
import type { MediaAsset, PublishInput } from "../types";
import { mapYouTubeError, youtubeProvider } from "./index";

const originalFetch = globalThis.fetch;
const previousClientId = process.env.YOUTUBE_CLIENT_ID;
const previousClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const previousEncryptionKey = process.env.ENCRYPTION_KEY;

process.env.YOUTUBE_CLIENT_ID = "youtube-client-for-test";
process.env.YOUTUBE_CLIENT_SECRET = "youtube-secret-for-test";
process.env.ENCRYPTION_KEY = "b".repeat(64);

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers,
  });
}

function media(): MediaAsset {
  return {
    mediaType: "video",
    mimeType: "video/mp4",
    storageKey: "user-1/video.mp4",
    sourceUrl: null,
    fileSize: 3,
    width: 1080,
    height: 1920,
    duration: 10,
  };
}

function publishInput(): PublishInput {
  return {
    postPlatformId: "post-platform-1",
    account: {
      id: "account-1",
      userId: "user-1",
      platform: "youtube",
      platformAccountId: "channel-1",
      username: "Demo channel",
      displayName: "Demo channel",
      avatarUrl: null,
      encryptedAccessToken: "not-used-by-publish",
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      scopes: "https://www.googleapis.com/auth/youtube.upload",
      status: "active",
      lastErrorCode: null,
      lastErrorMessage: null,
      metadata: { channelId: "channel-1" },
    },
    accessToken: "test-access-token",
    caption: "A YouTube description",
    media: media(),
    platformMetadata: {
      youtube: { title: "A YouTube title", privacy: "private" },
    },
    resolveMediaUrl: async () => "https://media.example.test/video.mp4",
    readMedia: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "video/mp4",
      size: 3,
    }),
  };
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (previousClientId === undefined) delete process.env.YOUTUBE_CLIENT_ID;
  else process.env.YOUTUBE_CLIENT_ID = previousClientId;
  if (previousClientSecret === undefined) delete process.env.YOUTUBE_CLIENT_SECRET;
  else process.env.YOUTUBE_CLIENT_SECRET = previousClientSecret;
  if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = previousEncryptionKey;
});

test("YouTube OAuth requests offline upload access", async () => {
  const authorizationUrl = await youtubeProvider.getAuthorizationUrl({
    userId: "user-1",
    workspaceId: "workspace-1",
    state: "opaque-state",
    redirectUri: "https://app.example.test/api/oauth/youtube/callback",
  });
  const parsed = new URL(authorizationUrl);

  assert.equal(parsed.origin, "https://accounts.google.com");
  assert.equal(parsed.pathname, "/o/oauth2/v2/auth");
  assert.equal(parsed.searchParams.get("access_type"), "offline");
  assert.equal(parsed.searchParams.get("include_granted_scopes"), "true");
  assert.equal(parsed.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube.upload");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.example.test/api/oauth/youtube/callback");
  assert.ok(parsed.searchParams.get("state"));
});

test("YouTube publishes video metadata through a resumable upload", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let responseIndex = 0;
  const responses = [
    response(undefined, 200, { Location: "https://upload.example.test/session" }),
    response({ id: "video-1" }),
  ];
  globalThis.fetch = (async (input, init = {}) => {
    calls.push({ url: String(input), init });
    const next = responses[responseIndex++];
    if (!next) throw new Error("Unexpected test fetch call.");
    return next;
  }) as typeof globalThis.fetch;

  const result = await youtubeProvider.publish(publishInput());

  assert.deepEqual(result, {
    status: "published",
    externalPostId: "video-1",
    responseLog: {
      provider: "youtube",
      endpoint: "youtube-videos-insert",
      status: 200,
      body: { videoId: "video-1", privacyStatus: "private" },
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /upload\/youtube\/v3\/videos\?uploadType=resumable&part=snippet,status$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new Headers(calls[0].init.headers).get("x-upload-content-length"), "3");
  assert.equal(new Headers(calls[0].init.headers).get("x-upload-content-type"), "video/mp4");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    snippet: { title: "A YouTube title", description: "A YouTube description", categoryId: "22" },
    status: { privacyStatus: "private" },
  });
  assert.equal(calls[1].url, "https://upload.example.test/session");
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(new Headers(calls[1].init.headers).get("content-range"), "bytes 0-2/3");
});

test("YouTube maps API verification errors without exposing raw provider details", () => {
  const error = mapYouTubeError(403, {
    error: {
      message: "The API project is not verified for public upload.",
      errors: [{ reason: "forbidden" }],
    },
  });

  assert.ok(error instanceof ProviderError);
  assert.equal(error.code, "api_audit_required");
  assert.equal(error.retryable, false);
  assert.equal(error.message, "YouTube requires Google API verification before public video publishing is available.");
  assert.equal(error.responseLog && typeof error.responseLog === "object", true);
});
