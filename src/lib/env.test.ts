import assert from "node:assert/strict";
import { after, test } from "node:test";

import { resolveOAuthAppUrl } from "./env";

const previousAppUrl = process.env.APP_URL;

process.env.APP_URL = "http://localhost:3000";

after(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

test("TikTok development OAuth uses the HTTPS Quick Tunnel origin", () => {
  const redirectUri = new URL(
    "/api/oauth/tiktok/callback",
    resolveOAuthAppUrl("tiktok", "https://milan-take-clear-rat.trycloudflare.com"),
  ).toString();

  assert.equal(
    redirectUri,
    "https://milan-take-clear-rat.trycloudflare.com/api/oauth/tiktok/callback",
  );
});

test("non-TikTok OAuth keeps the configured application URL", () => {
  assert.equal(
    resolveOAuthAppUrl("facebook", "https://milan-take-clear-rat.trycloudflare.com"),
    "http://localhost:3000",
  );
});
