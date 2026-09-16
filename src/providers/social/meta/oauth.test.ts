import { after, test } from "node:test";
import assert from "node:assert/strict";

import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchFacebookPages,
  META_FACEBOOK_SCOPES,
  META_INSTAGRAM_SCOPES,
  metaAuthorizationUrl,
} from "./oauth";
import { ProviderError } from "@/lib/errors";

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

test("Facebook OAuth start contract uses the local callback", () => {
  const authorizationUrl = new URL(
    metaAuthorizationUrl({
      userId: "user-1",
      platform: "facebook",
      state: "opaque-start-state",
      redirectUri: "http://localhost:3000/api/oauth/facebook/callback",
    }),
  );

  assert.equal(authorizationUrl.host, "www.facebook.com");
  assert.equal(authorizationUrl.pathname, "/v26.0/dialog/oauth");
  assert.equal(
    authorizationUrl.searchParams.get("client_id"),
    "test-meta-client-id",
  );
  assert.equal(
    authorizationUrl.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/oauth/facebook/callback",
  );
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(
    authorizationUrl.searchParams.get("scope"),
    META_FACEBOOK_SCOPES,
  );
  assert.deepEqual(META_FACEBOOK_SCOPES.split(","), [
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_show_list",
    "business_management",
    "catalog_management",
    "commerce_account_manage_orders",
    "commerce_account_read_orders",
    "commerce_account_read_reports",
    "commerce_account_read_settings",
    "email",
    "facebook_branded_content_ads_brand",
    "facebook_creator_marketplace_discovery",
    "leads_retrieval",
    "live_shopping_manage_video",
    "manage_app_solution",
    "manage_fundraisers",
    "marketing_messages_messenger",
    "page_events",
    "pages_manage_ads",
    "pages_manage_cta",
    "pages_manage_engagement",
    "pages_manage_metadata",
    "pages_manage_instant_articles",
    "pages_messaging",
    "pages_messaging_phone_number",
    "pages_read_user_content",
    "pages_utility_messaging",
    "paid_marketing_messages",
    "private_computation_access",
    "publish_video",
    "read_insights",
    "read_page_mailboxes",
  ]);
  assert.equal(
    authorizationUrl.searchParams.get("scope")?.includes("instagram_"),
    false,
  );
  assert.ok(authorizationUrl.searchParams.get("state"));
});

test("Instagram OAuth start contract adds only Instagram publishing scopes", () => {
  const authorizationUrl = new URL(
    metaAuthorizationUrl({
      userId: "user-1",
      platform: "instagram",
      state: "opaque-start-state",
      redirectUri: "http://localhost:3000/api/oauth/instagram/callback",
    }),
  );

  assert.equal(authorizationUrl.host, "www.instagram.com");
  assert.equal(authorizationUrl.pathname, "/oauth/authorize");
  assert.equal(
    authorizationUrl.searchParams.get("client_id"),
    "test-instagram-client-id",
  );
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(
    authorizationUrl.searchParams.get("scope"),
    META_INSTAGRAM_SCOPES,
  );
  assert.deepEqual(META_INSTAGRAM_SCOPES.split(","), [
    "instagram_business_basic",
    "instagram_business_content_publish",
  ]);
  assert.equal(
    authorizationUrl.searchParams.get("scope")?.includes("pages_manage_posts"),
    false,
  );
  assert.equal(
    authorizationUrl.searchParams.get("scope")?.includes("pages_"),
    false,
  );
  assert.ok(authorizationUrl.searchParams.get("state"));
});

test("Instagram Login exchanges the code and long-lived token on Instagram endpoints", async () => {
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          access_token: "instagram-short-lived-token",
          user_id: "ig-user-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        access_token: "instagram-long-lived-token",
        token_type: "bearer",
        expires_in: 5_184_000,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const shortLived = await exchangeCodeForToken(
      "oauth-code-secret",
      "http://localhost:3000/api/oauth/instagram/callback",
      "instagram",
    );
    const longLived = await exchangeForLongLivedToken(
      shortLived.accessToken,
      "instagram",
    );

    assert.equal(shortLived.userId, "ig-user-1");
    assert.equal(longLived.tokenType, "bearer");
    assert.equal(new URL(calls[0].url).host, "api.instagram.com");
    assert.equal(new URL(calls[0].url).pathname, "/oauth/access_token");
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].body, /grant_type=authorization_code/);
    assert.equal(new URL(calls[1].url).host, "graph.instagram.com");
    assert.equal(new URL(calls[1].url).pathname, "/access_token");
    assert.match(calls[1].url, /grant_type=ig_exchange_token/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Meta Page discovery requests the configured Graph version and returns Pages", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedAuthorization = "";

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "page-1",
            name: "Demo Page",
            access_token: "page-token",
            tasks: ["CREATE_CONTENT"],
          },
        ],
        paging: { next: "https://example.test/next" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const pages = await fetchFacebookPages("user-token");

    assert.equal(new URL(requestedUrl).pathname, "/v26.0/me/accounts");
    assert.equal(new URL(requestedUrl).searchParams.get("limit"), "100");
    assert.match(
      new URL(requestedUrl).searchParams.get("fields") ?? "",
      /id,name,access_token/,
    );
    assert.equal(
      new URL(requestedUrl).searchParams.get("fields"),
      "id,name,access_token",
    );
    assert.equal(requestedAuthorization, "Bearer user-token");
    assert.deepEqual(pages, [
      {
        id: "page-1",
        name: "Demo Page",
        access_token: "page-token",
        tasks: ["CREATE_CONTENT"],
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Meta Page discovery preserves an empty data response as an empty list", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  try {
    assert.deepEqual(await fetchFacebookPages("user-token"), []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Meta Page discovery preserves a Page response without optional fields", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ data: [{ id: "page-1", name: "Test Page" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    assert.deepEqual(await fetchFacebookPages("user-token"), [
      { id: "page-1", name: "Test Page" },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Meta Page discovery exposes a safe ProviderError for Graph API failures", async () => {
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  let logLine = "";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Permissions error",
          type: "OAuthException",
          code: 200,
          error_subcode: 123,
          fbtrace_id: "trace-1",
          access_token: "should-not-be-logged",
        },
      }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  console.error = (...args: unknown[]) => {
    logLine = args.map(String).join(" ");
  };

  try {
    await assert.rejects(
      () => fetchFacebookPages("user-token"),
      (error: unknown) =>
        error instanceof ProviderError &&
        error.code === "permission_denied" &&
        error.status === 403,
    );
    assert.match(logLine, /meta pages discovery failed/);
    assert.doesNotMatch(logLine, /should-not-be-logged/);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
  }
});

test("the long-lived token returned by exchange is forwarded to Page discovery", async () => {
  const previousFetch = globalThis.fetch;
  const previousConsoleLog = console.log;
  const calls: Array<{ url: string; authorization: string }> = [];
  let logText = "";
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization") ?? "",
    });

    if (calls.length === 1) {
      return new Response(
        JSON.stringify({ access_token: "short-lived-token", token_type: "bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (calls.length === 2) {
      return new Response(
        JSON.stringify({ access_token: "long-lived-token", token_type: "bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  console.log = (...args: unknown[]) => {
    logText += `${args.map(String).join(" ")}\n`;
  };

  try {
    const shortLived = await exchangeCodeForToken(
      "oauth-code-secret",
      "http://localhost:3000/api/oauth/facebook/callback",
      "facebook",
    );
    const longLived = await exchangeForLongLivedToken(
      shortLived.accessToken,
      "facebook",
    );
    await fetchFacebookPages(longLived.accessToken);

    assert.equal(longLived.tokenType, "bearer");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].authorization, "Bearer long-lived-token");
    assert.match(calls[1].url, /fb_exchange_token=short-lived-token/);
    assert.doesNotMatch(
      logText,
      /oauth-code-secret|short-lived-token|long-lived-token|test-meta-client-secret/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    console.log = previousConsoleLog;
  }
});
