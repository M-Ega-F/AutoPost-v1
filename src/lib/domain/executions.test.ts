import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { backoffDelayMs, MAX_ATTEMPTS, STALE_LOCK_MINUTES } from "@/lib/domain/executions";

describe("backoffDelayMs", () => {
  test("doubles from 15 seconds", () => {
    assert.equal(backoffDelayMs(1), 15_000);
    assert.equal(backoffDelayMs(2), 30_000);
    assert.equal(backoffDelayMs(3), 60_000);
    assert.equal(backoffDelayMs(4), 120_000);
    assert.equal(backoffDelayMs(5), 240_000);
  });

  test("is capped at 30 minutes", () => {
    const cap = 30 * 60_000;
    assert.equal(backoffDelayMs(20), cap);
    assert.equal(backoffDelayMs(100), cap);
    assert.equal(backoffDelayMs(Number.MAX_SAFE_INTEGER), cap);
    assert.ok(backoffDelayMs(1_000) <= cap);
  });

  test("never returns a negative or non-finite delay", () => {
    for (const attempt of [0, -1, -5, 1, 2, 3, 10]) {
      const delay = backoffDelayMs(attempt);
      assert.ok(Number.isFinite(delay), `attempt ${attempt}`);
      assert.ok(delay > 0, `attempt ${attempt}`);
    }
    // A zero or negative attempt clamps to the base delay.
    assert.equal(backoffDelayMs(0), 15_000);
    assert.equal(backoffDelayMs(-3), 15_000);
  });

  test("grows monotonically up to the cap", () => {
    let previous = 0;
    for (let attempt = 0; attempt <= 12; attempt += 1) {
      const delay = backoffDelayMs(attempt);
      assert.ok(delay >= previous, `attempt ${attempt} went backwards`);
      previous = delay;
    }
  });
});

describe("the recovery contract", () => {
  test("a crashed worker's lock is reclaimable after 5 minutes", () => {
    assert.equal(STALE_LOCK_MINUTES, 5);
  });

  test("a platform target is attempted at most 3 times", () => {
    assert.equal(MAX_ATTEMPTS, 3);
  });

  test("the last retry's backoff stays inside the stale-lock window scale", () => {
    // The final scheduled retry (attempt 2, after the first failure) waits 30
    // seconds — long enough to ride out a rate limit, short enough that the
    // recovery sweep is still meaningful.
    assert.equal(backoffDelayMs(MAX_ATTEMPTS - 1), 30_000);
    assert.ok(backoffDelayMs(MAX_ATTEMPTS) < STALE_LOCK_MINUTES * 60_000);
  });
});
