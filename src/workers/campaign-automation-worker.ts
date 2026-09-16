import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { Worker, type Job } from "bullmq";
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

const EMPTY_MODULE = "data:text/javascript,";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

async function main(): Promise<void> {
  const { serverConfig, describeMissingConfig } = await import("@/lib/env");
  try { void serverConfig.databaseUrl; void serverConfig.redisUrl; } catch (error) {
    const missing = describeMissingConfig(error);
    throw new Error(missing ? `Missing environment configuration: ${missing.join(", ")}.` : error instanceof Error ? error.message : String(error));
  }

  const { CAMPAIGN_AUTOMATION_QUEUE_NAME, closeQueue, getCampaignAutomationQueue, getRedisClient, getRedisConnection } = await import("@/lib/queue");
  const { ensureCampaignAutomationSchedule, enqueueCampaignEvaluation, withCampaignEvaluationLock } = await import("@/lib/queue/campaign-automation");
  const { evaluateCampaignAutomation, listCampaignIdsForEvaluation } = await import("@/lib/domain/campaign-automation");
  const { createWorkerHeartbeat } = await import("@/lib/reliability/health");
  const { logger } = await import("@/lib/logger");

  type Data = { trigger: "scheduler" } | { campaignId: string; workspaceId: string; trigger: import("@/lib/queue/campaign-automation").CampaignAutomationTrigger; evaluationMode?: "incremental" | "full"; reason?: import("@/lib/domain/campaign-intelligence").CampaignIntelligenceSnapshotReason; priority?: number };
  const workerId = `campaign-automation-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const log = logger.child({ workerId, queue: CAMPAIGN_AUTOMATION_QUEUE_NAME });
  const heartbeat = createWorkerHeartbeat({ client: getRedisClient(), workerId, queues: [CAMPAIGN_AUTOMATION_QUEUE_NAME], onError: (error) => log.warn("campaign automation heartbeat failed", { error: error instanceof Error ? error.message : String(error) }) });
  const worker = new Worker<Data>(CAMPAIGN_AUTOMATION_QUEUE_NAME, async (job: Job<Data>) => {
    if (job.data.trigger === "scheduler") {
      const campaigns = await listCampaignIdsForEvaluation(undefined, 100);
      for (const campaign of campaigns) await enqueueCampaignEvaluation({ ...campaign, trigger: "scheduled" });
      log.info("campaign evaluation batch queued", { count: campaigns.length });
      return;
    }
    const evaluationData = job.data as Exclude<Data, { trigger: "scheduler" }>;
    const locked = await withCampaignEvaluationLock({ workspaceId: evaluationData.workspaceId, campaignId: evaluationData.campaignId, task: () => evaluateCampaignAutomation(evaluationData) });
    if (!locked.acquired) {
      log.info("campaign evaluation skipped because another worker holds the lock", { campaignId: evaluationData.campaignId });
      return { skipped: true };
    }
    const result = locked.value;
    heartbeat.update({ evaluationsProcessed: 1, evaluationFailures: result.failedEvents, lastEvaluationAt: Date.now() });
    log.info("campaign evaluation completed", result);
  }, { connection: getRedisConnection(), concurrency: 2, stalledInterval: 30_000, maxStalledCount: 2, lockDuration: 60_000, autorun: false });
  worker.on("error", (error) => log.error("campaign automation worker error", { error: error instanceof Error ? error.message : String(error) }));
  worker.on("failed", (job, error) => log.error("campaign automation job failed", { jobId: job?.id ?? null, error: error instanceof Error ? error.message : String(error) }));

  let shuttingDown = false;
  const shutdown = async (signal: string) => { if (shuttingDown) return; shuttingDown = true; log.info("campaign automation worker shutting down", { signal }); await heartbeat.stop().catch(() => undefined); await worker.close().catch(() => undefined); await closeQueue().catch(() => undefined); process.exit(0); };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await worker.waitUntilReady();
  await ensureCampaignAutomationSchedule(serverConfig.campaignAutomationIntervalMs);
  void getCampaignAutomationQueue();
  heartbeat.start();
  await worker.run();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
