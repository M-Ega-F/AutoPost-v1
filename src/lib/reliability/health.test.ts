import assert from "node:assert/strict";
import test from "node:test";
import type IORedis from "ioredis";

import {
  classifyReliabilityJob,
  createWorkerHeartbeat,
  RELIABILITY_THRESHOLDS,
} from "@/lib/reliability/health";

test("classifies old active and overdue delayed work as stuck", () => {
  const now = 10_000_000;

  assert.equal(
    classifyReliabilityJob("active", now - RELIABILITY_THRESHOLDS.stuckJobAgeMs, 0, now),
    "stuck",
  );
  assert.equal(
    classifyReliabilityJob(
      "delayed",
      now - RELIABILITY_THRESHOLDS.staleDelayedJobAgeMs - 1_000,
      0,
      now,
    ),
    "stuck",
  );
  assert.equal(classifyReliabilityJob("waiting", now - 60_000, 0, now), null);
});

test("classifies every failed observation without exposing its reason", () => {
  assert.equal(classifyReliabilityJob("failed", Date.now(), 0), "failed");
});

test("worker heartbeat writes a TTL record and removes it on stop", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const fakeClient = {
    hset: async (...args: unknown[]) => {
      calls.push({ method: "hset", args });
      return 1;
    },
    expire: async (...args: unknown[]) => {
      calls.push({ method: "expire", args });
      return 1;
    },
    del: async (...args: unknown[]) => {
      calls.push({ method: "del", args });
      return 1;
    },
  } as unknown as IORedis;

  const heartbeat = createWorkerHeartbeat({
    client: fakeClient,
    workerId: "worker-test",
    queues: ["publish-post-platform", "sync-post-analytics"],
    intervalMs: 60 * 60_000,
  });
  heartbeat.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await heartbeat.stop();

  assert.equal(calls[0]?.method, "hset");
  assert.equal(calls[1]?.method, "expire");
  assert.equal(calls[1]?.args[1], RELIABILITY_THRESHOLDS.heartbeatTtlSeconds);
  assert.equal(calls.at(-1)?.method, "del");
});

