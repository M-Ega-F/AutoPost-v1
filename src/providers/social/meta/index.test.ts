import { after, test } from "node:test";
import assert from "node:assert/strict";

import { signOAuthState } from "../http";
import { metaFacebookProvider, metaInstagramProvider } from "./index";

const previousMetaClientId = process.env.META_CLIENT_ID;
const previousMetaClientSecret = process.env.META_CLIENT_SECRET;
const previousInstagramClientId = process.env.INSTAGRAM_CLIENT_ID;
const previousInstagramClientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
const previousEncryptionKey = process.env.ENCRYPTION_KEY;

process.env.META_CLIENT_ID = "test-meta-client-id";
process.env.META_CLIENT_SECRET = "test-meta-client-secret";
process.env.INSTAGRAM_CLIENT_ID = "test-instagram-client-id";
process.env.INSTAGRAM_CLIENT_SECRET = "test-instagram-client-secret";
process.env.ENCRYPTION_KEY = "a".repeat(64);

after(() => {
  if (previousMetaClientId === undefined) delete process.env.META_CLIENT_ID;
  else process.env.META_CLIENT_ID = previousMetaClientId;

  if (previousMetaClientSecret === undefined) delete process.env.META_CLIENT_SECRET;
  else process.env.META_CLIENT_SECRET = previousMetaClientSecret;

  if (previousInstagramClientId === undefined) delete process.env.INSTAGRAM_CLIENT_ID;
  else process.env.INSTAGRAM_CLIENT_ID = previousInstagramClientId;

  if (previousInstagramClientSecret === undefined) delete process.env.INSTAGRAM_CLIENT_SECRET;
  else process.env.INSTAGRAM_CLIENT_SECRET = previousInstagramClientSecret;

  if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = previousEncryptionKey;
});

function signedState(platform: "facebook" | "instagram"): string {
  return signOAuthState({
    userId: "user-1",
    workspaceId: "workspace-1",
    platform,
    state: `${platform}-opaque-state`,
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockMetaCallback(platform: "facebook" | "instagram", pages: unknown[]) {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);

    if (platform === "instagram" && url.includes("api.instagram.com/oauth/access_token")) {
      return jsonResponse({
        access_token: "instagram-short-lived-user-token",
        user_id: "ig-1",
      });
    }
    if (platform === "instagram" && url.includes("graph.instagram.com/access_token")) {
      return jsonResponse({
        access_token: "instagram-long-lived-user-token",
        token_type: "bearer",
        expires_in: 5_184_000,
      });
    }
    if (url.includes("/oauth/access_token")) {
      const exchangeCount = calls.filter((call) => call.includes("/oauth/access_token")).length;
      return jsonResponse({
        access_token: exchangeCount === 1 ? "short-lived-user-token" : "long-lived-user-token",
        token_type: "bearer",
      });
    }
    if (platform === "instagram" && url.includes("graph.instagram.com") && url.includes("/me?")) {
      return jsonResponse({ id: "ig-1", username: "example" });
    }
    if (url.includes("/me/accounts")) {
      return jsonResponse({ data: pages });
    }
    if (url.includes("/me?")) {
      return jsonResponse({ id: "user-1", name: "Test User" });
    }
    throw new Error(`Unexpected Meta URL: ${url}`);
  };

  return {
    calls,
    restore: () => {
      globalThis.fetch = previousFetch;
    },
  };
}

async function runCallback(
  platform: "facebook" | "instagram",
  pages: unknown[],
) {
  const mock = mockMetaCallback(platform, pages);
  try {
    const provider = platform === "facebook" ? metaFacebookProvider : metaInstagramProvider;
    const drafts = await provider.handleCallback({
      userId: "user-1",
      workspaceId: "workspace-1",
      code: "oauth-code-secret",
      state: signedState(platform),
      redirectUri: `http://localhost:3000/api/oauth/${platform}/callback`,
    });
    return { drafts, calls: mock.calls };
  } finally {
    mock.restore();
  }
}

test("Facebook callback emits only Facebook for a Page without Instagram", async () => {
  const { drafts } = await runCallback("facebook", [
    { id: "page-1", name: "My Page", access_token: "page-token" },
  ]);

  assert.deepEqual(drafts.map(({ platform, platformAccountId }) => ({ platform, platformAccountId })), [
    { platform: "facebook", platformAccountId: "page-1" },
  ]);
});

test("Facebook callback ignores an Instagram relation and emits only Facebook", async () => {
  const { drafts } = await runCallback("facebook", [
    {
      id: "page-1",
      name: "My Page",
      access_token: "page-token",
      instagram_business_account: { id: "ig-1", username: "example" },
    },
  ]);

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.platform, "facebook");
  assert.equal(drafts.some((draft) => draft.platform === "instagram"), false);
});

test("Instagram callback emits only Instagram through standalone Instagram Login", async () => {
  const { drafts, calls } = await runCallback("instagram", [
    {
      id: "page-1",
      name: "My Page",
      access_token: "page-token",
      instagram_business_account: { id: "ig-1", username: "example" },
    },
  ]);

  assert.equal(calls.some((call) => call.includes("www.instagram.com/oauth/authorize")), false);
  assert.equal(calls.some((call) => call.includes("api.instagram.com/oauth/access_token")), true);
  assert.equal(calls.some((call) => call.includes("graph.instagram.com/v26.0/me?fields=id%2Cusername")), true);
  assert.equal(calls.some((call) => call.includes("/me/accounts")), false);
  assert.deepEqual(drafts.map(({ platform, platformAccountId }) => ({ platform, platformAccountId })), [
    { platform: "instagram", platformAccountId: "ig-1" },
  ]);
  assert.equal(drafts.some((draft) => draft.platform === "facebook"), false);
});

test("Facebook empty Page discovery returns no drafts for the callback route to classify as no_pages", async () => {
  const { drafts } = await runCallback("facebook", []);
  assert.deepEqual(drafts, []);
});
