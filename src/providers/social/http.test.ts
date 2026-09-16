import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderError } from "@/lib/errors";
import { mapProviderError } from "@/providers/social/http";

test("maps Meta expired-token errors to token_expired", () => {
  const error = mapProviderError("instagram", 401, {
    error: { code: 190, message: "Invalid OAuth access token." },
  });

  assert.ok(error instanceof ProviderError);
  assert.equal(error.code, "token_expired");
});

test("does not call an unrecognised 401 token_expired", () => {
  const error = mapProviderError("instagram", 401, {
    error: { code: 999, message: "Authentication failed for this operation." },
  });

  assert.equal(error.code, "provider_error");
});

test("maps a 401 with an unknown body to provider_error", () => {
  const error = mapProviderError("instagram", 401, { unexpected: true });

  assert.equal(error.code, "provider_error");
});

test("does not treat a generic not-authorized 401 as an expired token", () => {
  const error = mapProviderError("instagram", 401, {
    error: { code: 999, message: "The user is not authorized for this endpoint." },
  });

  assert.notEqual(error.code, "token_expired");
  assert.equal(error.code, "permission_denied");
});

test("maps an explicit expired indication to token_expired", () => {
  const error = mapProviderError("instagram", 401, {
    error: { message: "The access token has expired." },
  });

  assert.equal(error.code, "token_expired");
});

test("maps Meta permission errors to permission_denied", () => {
  const error = mapProviderError("instagram", 401, {
    error: { code: 200, message: "Permissions error" },
  });

  assert.equal(error.code, "permission_denied");
});

test("sanitizes credentials from persisted Meta error details", () => {
  const error = mapProviderError("instagram", 401, {
    access_token: "secret-token-value",
    error: {
      code: 999,
      message: "Request failed with access_token=secret-token-value",
    },
  });

  const serialized = JSON.stringify(error.responseLog);
  assert.equal(serialized.includes("secret-token-value"), false);
});

test("preserves safe Meta error details in the wrapped ProviderError", () => {
  const error = mapProviderError("instagram", 401, {
    error: {
      code: 190,
      error_subcode: 460,
      type: "OAuthException",
      message: "Invalid OAuth access token.",
    },
  });

  assert.equal(error.status, 401);
  assert.deepEqual(error.responseLog, {
    provider: "instagram",
    endpoint: "http-error",
    status: 401,
    body: {
      error: {
        code: 190,
        error_subcode: 460,
        type: "OAuthException",
        message: "Invalid OAuth access token.",
      },
    },
  });
});

test("preserves existing non-401 client error mapping", () => {
  const error = mapProviderError("instagram", 400, {
    error: { code: 999, message: "Unsupported media format." },
  });

  assert.equal(error.code, "unsupported_media");
});
