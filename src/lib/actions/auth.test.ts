import assert from "node:assert/strict";
import test from "node:test";

import {
  existingEmailSignupFailure,
  existingEmailSignupFailureFromError,
} from "@/lib/auth/signup";

test("existing signup email produces an explicit login message", () => {
  assert.deepEqual(
    existingEmailSignupFailure({ user: { identities: [] } }),
    {
      ok: false,
      code: "email_already_registered",
      message: "Email sudah terdaftar. Silakan login menggunakan email tersebut.",
    },
  );
});

test("new signup response is not treated as an existing email", () => {
  assert.equal(
    existingEmailSignupFailure({ user: { identities: [{ provider: "email" }] } }),
    null,
  );
  assert.equal(existingEmailSignupFailure({ user: null }), null);
});

test("documented existing-email Auth errors get the same explicit result", () => {
  for (const error of [
    { code: "user_already_exists" },
    { code: "email_exists" },
    { message: "User already registered" },
  ]) {
    assert.equal(existingEmailSignupFailureFromError(error)?.code, "email_already_registered");
  }
});

test("unrelated Auth errors remain generic", () => {
  assert.equal(existingEmailSignupFailureFromError({ code: "email_address_invalid" }), null);
  assert.equal(existingEmailSignupFailureFromError({ code: "signup_disabled" }), null);
});
