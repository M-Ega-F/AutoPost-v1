import type { JobsOptions } from "bullmq";

import { REVIEW_AUTOMATION_QUEUE_NAME, getReviewAutomationQueue } from "@/lib/queue";

export type ReviewAutomationJobData = { trigger: "scheduler" };

export function reviewAutomationJobId(timestamp = Date.now()): string {
  return `review-automation:${timestamp}`;
}

export async function ensureReviewAutomationSchedule(intervalMs: number): Promise<void> {
  const options: JobsOptions = { attempts: 3, backoff: { type: "exponential", delay: 15_000 } };
  await getReviewAutomationQueue().upsertJobScheduler(
    "review-automation-scheduler",
    { every: intervalMs },
    { name: REVIEW_AUTOMATION_QUEUE_NAME, data: { trigger: "scheduler" }, opts: options },
  );
}

export async function enqueueReviewAutomation(input: ReviewAutomationJobData = { trigger: "scheduler" }): Promise<string | undefined> {
  const job = await getReviewAutomationQueue().add(REVIEW_AUTOMATION_QUEUE_NAME, input, { jobId: reviewAutomationJobId() });
  return job.id;
}
