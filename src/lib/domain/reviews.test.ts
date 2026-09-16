import assert from "node:assert/strict";
import test from "node:test";

import { isReviewOverdue, reviewQueuePriority } from "@/lib/domain/reviews";

const now = Date.parse("2026-09-14T12:00:00.000Z");

test("review overdue is only true for in-review posts past their deadline", () => {
  assert.equal(isReviewOverdue(new Date("2026-09-14T11:00:00.000Z"), "in_review", now), true);
  assert.equal(isReviewOverdue(new Date("2026-09-14T11:00:00.000Z"), "approved", now), false);
  assert.equal(isReviewOverdue(null, "in_review", now), false);
});

test("review queue priority keeps overdue work first", () => {
  assert.equal(reviewQueuePriority({ status: "in_review", dueAt: new Date("2026-09-14T11:00:00.000Z"), scheduledAt: null }, now), 0);
  assert.equal(reviewQueuePriority({ status: "in_review", dueAt: new Date("2026-09-14T13:00:00.000Z"), scheduledAt: null }, now), 1);
  assert.equal(reviewQueuePriority({ status: "in_review", dueAt: null, scheduledAt: new Date("2026-09-15T13:00:00.000Z") }, now), 2);
  assert.equal(reviewQueuePriority({ status: "approved", dueAt: new Date("2026-09-14T11:00:00.000Z"), scheduledAt: null }, now), 1);
});
