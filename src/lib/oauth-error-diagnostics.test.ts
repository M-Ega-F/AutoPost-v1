import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ProviderError } from "@/lib/errors";
import { oauthErrorDiagnostics } from "@/lib/oauth-error-diagnostics";

describe("oauthErrorDiagnostics", () => {
  test("extracts diagnostics from a ProviderError", () => {
    const error = new ProviderError({
      code: "permission_denied",
      status: 403,
      message: "YouTube needs reconnection. Reconnect the account, then retry.",
      responseLog: {
        endpoint: "GET /youtube/v3/channels?part=snippet&mine=true",
        status: 403,
        body: {
          error: {
            message: "The request is not properly authorized.",
            errors: [{ reason: "insufficientPermissions" }],
          },
        },
      },
    });

    assert.deepEqual(oauthErrorDiagnostics("youtube", error), {
      platform: "youtube",
      error: "YouTube needs reconnection. Reconnect the account, then retry.",
      constructorName: "ProviderError",
      isProviderError: true,
      errorCode: "permission_denied",
      httpStatus: 403,
      endpoint: "GET /youtube/v3/channels?part=snippet&mine=true",
      providerMessage: "The request is not properly authorized.",
      googleError: null,
      googleErrorDescription: null,
      googleReason: "insufficientPermissions",
    });
  });

  test("keeps safe runtime metadata for a plain Error", () => {
    assert.deepEqual(oauthErrorDiagnostics("youtube", new Error("failed")), {
      platform: "youtube",
      error: "failed",
      constructorName: "Error",
      isProviderError: false,
      errorCode: null,
      httpStatus: null,
      endpoint: null,
      providerMessage: null,
      googleError: null,
      googleErrorDescription: null,
      googleReason: null,
    });
  });

  test("extracts structural metadata when instanceof is false", () => {
    const error = {
      name: "ProviderError",
      message: "YouTube needs reconnection. Reconnect the account, then retry.",
      code: "permission_denied",
      status: 403,
      responseLog: {
        endpoint: "GET /youtube/v3/channels?part=snippet&mine=true",
        status: 403,
        body: {
          error: "forbidden",
          error_description: "The request lacks required authorization.",
          errors: [{ reason: "forbidden" }],
        },
      },
    };

    const diagnostics = oauthErrorDiagnostics("youtube", error);

    assert.equal(diagnostics.constructorName, "Object");
    assert.equal(diagnostics.isProviderError, false);
    assert.equal(diagnostics.errorCode, "permission_denied");
    assert.equal(diagnostics.httpStatus, 403);
    assert.equal(diagnostics.endpoint, "GET /youtube/v3/channels?part=snippet&mine=true");
    assert.equal(diagnostics.googleError, "forbidden");
    assert.equal(diagnostics.googleErrorDescription, "The request lacks required authorization.");
    assert.equal(diagnostics.googleReason, "forbidden");
  });
});
