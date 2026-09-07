import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@/lib/errors";
import { apiErrorFromUnknown, apiValidationError } from "@/lib/api/response";

test("API errors use the safe contract and status mapping", async () => {
  const response = apiErrorFromUnknown(
    new AppError("not_found", "We couldn't find that post."),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: "NOT_FOUND", message: "We couldn't find that post." },
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("unknown API failures stay generic", async () => {
  const response = apiErrorFromUnknown(new Error("secret database detail"));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again." },
  });
});

test("validation failures use HTTP 422", async () => {
  const response = apiValidationError("Invalid post.");

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: { code: "VALIDATION_ERROR", message: "Invalid post." },
  });
});
