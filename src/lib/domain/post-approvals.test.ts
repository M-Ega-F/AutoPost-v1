import assert from "node:assert/strict";
import test from "node:test";

import { canTransitionApprovalStatus } from "@/lib/domain/post-approvals";

test("content approval state machine only allows valid review transitions", () => {
  assert.equal(canTransitionApprovalStatus("draft", "in_review"), true);
  assert.equal(canTransitionApprovalStatus("in_review", "approved"), true);
  assert.equal(canTransitionApprovalStatus("in_review", "changes_requested"), true);
  assert.equal(canTransitionApprovalStatus("changes_requested", "in_review"), true);
  assert.equal(canTransitionApprovalStatus("approved", "draft"), true);
  assert.equal(canTransitionApprovalStatus("draft", "approved"), false);
  assert.equal(canTransitionApprovalStatus("approved", "in_review"), false);
  assert.equal(canTransitionApprovalStatus("changes_requested", "approved"), false);
});
