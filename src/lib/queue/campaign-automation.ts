import type { JobsOptions } from "bullmq";
import { randomUUID } from "node:crypto";

import { CAMPAIGN_AUTOMATION_QUEUE_NAME, getCampaignAutomationQueue, getRedisClient } from "@/lib/queue";
import { INTELLIGENCE_THRESHOLDS, type CampaignIntelligenceEvaluationMode, type CampaignIntelligenceSnapshotReason } from "@/lib/domain/campaign-intelligence";

export type CampaignAutomationTrigger =
  | "published"
  | "analytics_updated"
  | "approval_changed"
  | "post_failed"
  | "campaign_updated"
  | "scheduled"
  | "manual";

export type CampaignAutomationJobData = {
  campaignId: string;
  workspaceId: string;
  trigger: CampaignAutomationTrigger;
  evaluationMode?: CampaignIntelligenceEvaluationMode;
  reason?: CampaignIntelligenceSnapshotReason;
  priority?: number;
};

export function campaignAutomationJobId(campaignId: string, trigger: CampaignAutomationTrigger, bucket = Math.floor(Date.now() / 60_000), mode: CampaignIntelligenceEvaluationMode = "incremental"): string {
  return `campaign-evaluation:${campaignId}:${trigger}:${mode}:${bucket}`;
}

export async function enqueueCampaignEvaluation(input: CampaignAutomationJobData): Promise<string | undefined> {
  const options: JobsOptions = {
    jobId: campaignAutomationJobId(input.campaignId, input.trigger, undefined, input.evaluationMode ?? "incremental"),
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    priority: input.priority,
  };
  const job = await getCampaignAutomationQueue().add(CAMPAIGN_AUTOMATION_QUEUE_NAME, { ...input, evaluationMode: input.evaluationMode ?? "incremental", reason: input.reason ?? "automation" }, options);
  return job.id;
}

export async function withCampaignEvaluationLock<T>(input: { workspaceId: string; campaignId: string; task: () => Promise<T> }): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const key = `autopost:campaign-evaluation-lock:${input.workspaceId}:${input.campaignId}`;
  const token = randomUUID();
  const redis = getRedisClient();
  const acquired = await redis.set(key, token, "PX", INTELLIGENCE_THRESHOLDS.evaluationLockTtlMs, "NX");
  if (acquired !== "OK") return { acquired: false };
  try {
    return { acquired: true, value: await input.task() };
  } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token).catch(() => undefined);
  }
}

export type CampaignSchedulerJobData = { trigger: "scheduler" };

export async function ensureCampaignAutomationSchedule(intervalMs: number): Promise<void> {
  await getCampaignAutomationQueue().upsertJobScheduler(
    "campaign-evaluation-scheduler",
    { every: intervalMs },
    {
      name: CAMPAIGN_AUTOMATION_QUEUE_NAME,
      data: { trigger: "scheduler" } satisfies CampaignSchedulerJobData,
      opts: { attempts: 3, backoff: { type: "exponential", delay: 15_000 } },
    },
  );
}
