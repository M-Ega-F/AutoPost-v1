import assert from "node:assert/strict";
import test from "node:test";

import { publishJobId } from "@/lib/queue/publish";

test("publish job ids are deterministic, unique, and BullMQ-safe", () => {
  const targetA = "target-a";
  const targetB = "target-b";

  assert.equal(publishJobId(targetA, 1), "target-a-1");
  assert.equal(publishJobId(targetA, 1), publishJobId(targetA, 1));
  assert.notEqual(publishJobId(targetA, 1), publishJobId(targetA, 2));
  assert.notEqual(publishJobId(targetA, 1), publishJobId(targetB, 1));
  assert.doesNotMatch(publishJobId(targetA, 1), /:/);
  assert.doesNotMatch(publishJobId(targetA, 1), /token|secret|authorization|cookie/i);
});
