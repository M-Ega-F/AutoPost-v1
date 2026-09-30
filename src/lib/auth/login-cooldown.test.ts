import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLoginCooldown,
  formatLoginCooldownClock,
  formatLoginCooldownMessage,
} from "@/lib/auth/login-cooldown";

test("login cooldown message uses natural singular and plural wording", () => {
  assert.equal(formatLoginCooldownMessage(59), "Too many login attempts. Please try again in 59 seconds.");
  assert.equal(formatLoginCooldownMessage(60), "Too many login attempts. Please try again in 1 minute.");
  assert.equal(formatLoginCooldownMessage(323), "Too many login attempts. Please try again in 5 minutes 23 seconds.");
  assert.equal(formatLoginCooldownMessage(300), "Too many login attempts. Please try again in 5 minutes.");
  assert.equal(formatLoginCooldownMessage(1), "Too many login attempts. Please try again in 1 second.");
  assert.doesNotMatch(formatLoginCooldownMessage(0), /0 seconds/);
});

test("login cooldown clock is suitable for the disabled button", () => {
  assert.equal(formatLoginCooldownClock(59), "00:59");
  assert.equal(formatLoginCooldownClock(323), "05:23");
  assert.equal(formatLoginCooldownClock(1_800), "30:00");
  assert.equal(formatLoginCooldownClock(0), "00:00");
  assert.equal(formatLoginCooldown(323), "5 minutes 23 seconds");
});
