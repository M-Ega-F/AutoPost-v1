import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ERROR_CODES,
  humanErrorMessage,
  isAuthFailure,
  isErrorCode,
  isRetryableError,
  PLATFORM_LABELS,
  ProviderError,
  toErrorCode,
  type ErrorCode,
} from "@/lib/errors";

const RETRYABLE: readonly ErrorCode[] = [
  "rate_limited",
  "timeout",
  "network_error",
  "provider_error",
];

const NOT_RETRYABLE: readonly ErrorCode[] = [
  "token_expired",
  "permission_denied",
  "account_disconnected",
  "unsupported_media",
  "caption_too_long",
  "invalid_media_url",
  "cancelled",
  "unknown",
];

const AUTH_FAILURES: readonly ErrorCode[] = [
  "token_expired",
  "permission_denied",
  "account_disconnected",
  "account_needs_reconnect",
];

describe("isRetryableError", () => {
  test("transient failures are retryable", () => {
    for (const code of RETRYABLE) {
      assert.equal(isRetryableError(code), true, code);
    }
  });

  test("permanent failures are not retryable", () => {
    for (const code of NOT_RETRYABLE) {
      assert.equal(isRetryableError(code), false, code);
    }
  });

  test("every error code is classified", () => {
    for (const code of ERROR_CODES) {
      assert.equal(typeof isRetryableError(code), "boolean");
    }
  });

  test("null and undefined are never retryable", () => {
    assert.equal(isRetryableError(null), false);
    assert.equal(isRetryableError(undefined), false);
    assert.equal(isRetryableError(""), false);
    assert.equal(isRetryableError("nonsense"), false);
  });
});

describe("isAuthFailure", () => {
  test("account level failures need a reconnect", () => {
    for (const code of AUTH_FAILURES) {
      assert.equal(isAuthFailure(code), true, code);
    }
  });

  test("transient and unknown failures are not auth failures", () => {
    assert.equal(isAuthFailure("rate_limited"), false);
    assert.equal(isAuthFailure("unknown"), false);
    assert.equal(isAuthFailure("timeout"), false);
    assert.equal(isAuthFailure("network_error"), false);
    assert.equal(isAuthFailure("provider_error"), false);
    assert.equal(isAuthFailure("unsupported_media"), false);
    assert.equal(isAuthFailure(null), false);
    assert.equal(isAuthFailure(undefined), false);
  });
});

describe("error code coercion", () => {
  test("toErrorCode falls back to unknown", () => {
    assert.equal(toErrorCode("nonsense"), "unknown");
    assert.equal(toErrorCode(null), "unknown");
    assert.equal(toErrorCode(undefined), "unknown");
    assert.equal(toErrorCode(""), "unknown");
    assert.equal(toErrorCode(42), "unknown");
    assert.equal(toErrorCode("rate_limited"), "rate_limited");
  });

  test("isErrorCode only accepts known codes", () => {
    assert.equal(isErrorCode("failed"), false);
    assert.equal(isErrorCode("nonsense"), false);
    assert.equal(isErrorCode(null), false);
    assert.equal(isErrorCode(7), false);
    assert.equal(isErrorCode("cancelled"), true);
    assert.equal(isErrorCode("unknown"), true);
  });

  test("ERROR_CODES is the single source of truth", () => {
    assert.equal(ERROR_CODES.length, 18);
    assert.equal(ERROR_CODES.at(-1), "unknown");
    assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length);
  });
});

describe("humanErrorMessage", () => {
  test("names the platform and never leaks anything technical", () => {
    assert.equal(
      humanErrorMessage("tiktok", "unsupported_media"),
      "TikTok rejected this media format.",
    );
    assert.equal(
      humanErrorMessage("instagram", "token_expired"),
      "Instagram needs reconnection. Reconnect the account, then retry.",
    );
    assert.equal(
      humanErrorMessage("tiktok", "rate_limited"),
      "TikTok is temporarily rate limiting requests. Try again in a few minutes.",
    );
    assert.equal(
      humanErrorMessage("facebook", "caption_too_long"),
      "This caption is too long for Facebook.",
    );
    assert.equal(
      humanErrorMessage("instagram", "invalid_media_url"),
      "Invalid media URL.",
    );
    assert.equal(
      humanErrorMessage("tiktok", "cancelled"),
      "This post was cancelled and will not be published.",
    );
    assert.equal(
      humanErrorMessage("tiktok", "unknown"),
      "Something went wrong while publishing to TikTok. Retry to try again.",
    );
  });

  test("unknown platforms still read as a sentence", () => {
    assert.equal(
      humanErrorMessage("threads", "unsupported_media"),
      "This platform rejected this media format.",
    );
  });

  test("null and junk codes fall back to the generic sentence", () => {
    assert.equal(
      humanErrorMessage("tiktok", null),
      "Something went wrong while publishing to TikTok. Retry to try again.",
    );
    assert.equal(
      humanErrorMessage("tiktok", "nonsense"),
      "Something went wrong while publishing to TikTok. Retry to try again.",
    );
  });

  test("no message contains an HTTP status, a status code or a raw code", () => {
    for (const platform of Object.keys(PLATFORM_LABELS)) {
      for (const code of ERROR_CODES) {
        const message = humanErrorMessage(platform, code);
        assert.equal(/\bHTTP\b/i.test(message), false, `${code}: ${message}`);
        assert.equal(
          /\b\d{3}\b/.test(message),
          false,
          `${code}: ${message} looks like it contains a status code`,
        );
        assert.equal(
          /error_code/.test(message),
          false,
          `${code}: ${message} mentions error_code`,
        );
        // A snake_case code must never appear literally. Single word codes
        // ("cancelled", "unknown") are real words and may legitimately appear.
        if (code.includes("_")) {
          assert.equal(
            message.toLowerCase().includes(code),
            false,
            `${code}: ${message} leaks the raw code`,
          );
        }
        assert.ok(message.length > 0, `${code} produced an empty message`);
        assert.equal(message.trim(), message);
        assert.ok(/[.]$/.test(message), `${code}: "${message}" should end with a period`);
      }
    }
  });
});

describe("ProviderError", () => {
  test("derives retryability from the code", () => {
    const retryable = new ProviderError({ code: "rate_limited" });
    assert.equal(retryable.code, "rate_limited");
    assert.equal(retryable.retryable, true);
    assert.equal(retryable.name, "ProviderError");
    assert.ok(retryable instanceof Error);

    const permanent = new ProviderError({ code: "token_expired" });
    assert.equal(permanent.code, "token_expired");
    assert.equal(permanent.retryable, false);
  });

  test("an explicit retryable flag wins", () => {
    const error = new ProviderError({ code: "provider_error", retryable: false });
    assert.equal(error.retryable, false);

    const forced = new ProviderError({ code: "cancelled", retryable: true });
    assert.equal(forced.retryable, true);
  });

  test("carries the HTTP status and a default human message", () => {
    const error = new ProviderError({ code: "timeout", status: 504 });
    assert.equal(error.status, 504);
    assert.equal(
      error.message,
      "We couldn't reach This platform. Retry to publish this post.",
    );

    const custom = new ProviderError({
      code: "provider_error",
      status: 500,
      message: "TikTok is having a moment.",
    });
    assert.equal(custom.message, "TikTok is having a moment.");
    assert.equal(custom.status, 500);
  });

  test("keeps the cause for logging", () => {
    const cause = new Error("socket hang up");
    const error = new ProviderError({ code: "network_error", cause });
    assert.equal(error.cause, cause);
    assert.equal(error.retryable, true);
  });
});
