import type { JobsOptions } from "bullmq";

import { getAnalyticsQueue } from "@/lib/queue";

export const ANALYTICS_INITIAL_DELAY_MS = 5 * 60_000;

/** Analytics jobs carry IDs only. The worker loads account and post data. */
export type AnalyticsJobData = {
  postPlatformId: string;
};

export function analyticsJobId(postPlatformId: string, requestedAt = Date.now()): string {
  return `analytics:${postPlatformId}:${requestedAt}`;
}

export async function enqueueAnalyticsJob(input: {
  postPlatformId: string;
  delayMs?: number;
}): Promise<string | undefined> {
  const options: JobsOptions = {};
  if (typeof input.delayMs === "number" && input.delayMs > 0) {
    options.delay = Math.ceil(input.delayMs);
  }
  options.attempts = 3;
  options.backoff = { type: "exponential", delay: 15_000 };

  const job = await getAnalyticsQueue().add(
    "sync-post-analytics",
    { postPlatformId: input.postPlatformId },
    { jobId: analyticsJobId(input.postPlatformId), ...options },
  );

  return job.id;
}
