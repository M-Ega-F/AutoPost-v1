import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublishTraceId,
  logPublishTrace,
  withPublishTrace,
} from "@/lib/publishing/trace";

test("publish trace keeps the correlation id across async work", async () => {
  const previousAppEnv = process.env.APP_ENV;
  const previousConsoleLog = console.log;
  const traceId = createPublishTraceId();
  let logLine = "";
  process.env.APP_ENV = "staging";
  console.log = (...args: unknown[]) => {
    logLine += args.map(String).join(" ");
  };

  try {
    await withPublishTrace(traceId, async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      logPublishTrace(undefined, "META_RESPONSE", {
        platform: "facebook",
        endpoint: "/page-id/photos",
        status: 200,
        responseSuccess: true,
      });
    });

    assert.match(logLine, /\[POST-TRACE\]/);
    assert.match(logLine, new RegExp(`"publishTraceId":"${traceId}"`));
    assert.match(logLine, /"event":"META_RESPONSE"/);
    assert.doesNotMatch(logLine, /token|secret|authorization|cookie/i);
  } finally {
    console.log = previousConsoleLog;
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  }
});

test("keeps provider error traces visible outside the perf environment", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousAppEnv = process.env.APP_ENV;
  const previousConsoleLog = console.log;
  const traceId = createPublishTraceId();
  let logLine = "";
  env.NODE_ENV = "production";
  delete process.env.APP_ENV;
  console.log = (...args: unknown[]) => {
    logLine += args.map(String).join(" ");
  };

  try {
    logPublishTrace(traceId, "META_RESPONSE_ERROR", {
      platform: "instagram",
      status: 401,
      metaErrorCode: 190,
      metaErrorMessage: "Invalid OAuth access token.",
    });

    assert.match(logLine, /\[POST-TRACE\]/);
    assert.match(logLine, /"event":"META_RESPONSE_ERROR"/);
    assert.match(logLine, /"metaErrorCode":190/);
  } finally {
    console.log = previousConsoleLog;
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  }
});

test("records an uncorrelated provider error when a worker has no trace context", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousAppEnv = process.env.APP_ENV;
  const previousConsoleLog = console.log;
  let logLine = "";
  delete env.NODE_ENV;
  delete process.env.APP_ENV;
  console.log = (...args: unknown[]) => {
    logLine += args.map(String).join(" ");
  };

  try {
    logPublishTrace(undefined, "META_RESPONSE_ERROR", {
      platform: "instagram",
      endpoint: "POST /{ig-user-id}/media",
      status: 401,
      metaErrorCode: 190,
      metaErrorSubcode: 460,
      metaErrorType: "OAuthException",
      metaErrorMessage: "Invalid OAuth access token.",
    });

    assert.match(logLine, /\[POST-TRACE\]/);
    assert.match(logLine, /"event":"META_RESPONSE_ERROR"/);
    assert.match(logLine, /"metaErrorCode":190/);
    assert.match(logLine, /"metaErrorSubcode":460/);
    assert.doesNotMatch(logLine, /access token value|Bearer\s+\S+/i);
  } finally {
    console.log = previousConsoleLog;
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  }
});
