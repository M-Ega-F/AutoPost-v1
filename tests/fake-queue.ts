import type { EnqueueInput } from "@/lib/queue/publish";
import type { AnalyticsJobData } from "@/lib/queue/analytics";

/**
 * Records what would have gone to BullMQ/Redis. The queue is an external
 * boundary, not the thing under test — what matters is that the right job is
 * enqueued with the right delay, and that cancelling removes it.
 */

export type FakeJob = {
  id: string;
  name: string;
  postPlatformId: string;
  attempt: number;
  delayMs: number | null;
  maxAttempts: number | null;
};

export const enqueued: FakeJob[] = [];
export const removed: string[] = [];
export const PUBLISH_QUEUE_NAME = "publish-post-platform";
export const webhookEnqueued: Array<{ webhookId: string; deliveryId: string; delayMs: number | null }> = [];
export const campaignEvaluationsEnqueued: Array<{ campaignId: string; workspaceId: string; trigger: string }> = [];

export function publishJobId(postPlatformId: string, attempt: number): string {
  return `${postPlatformId}-${attempt}`;
}

export async function enqueuePublishJob(
  input: EnqueueInput,
): Promise<string | undefined> {
  const id = publishJobId(input.postPlatformId, input.attempt);

  enqueued.push({
    id,
    name: "publish",
    postPlatformId: input.postPlatformId,
    attempt: input.attempt,
    delayMs: typeof input.delayMs === "number" ? Math.ceil(input.delayMs) : null,
    maxAttempts: typeof input.maxAttempts === "number" ? input.maxAttempts : null,
  });

  return id;
}

export const ANALYTICS_INITIAL_DELAY_MS = 5 * 60_000;

export async function enqueueAnalyticsJob(
  input: AnalyticsJobData & { delayMs?: number },
): Promise<string | undefined> {
  const id = `analytics:${input.postPlatformId}`;
  enqueued.push({
    id,
    name: "sync-post-analytics",
    postPlatformId: input.postPlatformId,
    attempt: 0,
    delayMs: typeof input.delayMs === "number" ? Math.ceil(input.delayMs) : null,
    maxAttempts: null,
  });
  return id;
}

export async function removePublishJob(
  jobId: string | null | undefined,
): Promise<boolean> {
  if (!jobId) return false;
  removed.push(jobId);
  return true;
}

export async function removePublishJobs(
  jobIds: Array<string | null | undefined>,
): Promise<number> {
  let count = 0;
  for (const jobId of jobIds) {
    if (await removePublishJob(jobId)) count += 1;
  }
  return count;
}

export function resetQueue(): void {
  enqueued.length = 0;
  removed.length = 0;
  webhookEnqueued.length = 0;
  campaignEvaluationsEnqueued.length = 0;
}

export async function enqueueCampaignEvaluation(input: { campaignId: string; workspaceId: string; trigger: string }): Promise<string> {
  campaignEvaluationsEnqueued.push(input);
  return `campaign-evaluation:${input.campaignId}`;
}

export function jobsFor(postPlatformId: string): FakeJob[] {
  return enqueued.filter((job) => job.postPlatformId === postPlatformId);
}

export const WEBHOOK_QUEUE_NAME = "deliver-webhook";
export const REVIEW_AUTOMATION_QUEUE_NAME = "review-automation";
export const CAMPAIGN_AUTOMATION_QUEUE_NAME = "campaign-evaluation";
export function getReviewAutomationQueue(): { getJobCounts: (...states: string[]) => Promise<Record<string, number>>; getJobs: (...args: unknown[]) => Promise<unknown[]> } {
  return {
    async getJobCounts() { return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, prioritized: 0 }; },
    async getJobs() { return []; },
  };
}
export function getCampaignAutomationQueue(): { getJobCounts: (...states: string[]) => Promise<Record<string, number>>; getJobs: (...args: unknown[]) => Promise<unknown[]> } {
  return {
    async getJobCounts() { return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, prioritized: 0 }; },
    async getJobs() { return []; },
  };
}
export function getWebhookQueue(): { add: (name: string, data: { webhookId: string; deliveryId: string }, options?: { delay?: number; jobId?: string }) => Promise<{ id: string }> } {
  return {
    async add(_name, data, options) {
      webhookEnqueued.push({ webhookId: data.webhookId, deliveryId: data.deliveryId, delayMs: options?.delay ?? null });
      return { id: options?.jobId ?? data.deliveryId };
    },
  };
}
