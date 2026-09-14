import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { Job, Queue } from "bullmq";
import type IORedis from "ioredis";

import { db, postPlatforms, posts } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  getAnalyticsQueue,
  getPublishQueue,
  getWebhookQueue,
  getRedisClient,
} from "@/lib/queue";

export const RELIABILITY_THRESHOLDS = {
  backlogCount: 10,
  backlogAgeMs: 5 * 60_000,
  stuckJobAgeMs: 10 * 60_000,
  staleDelayedJobAgeMs: 5 * 60_000,
  workerStaleMs: 90_000,
  heartbeatTtlSeconds: 120,
} as const;

const MAX_INSPECTED_JOBS = 50;
const MAX_WORKER_RECORDS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const WORKER_HEARTBEAT_PREFIX = "autopost:worker-heartbeat:";

export type HealthStatus = "healthy" | "degraded" | "offline";
export type ReliabilityJobKind = "failed" | "stuck";

export type ReliabilityJob = {
  kind: ReliabilityJobKind;
  queue: "publishing" | "analytics" | "webhooks";
  platform: string | null;
  attemptsMade: number;
  maxAttempts: number;
  finalFailure: boolean;
  ageSeconds: number;
  occurredAt: string;
};

export type QueueHealth = {
  name: "publishing" | "analytics" | "webhooks";
  status: HealthStatus;
  counts: {
    waiting: number | null;
    active: number | null;
    completed: number | null;
    failed: number | null;
    delayed: number | null;
    paused: number | null;
    prioritized: number | null;
  };
  backlog: {
    count: number | null;
    oldestWaitingAt: string | null;
    oldestWaitingAgeSeconds: number | null;
    exceeded: boolean;
  };
  stuckCount: number;
  finalFailureCount: number;
};

export type ReliabilitySnapshot = {
  checkedAt: string;
  overall: HealthStatus;
  redis: {
    status: HealthStatus;
    latencyMs: number | null;
  };
  worker: {
    status: HealthStatus;
    activeCount: number;
    staleCount: number;
    lastSeenAt: string | null;
  };
  queues: {
    publishing: QueueHealth;
    analytics: QueueHealth;
    webhooks: QueueHealth;
  };
  attention: {
    failedCount: number;
    stuckCount: number;
    finalFailureCount: number;
  };
  jobs: ReliabilityJob[];
};

type QueueKey = "publishing" | "analytics" | "webhooks";
type ReliabilityState = "failed" | "active" | "waiting" | "delayed";
type ObservedJob = Job<Record<string, unknown>>;

type JobObservation = {
  kind: ReliabilityJobKind | null;
  state: ReliabilityState;
  queue: QueueKey;
  targetId: string | null;
  platform: string | null;
  attemptsMade: number;
  maxAttempts: number;
  finalFailure: boolean;
  timestamp: number;
};

type RawQueueHealth = {
  name: QueueKey;
  counts: QueueHealth["counts"];
  waiting: JobObservation[];
  jobs: JobObservation[];
  status: HealthStatus;
};

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function safeAttempts(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function safeMaxAttempts(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function targetIdFromJob(job: ObservedJob): string | null {
  const value = job.data?.postPlatformId;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export function classifyReliabilityJob(
  state: ReliabilityState,
  timestamp: number,
  delay: number,
  now = Date.now(),
): ReliabilityJobKind | null {
  const age = now - timestamp;
  if (state === "active" && age >= RELIABILITY_THRESHOLDS.stuckJobAgeMs) return "stuck";
  if (
    state === "delayed" &&
    timestamp + Math.max(0, delay) <= now - RELIABILITY_THRESHOLDS.staleDelayedJobAgeMs
  ) {
    return "stuck";
  }
  if (state === "failed") return "failed";
  return null;
}

function observeJob(
  queue: QueueKey,
  state: ReliabilityState,
  job: ObservedJob,
  now: number,
): JobObservation {
  const attemptsMade = safeAttempts(job.attemptsMade);
  const maxAttempts = safeMaxAttempts(job.opts?.attempts);
  return {
    kind: classifyReliabilityJob(state, job.timestamp, job.delay, now),
    state,
    queue,
    targetId: targetIdFromJob(job),
    platform: null,
    attemptsMade,
    maxAttempts,
    finalFailure: state === "failed" && attemptsMade >= maxAttempts,
    timestamp: Number.isFinite(job.timestamp) ? job.timestamp : now,
  };
}

function emptyQueue(name: QueueKey): QueueHealth {
  return {
    name,
    status: "offline",
    counts: {
      waiting: null,
      active: null,
      completed: null,
      failed: null,
      delayed: null,
      paused: null,
      prioritized: null,
    },
    backlog: {
      count: null,
      oldestWaitingAt: null,
      oldestWaitingAgeSeconds: null,
      exceeded: false,
    },
    stuckCount: 0,
    finalFailureCount: 0,
  };
}

async function collectQueue(
  queue: Queue,
  name: QueueKey,
  now: number,
): Promise<RawQueueHealth> {
  try {
    const [counts, failed, active, waiting, delayed] = await Promise.all([
      queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused", "prioritized"),
      queue.getJobs("failed", 0, MAX_INSPECTED_JOBS - 1, false) as Promise<ObservedJob[]>,
      queue.getJobs("active", 0, MAX_INSPECTED_JOBS - 1, true) as Promise<ObservedJob[]>,
      queue.getJobs("waiting", 0, MAX_INSPECTED_JOBS - 1, true) as Promise<ObservedJob[]>,
      queue.getJobs("delayed", 0, MAX_INSPECTED_JOBS - 1, true) as Promise<ObservedJob[]>,
    ]);
    const observations = [
      ...failed.map((job) => observeJob(name, "failed", job, now)),
      ...active.map((job) => observeJob(name, "active", job, now)),
      ...waiting.map((job) => observeJob(name, "waiting", job, now)),
      ...delayed.map((job) => observeJob(name, "delayed", job, now)),
    ];
    const normalizedCounts = {
      waiting: count(counts.waiting),
      active: count(counts.active),
      completed: count(counts.completed),
      failed: count(counts.failed),
      delayed: count(counts.delayed),
      paused: count(counts.paused),
      prioritized: count(counts.prioritized),
    };
    const backlogCount = (normalizedCounts.waiting ?? 0) + (normalizedCounts.prioritized ?? 0);
    const oldestWaiting = waiting.reduce<number | null>((oldest, job) => {
      const timestamp = Number.isFinite(job.timestamp) ? job.timestamp : null;
      return timestamp === null ? oldest : oldest === null ? timestamp : Math.min(oldest, timestamp);
    }, null);
    const oldestAge = oldestWaiting === null ? null : Math.max(0, Math.floor((now - oldestWaiting) / 1000));
    const stuckCount = observations.filter((job) => job.kind === "stuck").length;
    const exceeded = backlogCount >= RELIABILITY_THRESHOLDS.backlogCount ||
      (oldestAge !== null && oldestAge * 1000 >= RELIABILITY_THRESHOLDS.backlogAgeMs);
    const status: HealthStatus = exceeded || stuckCount > 0 || (normalizedCounts.failed ?? 0) > 0 || (normalizedCounts.paused ?? 0) > 0
      ? "degraded"
      : "healthy";

    return {
      name,
      counts: normalizedCounts,
      waiting: waiting.map((job) => observeJob(name, "waiting", job, now)),
      jobs: observations,
      status,
    };
  } catch (error) {
    logger.warn("reliability queue inspection failed", {
      queue: name,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      name,
      counts: emptyQueue(name).counts,
      waiting: [],
      jobs: [],
      status: "offline",
    };
  }
}

async function visiblePlatforms(
  workspaceId: string,
  targetIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(targetIds.filter((id) => UUID_PATTERN.test(id)))];
  if (ids.length === 0) return new Map();
  try {
    const rows = await db
      .select({ id: postPlatforms.id, platform: postPlatforms.platform })
      .from(postPlatforms)
      .innerJoin(posts, eq(posts.id, postPlatforms.postId))
      .where(and(eq(posts.workspaceId, workspaceId), inArray(postPlatforms.id, ids)));
    return new Map(rows.map((row) => [row.id, row.platform]));
  } catch (error) {
    logger.warn("reliability workspace filter failed", {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

function publicJob(observation: JobObservation, platform: string, now: number): ReliabilityJob {
  return {
    kind: observation.kind as ReliabilityJobKind,
    queue: observation.queue,
    platform,
    attemptsMade: observation.attemptsMade,
    maxAttempts: observation.maxAttempts,
    finalFailure: observation.finalFailure,
    ageSeconds: Math.max(0, Math.floor((now - observation.timestamp) / 1000)),
    occurredAt: new Date(observation.timestamp).toISOString(),
  };
}

function publicQueue(raw: RawQueueHealth, visibleJobs: ReliabilityJob[], now: number): QueueHealth {
  const waiting = raw.waiting.reduce<number | null>((oldest, job) => {
    const timestamp = job.timestamp;
    return oldest === null ? timestamp : Math.min(oldest, timestamp);
  }, null);
  const countValue = (key: keyof QueueHealth["counts"]): number | null => raw.counts[key];
  const backlogCount = (countValue("waiting") ?? 0) + (countValue("prioritized") ?? 0);
  const oldestAge = waiting === null ? null : Math.max(0, Math.floor((now - waiting) / 1000));
  return {
    name: raw.name,
    status: raw.status,
    counts: raw.counts,
    backlog: {
      count: raw.counts.waiting === null && raw.counts.prioritized === null ? null : backlogCount,
      oldestWaitingAt: waiting === null ? null : new Date(waiting).toISOString(),
      oldestWaitingAgeSeconds: oldestAge,
      exceeded: backlogCount >= RELIABILITY_THRESHOLDS.backlogCount ||
        (oldestAge !== null && oldestAge * 1000 >= RELIABILITY_THRESHOLDS.backlogAgeMs),
    },
    stuckCount: visibleJobs.filter((job) => job.kind === "stuck").length,
    finalFailureCount: visibleJobs.filter((job) => job.finalFailure).length,
  };
}

type WorkerHeartbeat = {
  workerId: string;
  lastSeenAt: number;
};

function workerKey(workerId: string): string {
  return `${WORKER_HEARTBEAT_PREFIX}${workerId}`;
}

export function createWorkerHeartbeat(options: {
  client: IORedis;
  workerId: string;
  queues: string[];
  startedAt?: number;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}): { start: () => void; stop: () => Promise<void> } {
  const startedAt = options.startedAt ?? Date.now();
  const intervalMs = options.intervalMs ?? Math.floor(RELIABILITY_THRESHOLDS.workerStaleMs / 3);
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const beat = async (): Promise<void> => {
    if (stopped) return;
    const lastSeenAt = Date.now();
    try {
      const key = workerKey(options.workerId);
      await options.client.hset(
        key,
        "workerId",
        options.workerId,
        "queues",
        JSON.stringify(options.queues),
        "status",
        "running",
        "startedAt",
        String(startedAt),
        "lastSeenAt",
        String(lastSeenAt),
      );
      await options.client.expire(key, RELIABILITY_THRESHOLDS.heartbeatTtlSeconds);
    } catch (error) {
      options.onError?.(error);
    }
  };

  return {
    start: () => {
      if (timer) return;
      void beat();
      timer = setInterval(() => void beat(), intervalMs);
      timer.unref();
    },
    stop: async () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      try {
        await options.client.del(workerKey(options.workerId));
      } catch (error) {
        options.onError?.(error);
      }
    },
  };
}

async function workerHealth(client: IORedis, now: number): Promise<ReliabilitySnapshot["worker"]> {
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await client.scan(cursor, "MATCH", `${WORKER_HEARTBEAT_PREFIX}*`, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...found.slice(0, Math.max(0, MAX_WORKER_RECORDS - keys.length)));
      if (keys.length >= MAX_WORKER_RECORDS) break;
    } while (cursor !== "0");

    if (keys.length === 0) {
      return { status: "offline", activeCount: 0, staleCount: 0, lastSeenAt: null };
    }

    // The pipeline is intentionally bounded by the key set returned by SCAN;
    // it avoids one round trip per worker without using the blocking KEYS command.
    const records: WorkerHeartbeat[] = [];
    const pipeline = client.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const rows = await pipeline.exec();
    for (const row of rows ?? []) {
      const value = row[1];
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, string>;
      const lastSeenAt = Number(record.lastSeenAt);
      if (record.workerId && Number.isFinite(lastSeenAt)) records.push({ workerId: record.workerId, lastSeenAt });
    }
    const active = records.filter((record) => now - record.lastSeenAt < RELIABILITY_THRESHOLDS.workerStaleMs);
    const lastSeenAt = records.reduce<number | null>((latest, record) => latest === null ? record.lastSeenAt : Math.max(latest, record.lastSeenAt), null);
    return {
      status: active.length > 0 ? "healthy" : "degraded",
      activeCount: active.length,
      staleCount: records.length - active.length,
      lastSeenAt: lastSeenAt === null ? null : new Date(lastSeenAt).toISOString(),
    };
  } catch (error) {
    logger.warn("reliability worker inspection failed", { error: error instanceof Error ? error.message : String(error) });
    return { status: "offline", activeCount: 0, staleCount: 0, lastSeenAt: null };
  }
}

async function redisHealth(): Promise<{ status: HealthStatus; latencyMs: number | null; client: IORedis | null }> {
  try {
    const client = getRedisClient();
    const startedAt = Date.now();
    if (client.status === "end" || client.status === "close") return { status: "offline", latencyMs: null, client: null };
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Redis health check timed out.")), 2_000);
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return { status: "healthy", latencyMs: Date.now() - startedAt, client };
  } catch (error) {
    logger.warn("reliability Redis health check failed", { error: error instanceof Error ? error.message : String(error) });
    return { status: "offline", latencyMs: null, client: null };
  }
}

export async function getReliabilitySnapshot(workspaceId: string, now = Date.now()): Promise<ReliabilitySnapshot> {
  const checkedAt = new Date(now).toISOString();
  const redis = await redisHealth();
  if (!redis.client) {
    return {
      checkedAt,
      overall: "offline",
      redis: { status: redis.status, latencyMs: redis.latencyMs },
      worker: { status: "offline", activeCount: 0, staleCount: 0, lastSeenAt: null },
      queues: { publishing: emptyQueue("publishing"), analytics: emptyQueue("analytics"), webhooks: emptyQueue("webhooks") },
      attention: { failedCount: 0, stuckCount: 0, finalFailureCount: 0 },
      jobs: [],
    };
  }

  const [publishingRaw, analyticsRaw, webhooksRaw, worker] = await Promise.all([
    collectQueue(getPublishQueue(), "publishing", now),
    collectQueue(getAnalyticsQueue(), "analytics", now),
    collectQueue(getWebhookQueue(), "webhooks", now),
    workerHealth(redis.client, now),
  ]);
  const allObservations = [...publishingRaw.jobs, ...analyticsRaw.jobs, ...webhooksRaw.jobs];
  const platforms = await visiblePlatforms(
    workspaceId,
    allObservations.map((job) => job.targetId).filter((id): id is string => Boolean(id)),
  );
  const jobs = allObservations
    .filter((job): job is JobObservation & { kind: ReliabilityJobKind; targetId: string } => Boolean(job.kind && job.targetId && platforms.has(job.targetId)))
    .map((job) => publicJob(job, platforms.get(job.targetId) as string, now))
    .sort((a, b) => b.ageSeconds - a.ageSeconds)
    .slice(0, MAX_INSPECTED_JOBS);
  const queues = {
    publishing: publicQueue(publishingRaw, jobs.filter((job) => job.queue === "publishing"), now),
    analytics: publicQueue(analyticsRaw, jobs.filter((job) => job.queue === "analytics"), now),
    webhooks: publicQueue(webhooksRaw, jobs.filter((job) => job.queue === "webhooks"), now),
  };
  const attention = {
    failedCount: jobs.filter((job) => job.kind === "failed").length,
    stuckCount: jobs.filter((job) => job.kind === "stuck").length,
    finalFailureCount: jobs.filter((job) => job.finalFailure).length,
  };
  const overall: HealthStatus = worker.status !== "healthy" || queues.publishing.status !== "healthy" || queues.analytics.status !== "healthy" || queues.webhooks.status !== "healthy"
    ? "degraded"
    : "healthy";
  return { checkedAt, overall, redis: { status: redis.status, latencyMs: redis.latencyMs }, worker, queues, attention, jobs };
}
