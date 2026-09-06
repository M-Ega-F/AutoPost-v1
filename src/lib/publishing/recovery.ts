import "server-only";

import {
  MAX_ATTEMPTS,
  findStalledPlatformIds,
  releaseClaim,
} from "@/lib/domain/executions";
import {
  findDuePendingPlatforms,
  findPendingImmediatePlatforms,
  markPlatformQueued,
} from "@/lib/domain/posts";
import { getPublishQueue } from "@/lib/queue";
import { enqueuePublishJob, publishJobId } from "@/lib/queue/publish";
import { logger, type Logger } from "@/lib/logger";

/**
 * Ids this process is already enqueueing. Two sweeps (or a sweep and a retry)
 * must never queue the same target twice.
 */
const inFlight = new Set<string>();

export type SweepResult = {
  label: string;
  enqueued: number;
  skipped: number;
  failed: number;
};

/**
 * This sweep is the safety net for scheduled posts, so it must keep working
 * even when the shared enqueue helper cannot build a job id.
 */
async function enqueueTarget(
  postPlatformId: string,
  attempt: number,
): Promise<string | undefined> {
  try {
    return await enqueuePublishJob({
      postPlatformId,
      attempt,
      delayMs: 0,
      maxAttempts: MAX_ATTEMPTS,
    });
  } catch (error) {
    logger.warn("publish queue helper failed, enqueueing directly", {
      postPlatformId,
      error: error instanceof Error ? error.message : String(error),
    });

    const job = await getPublishQueue().add(
      "publish",
      { postPlatformId, attempt },
      {
        jobId: publishJobId(postPlatformId, attempt).replaceAll(":", "-"),
        attempts: MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 15_000 },
      },
    );

    return job.id;
  }
}

/**
 * The database is the source of truth, so targets that are due but were never
 * queued (Redis outage at creation time) are picked up here. A scheduled post
 * can therefore never be lost.
 */
export async function requeueDuePlatforms(
  workerId: string,
): Promise<SweepResult> {
  const [due, immediate] = await Promise.all([
    findDuePendingPlatforms(),
    findPendingImmediatePlatforms(),
  ]);

  const ids = [
    ...new Set([...due.map((row) => row.id), ...immediate.map((row) => row.id)]),
  ];

  return enqueueAll(ids, "due", logger.child({ workerId }));
}

/**
 * Rows a crashed worker left in `processing` with a stale lock: give the lock
 * back and queue them again.
 */
export async function recoverStalledPlatforms(): Promise<SweepResult> {
  const ids = await findStalledPlatformIds();
  const log = logger.child({ sweep: "stalled" });

  const result: SweepResult = {
    label: "stalled",
    enqueued: 0,
    skipped: 0,
    failed: 0,
  };

  for (const id of ids) {
    if (inFlight.has(id)) {
      result.skipped += 1;
      continue;
    }
    inFlight.add(id);

    try {
      await releaseClaim(id);
      const jobId = await enqueueTarget(id, 1);
      await markPlatformQueued(id, jobId);
      result.enqueued += 1;
      log.warn("stalled target re-queued", { postPlatformId: id });
    } catch (error) {
      result.failed += 1;
      log.error("stalled target recovery failed", {
        postPlatformId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.delete(id);
    }
  }

  return result;
}

async function enqueueAll(
  ids: string[],
  label: string,
  log: Logger,
): Promise<SweepResult> {
  const result: SweepResult = { label, enqueued: 0, skipped: 0, failed: 0 };

  for (const id of ids) {
    if (inFlight.has(id)) {
      result.skipped += 1;
      continue;
    }
    inFlight.add(id);

    try {
      const jobId = await enqueuePublishJob({
        postPlatformId: id,
        attempt: 1,
        delayMs: 0,
        maxAttempts: MAX_ATTEMPTS,
      });
      await markPlatformQueued(id, jobId);
      result.enqueued += 1;
      log.info("pending target enqueued", { postPlatformId: id, label });
    } catch (error) {
      result.failed += 1;
      log.error("pending target enqueue failed", {
        postPlatformId: id,
        label,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.delete(id);
    }
  }

  return result;
}

export async function runRecoverySweep(
  workerId: string,
): Promise<{ enqueued: number; results: SweepResult[] }> {
  const results: SweepResult[] = [];

  try {
    results.push(await requeueDuePlatforms(workerId));
  } catch (error) {
    logger.error("recovery sweep failed", {
      sweep: "due",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    results.push(await recoverStalledPlatforms());
  } catch (error) {
    logger.error("recovery sweep failed", {
      sweep: "stalled",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    enqueued: results.reduce((total, result) => total + result.enqueued, 0),
    results,
  };
}
