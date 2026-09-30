import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryLoginRateLimitStore,
  getLoginCooldown,
  getLoginCooldownSeconds,
  getTrustedClientIp,
  isInvalidCredentialsError,
  recordLoginFailure,
  resetLoginFailures,
  runLoginAttempt,
} from "@/lib/auth/login-rate-limit";

test("login cooldown mapping is explicit and capped at 30 minutes", () => {
  const cases = [
    [0, 0],
    [4, 0],
    [5, 60],
    [9, 60],
    [10, 300],
    [14, 300],
    [15, 600],
    [19, 600],
    [20, 900],
    [24, 900],
    [25, 1200],
    [29, 1200],
    [30, 1800],
    [31, 1800],
    [100, 1800],
  ] as const;

  for (const [failedAttempts, expectedSeconds] of cases) {
    assert.equal(getLoginCooldownSeconds(failedAttempts), expectedSeconds);
  }
});

test("failed attempts progressively apply cooldowns and continue after each expiry", async () => {
  let now = 1_000_000;
  const store = createMemoryLoginRateLimitStore(() => now);
  const identity = "203.0.113.10";

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = await recordLoginFailure(identity, store);
    const expectedSeconds = getLoginCooldownSeconds(attempt);
    assert.equal(result.failedAttempts, attempt);
    assert.equal(result.cooldownSeconds, expectedSeconds);

    const cooldown = await getLoginCooldown(identity, store);
    assert.equal(cooldown.retryAfterSeconds, expectedSeconds);

    if (expectedSeconds > 0) now += expectedSeconds * 1_000;
  }

  const capped = await recordLoginFailure(identity, store);
  assert.equal(capped.failedAttempts, 31);
  assert.equal(capped.cooldownSeconds, 1_800);
});

test("server remaining cooldown decreases without changing the configured tiers", async () => {
  let now = 1_000_000;
  const store = createMemoryLoginRateLimitStore(() => now);
  const identity = "203.0.113.30";
  const expectedCooldowns = new Map([
    [5, 60],
    [10, 300],
    [15, 600],
    [20, 900],
    [25, 1_200],
    [30, 1_800],
  ]);

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const failure = await recordLoginFailure(identity, store);
    const expectedSeconds = getLoginCooldownSeconds(attempt);
    assert.equal(failure.cooldownSeconds, expectedSeconds);

    if (expectedCooldowns.has(attempt)) {
      assert.equal(
        (await getLoginCooldown(identity, store)).retryAfterSeconds,
        expectedCooldowns.get(attempt),
      );
    }

    if (expectedSeconds > 0) now += expectedSeconds * 1_000;
  }

  await recordLoginFailure(identity, store);
  now += 10_000;
  assert.equal((await getLoginCooldown(identity, store)).retryAfterSeconds, 1_790);
});

test("two failed login actions from an isolated counter do not trigger cooldown", async () => {
  const store = createMemoryLoginRateLimitStore();
  const identity = "203.0.113.31";
  let signInCalls = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runLoginAttempt({
      identity,
      store,
      signIn: async () => {
        signInCalls += 1;
        return { error: { code: "invalid_credentials" } };
      },
    });

    assert.equal(result.kind, "invalid_credentials");
    if (result.kind === "invalid_credentials") {
      assert.equal(result.failure.failedAttempts, attempt);
      assert.equal(result.failure.cooldownSeconds, 0);
    }
  }

  assert.equal(signInCalls, 2);
  assert.deepEqual(await getLoginCooldown(identity, store), {
    blocked: false,
    retryAfterSeconds: 0,
  });
});

test("the real login-attempt sequence reaches each configured tier once", async () => {
  let now = 1_000_000;
  const store = createMemoryLoginRateLimitStore(() => now);
  const identity = "203.0.113.32";
  const expectedByAttempt = new Map([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 60],
    [6, 60],
    [10, 300],
    [15, 600],
    [20, 900],
    [25, 1_200],
    [30, 1_800],
  ]);

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = await runLoginAttempt({
      identity,
      store,
      signIn: async () => ({ error: { code: "invalid_credentials" } }),
    });

    assert.equal(result.kind, "invalid_credentials");
    if (result.kind === "invalid_credentials" && expectedByAttempt.has(attempt)) {
      assert.equal(result.failure.failedAttempts, attempt);
      assert.equal(result.failure.cooldownSeconds, expectedByAttempt.get(attempt));
    }

    const cooldown = getLoginCooldownSeconds(attempt);
    if (cooldown > 0) now += cooldown * 1_000;
  }
});

test("failure counter expires after 24 hours without a failed login", async () => {
  let now = 1_000_000;
  const store = createMemoryLoginRateLimitStore(() => now);
  const identity = "203.0.113.11";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordLoginFailure(identity, store);
    if (attempt < 4) now += 60_000;
  }

  assert.equal((await getLoginCooldown(identity, store)).blocked, true);
  now += 24 * 60 * 60 * 1_000;
  assert.deepEqual(await getLoginCooldown(identity, store), {
    blocked: false,
    retryAfterSeconds: 0,
  });

  const afterExpiry = await recordLoginFailure(identity, store);
  assert.equal(afterExpiry.failedAttempts, 1);
  assert.equal(afterExpiry.cooldownSeconds, 0);
});

test("successful login resets failures and cooldown", async () => {
  let now = 1_000_000;
  const store = createMemoryLoginRateLimitStore(() => now);
  const identity = "203.0.113.12";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordLoginFailure(identity, store);
    now += 60_000;
  }

  let signInCalls = 0;
  const result = await runLoginAttempt({
    identity,
    store,
    signIn: async () => {
      signInCalls += 1;
      return { error: null };
    },
  });

  assert.deepEqual(result, { kind: "success" });
  assert.equal(signInCalls, 1);
  const nextFailure = await recordLoginFailure(identity, store);
  assert.deepEqual(nextFailure, { failedAttempts: 1, cooldownSeconds: 0 });
});

test("active cooldown prevents a Supabase sign-in request", async () => {
  const store = createMemoryLoginRateLimitStore();
  const identity = "203.0.113.13";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordLoginFailure(identity, store);
  }

  let signInCalls = 0;
  const result = await runLoginAttempt({
    identity,
    store,
    signIn: async () => {
      signInCalls += 1;
      return { error: { code: "invalid_credentials" } };
    },
  });

  assert.equal(result.kind, "cooldown");
  assert.equal(signInCalls, 0);
});

test("only invalid credentials count as failed password attempts", async () => {
  assert.equal(isInvalidCredentialsError({ code: "invalid_credentials" }), true);
  assert.equal(isInvalidCredentialsError({ name: "AuthInvalidCredentialsError" }), true);
  assert.equal(isInvalidCredentialsError({ code: "over_request_rate_limit", status: 429 }), false);
  assert.equal(isInvalidCredentialsError({ code: "unexpected_failure", status: 500 }), false);
  assert.equal(isInvalidCredentialsError(new Error("network timeout")), false);

  const store = createMemoryLoginRateLimitStore();
  const identity = "203.0.113.14";

  const nonPasswordErrors = [
    { code: "over_request_rate_limit", status: 429 },
    { code: "unexpected_failure", status: 500 },
  ];
  for (const error of nonPasswordErrors) {
    const result = await runLoginAttempt({
      identity,
      store,
      signIn: async () => ({ error }),
    });
    assert.equal(result.kind, "other_error");
  }

  await assert.rejects(
    runLoginAttempt({
      identity,
      store,
      signIn: async () => {
        throw new Error("network timeout");
      },
    }),
  );

  assert.deepEqual(await getLoginCooldown(identity, store), {
    blocked: false,
    retryAfterSeconds: 0,
  });
});

test("trusted client IP prefers platform-provided IP and rejects invalid values", () => {
  assert.equal(
    getTrustedClientIp({
      get: (name) => (name === "x-vercel-forwarded-for" ? "203.0.113.20, 10.0.0.1" : null),
    }),
    "203.0.113.20",
  );
  assert.equal(
    getTrustedClientIp({
      get: (name) => (name === "x-forwarded-for" ? "not-an-ip" : null),
    }),
    "unknown",
  );
});

test("resetLoginFailures clears the hashed identity state", async () => {
  const store = createMemoryLoginRateLimitStore();
  const identity = "203.0.113.21";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordLoginFailure(identity, store);
  }

  await resetLoginFailures(identity, store);
  assert.deepEqual(await getLoginCooldown(identity, store), {
    blocked: false,
    retryAfterSeconds: 0,
  });
});
