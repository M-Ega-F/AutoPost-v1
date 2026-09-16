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

  const { REVIEW_AUTOMATION_QUEUE_NAME, closeQueue, getRedisClient, getRedisConnection, getReviewAutomationQueue } = await import("@/lib/queue");
  const { ensureReviewAutomationSchedule } = await import("@/lib/queue/review-automation");
  const { processReviewAutomationBatch } = await import("@/lib/domain/review-automation");
  const { createWorkerHeartbeat } = await import("@/lib/reliability/health");
  const { logger } = await import("@/lib/logger");

  type Data = { trigger: "scheduler" };
  const workerId = `review-automation-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const log = logger.child({ workerId, queue: REVIEW_AUTOMATION_QUEUE_NAME });
  const worker = new Worker<Data>(REVIEW_AUTOMATION_QUEUE_NAME, async (_job: Job<Data>) => {
    const result = await processReviewAutomationBatch();
    log.info("review automation batch completed", result);
  }, { connection: getRedisConnection(), concurrency: 1, stalledInterval: 30_000, maxStalledCount: 2, lockDuration: 60_000, autorun: false });
  worker.on("error", (error) => log.error("review automation worker error", { error: error instanceof Error ? error.message : String(error) }));
  worker.on("failed", (job, error) => log.error("review automation job failed", { jobId: job?.id ?? null, error: error instanceof Error ? error.message : String(error) }));

  const heartbeat = createWorkerHeartbeat({ client: getRedisClient(), workerId, queues: [REVIEW_AUTOMATION_QUEUE_NAME], onError: (error) => log.warn("review automation heartbeat failed", { error: error instanceof Error ? error.message : String(error) }) });
  let shuttingDown = false;
  const shutdown = async (signal: string) => { if (shuttingDown) return; shuttingDown = true; log.info("review automation worker shutting down", { signal }); await heartbeat.stop().catch(() => undefined); await worker.close().catch(() => undefined); await closeQueue().catch(() => undefined); process.exit(0); };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await worker.waitUntilReady();
  await ensureReviewAutomationSchedule(serverConfig.reviewAutomationIntervalMs);
  void getReviewAutomationQueue();
  heartbeat.start();
  await worker.run();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
