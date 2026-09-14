import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { ProviderError } from "@/lib/errors";
import type { MediaAsset, PublishInput } from "@/providers/social/types";

import { threadsProvider } from "./index";

const previousThreadsClientId = process.env.THREADS_CLIENT_ID;
const previousThreadsClientSecret = process.env.THREADS_CLIENT_SECRET;
const previousEncryptionKey = process.env.ENCRYPTION_KEY;
const originalFetch = globalThis.fetch;

process.env.THREADS_CLIENT_ID = "test-threads-client-id";
process.env.THREADS_CLIENT_SECRET = "test-threads-client-secret";
process.env.ENCRYPTION_KEY = "a".repeat(64);

type FetchCall = { url: string; init: RequestInit };

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(...responses: Array<{ body: unknown; status?: number }>): FetchCall[] {
  const calls: FetchCall[] = [];
  let index = 0;
  globalThis.fetch = (async (input, init = {}) => {
    calls.push({ url: String(input), init });
    const next = responses[index++];
    if (!next) throw new Error("Unexpected test fetch call.");
    return response(next.body, next.status);
  }) as typeof globalThis.fetch;
  return calls;
}

function media(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    mediaType: "image",
    mimeType: "image/jpeg",
    storageKey: "user-1/image.jpg",
    sourceUrl: null,
    fileSize: 1024,
    width: 1080,
    height: 1080,
    duration: null,
    ...overrides,
  };
}

function publishInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    postPlatformId: "target-1",
    account: {
      id: "account-1",
      userId: "user-1",
      platform: "threads",
      platformAccountId: "threads-user-1",
      username: "example",
      displayName: "Example",
      avatarUrl: null,
      encryptedAccessToken: "not-used-by-publish",
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      scopes: "threads_basic,threads_content_publish",
      status: "active",
      lastErrorCode: null,
      lastErrorMessage: null,
      metadata: null,
    },
    accessToken: "access-token-never-in-url",
    caption: "Hello Threads",
    media: media(),
    resolveMediaUrl: async () => "https://cdn.example.test/image.jpg",
    readMedia: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
      size: 3,
    }),
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (previousThreadsClientId === undefined) delete process.env.THREADS_CLIENT_ID;
  else process.env.THREADS_CLIENT_ID = previousThreadsClientId;
  if (previousThreadsClientSecret === undefined) delete process.env.THREADS_CLIENT_SECRET;
  else process.env.THREADS_CLIENT_SECRET = previousThreadsClientSecret;
  if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = previousEncryptionKey;
});

test("Threads OAuth URL uses the official authorization contract", async () => {
  const url = new URL(
    await threadsProvider.getAuthorizationUrl({
      userId: "user-1",
      state: "opaque-state",
      redirectUri: "http://localhost:3000/api/oauth/threads/callback",
    }),
  );

  assert.equal(url.origin, "https://threads.net");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "test-threads-client-id");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/oauth/threads/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "threads_basic,threads_content_publish");
  assert.ok(url.searchParams.get("state"));
});

test("Threads OAuth callback exchanges, upgrades and profiles a token", async () => {
  const authorizationUrl = new URL(
    await threadsProvider.getAuthorizationUrl({
      userId: "user-1",
      state: "opaque-state",
      redirectUri: "http://localhost:3000/api/oauth/threads/callback",
    }),
  );
  const calls = mockFetch(
    { body: { access_token: "short-token", user_id: "threads-user-1", expires_in: 3600 } },
    { body: { access_token: "long-token", expires_in: 5_184_000 } },
    { body: { id: "threads-user-1", username: "example", name: "Example", threads_profile_picture_url: "https://cdn.example.test/avatar.jpg" } },
  );

  const [account] = await threadsProvider.handleCallback({
    userId: "user-1",
    code: "authorization-code",
    state: authorizationUrl.searchParams.get("state") as string,
    redirectUri: "http://localhost:3000/api/oauth/threads/callback",
  });

  assert.equal(account.platform, "threads");
  assert.equal(account.platformAccountId, "threads-user-1");
  assert.equal(account.username, "example");
  assert.equal(account.accessToken, "long-token");
  assert.ok(account.tokenExpiresAt);
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[0].url).pathname, "/oauth/access_token");
  assert.match(String(calls[0].init.body), /grant_type=authorization_code/);
  assert.equal(calls[2].init.headers && new Headers(calls[2].init.headers).get("authorization"), "Bearer long-token");
  assert.equal(calls[2].url.includes("long-token"), false);
});

test("Threads rejects a callback state for a different user", async () => {
  const url = new URL(
    await threadsProvider.getAuthorizationUrl({
      userId: "another-user",
      state: "opaque-state",
      redirectUri: "http://localhost:3000/api/oauth/threads/callback",
    }),
  );

  await assert.rejects(
    () => threadsProvider.handleCallback({
      userId: "user-1",
      code: "authorization-code",
      state: url.searchParams.get("state") as string,
      redirectUri: "http://localhost:3000/api/oauth/threads/callback",
    }),
    (error: unknown) => error instanceof ProviderError && error.code === "permission_denied",
  );
});

test("Threads publishes an image container and then publishes it", async () => {
  const calls = mockFetch(
    { body: { id: "container-1" } },
    { body: { id: "threads-post-1" } },
  );

  const result = await threadsProvider.publish(publishInput());

  assert.deepEqual(result, {
    status: "published",
    externalPostId: "threads-post-1",
    responseLog: {
      provider: "threads",
      endpoint: "threads-publish",
      status: 200,
      body: { containerId: "container-1", postId: "threads-post-1" },
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes("access-token-never-in-url"), false);
  assert.equal(calls[1].url.includes("access-token-never-in-url"), false);
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer access-token-never-in-url");
  assert.match(String(calls[0].init.body), /media_type=IMAGE/);
    assert.equal(new URLSearchParams(String(calls[0].init.body)).get("text"), "Hello Threads");
  assert.match(String(calls[1].init.body), /creation_id=container-1/);
});

test("Threads normalizes invalid-token and rate-limit responses", async () => {
  const tokenCalls = mockFetch({
    body: { error: { message: "Invalid OAuth access_token", code: "invalid_token" } },
    status: 401,
  });
  await assert.rejects(
    () => threadsProvider.publish(publishInput()),
    (error: unknown) => error instanceof ProviderError && error.code === "token_expired" && error.retryable === false,
  );
  assert.equal(tokenCalls.length, 1);

  mockFetch({ body: { error: { message: "Rate limit reached" } }, status: 429 });
  await assert.rejects(
    () => threadsProvider.publish(publishInput()),
    (error: unknown) => error instanceof ProviderError && error.code === "rate_limited" && error.retryable === true,
  );
});
