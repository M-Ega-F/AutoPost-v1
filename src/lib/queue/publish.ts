import type { JobsOptions } from "bullmq";

import { getPublishQueue } from "@/lib/queue";

/**
 * BullMQ payloads carry IDs only — never tokens, captions or media URLs.
 * The worker loads everything it needs from the database.
 */
export type PublishJobData = {
  postPlatformId: string;
  attempt: number;
};

export function publishJobId(postPlatformId: string, attempt: number): string {
  return `${postPlatformId}:${attempt}`;
}

export type EnqueueInput = {
  postPlatformId: string;
  attempt: number;
  /** Milliseconds to wait before the job becomes visible. */
  delayMs?: number;
  maxAttempts?: number;
};

export async function enqueuePublishJob(
  input: EnqueueInput,
): Promise<string | undefined> {
  const queue = getPublishQueue();

  const options: JobsOptions = {};
  if (typeof input.maxAttempts === "number") {
    options.attempts = Math.max(1, input.maxAttempts);
    options.backoff = { type: "exponential", delay: 15_000 };
  }
  if (typeof input.delayMs === "number" && input.delayMs > 0) {
    options.delay = Math.ceil(input.delayMs);
  }

  const job = await queue.add(
    "publish",
    { postPlatformId: input.postPlatformId, attempt: input.attempt },
    {
      jobId: publishJobId(input.postPlatformId, input.attempt),
      ...options,
    },
  );

  return job.id;
}

export async function removePublishJob(
  jobId: string | null | undefined,
): Promise<boolean> {
  if (!jobId) return false;

  try {
    const queue = getPublishQueue();
    const job = await queue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === "completed" || state === "failed") return false;

    await job.remove();
    return true;
  } catch {
    return false;
  }
}

export async function removePublishJobs(
  jobIds: Array<string | null | undefined>,
): Promise<number> {
  let removed = 0;
  for (const jobId of jobIds) {
    if (await removePublishJob(jobId)) removed += 1;
  }
  return removed;
}
