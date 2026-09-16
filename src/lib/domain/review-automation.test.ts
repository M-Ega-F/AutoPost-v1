import assert from "node:assert/strict";
import test from "node:test";

import { automationEventKey, eventsDueForReview, REVIEW_AUTOMATION_POLICY } from "@/lib/domain/review-automation";

const dueAt = new Date("2026-09-15T12:00:00.000Z");
const candidate = { postId: "post-1", workspaceId: "workspace-1", reviewerId: "reviewer-1", reviewDueAt: dueAt };

test("review automation emits the 24-hour reminder in its window", () => {
  const now = dueAt.getTime() - REVIEW_AUTOMATION_POLICY.firstReminderMs + 1;
  assert.deepEqual(eventsDueForReview(candidate, now), ["deadline_approaching_24h"]);
});

test("review automation emits both reminder windows when a run catches up", () => {
  const now = dueAt.getTime() - REVIEW_AUTOMATION_POLICY.secondReminderMs + 1;
  assert.deepEqual(eventsDueForReview(candidate, now), ["deadline_approaching_24h", "deadline_approaching_6h"]);
});

test("overdue escalation is derived without changing approval state", () => {
  const now = dueAt.getTime() + REVIEW_AUTOMATION_POLICY.escalationAfterMs;
  assert.deepEqual(eventsDueForReview(candidate, now), ["overdue", "escalated"]);
});

test("automation keys change when reviewer or deadline changes", () => {
  const original = automationEventKey(candidate, "overdue");
  assert.notEqual(original, automationEventKey({ ...candidate, reviewerId: "reviewer-2" }, "overdue"));
  assert.notEqual(original, automationEventKey({ ...candidate, reviewDueAt: new Date(dueAt.getTime() + 60_000) }, "overdue"));
});
