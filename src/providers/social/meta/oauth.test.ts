import { after, test } from "node:test";
import assert from "node:assert/strict";

import {
  META_FACEBOOK_SCOPES,
  META_INSTAGRAM_SCOPES,
  metaAuthorizationUrl,
} from "./oauth";

const previousMetaClientId = process.env.META_CLIENT_ID;
const previousEncryptionKey = process.env.ENCRYPTION_KEY;

process.env.META_CLIENT_ID = "test-meta-client-id";
process.env.ENCRYPTION_KEY = "a".repeat(64);

after(() => {
  if (previousMetaClientId === undefined) delete process.env.META_CLIENT_ID;
  else process.env.META_CLIENT_ID = previousMetaClientId;

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
  assert.equal(authorizationUrl.pathname, "/v23.0/dialog/oauth");
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

  assert.equal(
    authorizationUrl.searchParams.get("scope"),
    META_INSTAGRAM_SCOPES,
  );
  assert.deepEqual(META_INSTAGRAM_SCOPES.split(","), [
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
  ]);
  assert.equal(
    authorizationUrl.searchParams.get("scope")?.includes("pages_manage_posts"),
    false,
  );
  assert.ok(authorizationUrl.searchParams.get("state"));
});
