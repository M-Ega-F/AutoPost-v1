import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { ProviderError } from "@/lib/errors";
import type { MediaAsset, PublishInput } from "../types";
import { mapYouTubeError, YOUTUBE_REQUIRED_SCOPES, youtubeProvider } from "./index";

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

test("YouTube OAuth requests upload and read-only channel access", async () => {
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
  assert.deepEqual(
    new Set(parsed.searchParams.get("scope")?.split(" ")),
    new Set(YOUTUBE_REQUIRED_SCOPES),
  );
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.example.test/api/oauth/youtube/callback");
  assert.ok(parsed.searchParams.get("state"));
});

test("YouTube rejects a token that does not grant every required scope", async () => {
  const authorizationUrl = await youtubeProvider.getAuthorizationUrl({
    userId: "user-1",
    workspaceId: "workspace-1",
    state: "opaque-state",
    redirectUri: "https://app.example.test/api/oauth/youtube/callback",
  });
  globalThis.fetch = (async () => response({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    scope: "https://www.googleapis.com/auth/youtube.upload",
  })) as typeof globalThis.fetch;

  await assert.rejects(
    () => youtubeProvider.handleCallback({
      userId: "user-1",
      workspaceId: "workspace-1",
      code: "authorization-code",
      state: new URL(authorizationUrl).searchParams.get("state") as string,
      redirectUri: "https://app.example.test/api/oauth/youtube/callback",
    }),
    (error: unknown) => error instanceof ProviderError && error.code === "permission_denied",
  );
});

test("YouTube callback discovers and returns the authorized channel", async () => {
  const authorizationUrl = await youtubeProvider.getAuthorizationUrl({
    userId: "user-1",
    workspaceId: "workspace-1",
    state: "opaque-state",
    redirectUri: "https://app.example.test/api/oauth/youtube/callback",
  });
  const calls: string[] = [];
  const responses = [
    response({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: YOUTUBE_REQUIRED_SCOPES.join(" "),
    }),
    response({ items: [{ id: "channel-1", snippet: { title: "Example Channel" } }] }),
  ];
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return responses.shift() as Response;
  }) as typeof globalThis.fetch;

  const [draft] = await youtubeProvider.handleCallback({
    userId: "user-1",
    workspaceId: "workspace-1",
    code: "authorization-code",
    state: new URL(authorizationUrl).searchParams.get("state") as string,
    redirectUri: "https://app.example.test/api/oauth/youtube/callback",
  });

  assert.equal(draft.platformAccountId, "channel-1");
  assert.equal(draft.displayName, "Example Channel");
  assert.equal(draft.scopes, YOUTUBE_REQUIRED_SCOPES.join(" "));
  assert.deepEqual(calls, [
    "https://oauth2.googleapis.com/token",
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
  ]);
});

test("YouTube reports an authorized account without a channel separately", async () => {
  const authorizationUrl = await youtubeProvider.getAuthorizationUrl({
    userId: "user-1",
    workspaceId: "workspace-1",
    state: "opaque-state",
    redirectUri: "https://app.example.test/api/oauth/youtube/callback",
  });
  const responses = [
    response({ access_token: "access-token", scope: YOUTUBE_REQUIRED_SCOPES.join(" ") }),
    response({ items: [] }),
  ];
  globalThis.fetch = (async () => responses.shift() as Response) as typeof globalThis.fetch;

  await assert.rejects(
    () => youtubeProvider.handleCallback({
      userId: "user-1",
      workspaceId: "workspace-1",
      code: "authorization-code",
      state: new URL(authorizationUrl).searchParams.get("state") as string,
      redirectUri: "https://app.example.test/api/oauth/youtube/callback",
    }),
    (error: unknown) => error instanceof ProviderError && error.code === "youtube_channel_not_found",
  );
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

test("YouTube maps 401 to token expiry and 403 to permission", () => {
  assert.equal(
    mapYouTubeError(401, { error: { message: "Invalid authentication credentials" } }).code,
    "token_expired",
  );
  assert.equal(
    mapYouTubeError(403, {
      error: {
        message: "The request is not authorized for this resource.",
        errors: [{ reason: "forbidden" }],
      },
    }).code,
    "permission_denied",
  );
  assert.equal(
    mapYouTubeError(403, {
      error: {
        message: "The dailyLimitExceeded quota has been reached.",
        errors: [{ reason: "dailyLimitExceeded" }],
      },
    }).code,
    "quota_exceeded",
  );
});

test("YouTube error logs redact token-shaped fields", () => {
  const error = mapYouTubeError(403, {
    access_token: "access-token-secret",
    refresh_token: "refresh-token-secret",
    client_secret: "client-secret",
    error: { message: "Forbidden", errors: [{ reason: "forbidden" }] },
  });

  const serialized = JSON.stringify(error.responseLog);
  assert.equal(serialized.includes("access-token-secret"), false);
  assert.equal(serialized.includes("refresh-token-secret"), false);
  assert.equal(serialized.includes("client-secret"), false);
});
