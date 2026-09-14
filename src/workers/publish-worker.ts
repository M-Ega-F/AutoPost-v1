import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { registerHooks } from "node:module";

import type { Job } from "bullmq";
import { Worker } from "bullmq";
import "dotenv/config";
import { config } from "dotenv";

import { ProviderError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { PublishJobData } from "@/lib/queue/publish";
import type { AnalyticsJobData } from "@/lib/queue/analytics";

config({ path: ".env.local" });

const EMPTY_MODULE = "data:text/javascript,";

// Every module under `src/lib/**` imports "server-only", a marker package that
// only Next's bundler resolves. Outside Next, alias it to an empty module so the
// worker runs the exact same domain code.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const CONCURRENCY = 5;
const RECOVERY_INTERVAL_MS = 60_000;

async function assertConfigured(): Promise<void> {
  const { serverConfig, describeMissingConfig } = await import("@/lib/env");

  try {
    void serverConfig.databaseUrl;
    void serverConfig.redisUrl;
    void serverConfig.encryptionKey;
  } catch (error) {
    const missing = describeMissingConfig(error);
    throw new Error(
      missing
        ? `Missing environment configuration: ${missing.join(", ")}. Add them to .env.local and restart the worker.`
        : error instanceof Error
          ? error.message
          : String(error),
    );
  }
}

async function main(): Promise<void> {
  await assertConfigured();

  const { ANALYTICS_QUEUE_NAME, PUBLISH_QUEUE_NAME, closeQueue, getRedisClient, getRedisConnection } = await import(
    "@/lib/queue"
  );
  const { createWorkerHeartbeat } = await import("@/lib/reliability/health");
  const { executePublishJob } = await import("@/lib/publishing/execute");
  const { runRecoverySweep } = await import("@/lib/publishing/recovery");
  const { closeDb } = await import("@/lib/db");
  const { syncPostPlatformAnalytics } = await import("@/lib/domain/analytics");

  const workerId = `publish-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const log = logger.child({ workerId });

  const worker = new Worker<PublishJobData, void, string>(
    PUBLISH_QUEUE_NAME,
    async (job: Job<PublishJobData, void, string>) => {
      const jobLog = logger.child({
        workerId,
        jobId: job.id ?? null,
        bullmqJobId: job.id ?? null,
        postPlatformId: job.data?.postPlatformId ?? null,
        attempt: job.data?.attempt ?? null,
      });
      const startedAt = Date.now();

      try {
        if (!job.data?.postPlatformId) {
          throw new Error("Job payload is missing postPlatformId.");
        }

        const outcome = await executePublishJob({
          postPlatformId: job.data.postPlatformId,
          attempt: job.data.attempt,
          workerId,
          bullmqJobId: job.id ?? null,
        });

        jobLog.info("job finished", {
          outcome: outcome.status,
          durationMs: Date.now() - startedAt,
          ...(outcome.status === "skipped" ? { reason: outcome.reason } : {}),
        });
      } catch (error) {
        jobLog.error("job failed", {
          durationMs: Date.now() - startedAt,
          code: error instanceof ProviderError ? error.code : undefined,
          retryable: error instanceof ProviderError ? error.retryable : false,
          error: error instanceof Error ? error.message : String(error),
        });
        // Rethrowing is what makes BullMQ's retry/backoff apply.
        throw error;
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: CONCURRENCY,
      stalledInterval: 30_000,
      maxStalledCount: 2,
      lockDuration: 60_000,
      autorun: false,
    },
  );

  const analyticsWorker = new Worker<AnalyticsJobData, void, string>(
    ANALYTICS_QUEUE_NAME,
    async (job: Job<AnalyticsJobData, void, string>) => {
      const jobLog = logger.child({
        workerId,
        jobId: job.id ?? null,
        bullmqJobId: job.id ?? null,
        postPlatformId: job.data?.postPlatformId ?? null,
        queue: ANALYTICS_QUEUE_NAME,
      });
      const startedAt = Date.now();
      if (!job.data?.postPlatformId) {
        throw new Error("Analytics job payload is missing postPlatformId.");
      }
      await syncPostPlatformAnalytics(job.data.postPlatformId);
      jobLog.info("analytics sync finished", { durationMs: Date.now() - startedAt });
    },
    {
      connection: getRedisConnection(),
      concurrency: CONCURRENCY,
      stalledInterval: 30_000,
      maxStalledCount: 2,
      lockDuration: 60_000,
      autorun: false,
    },
  );

  worker.on("completed", (job) => {
    log.info("job completed", {
      jobId: job.id ?? null,
      postPlatformId: job.data?.postPlatformId ?? null,
      attempt: job.data?.attempt ?? null,
    });
  });

  worker.on("failed", (job, error) => {
    log.error("job failed", {
      jobId: job?.id ?? null,
      postPlatformId: job?.data?.postPlatformId ?? null,
      attempt: job?.data?.attempt ?? null,
      code: error instanceof ProviderError ? error.code : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  worker.on("stalled", (jobId) => {
    log.warn("job stalled", { jobId: jobId ?? null });
  });

  worker.on("error", (error) => {
    log.error("worker error", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  let sweeping = false;
  const heartbeat = createWorkerHeartbeat({
    client: getRedisClient(),
    workerId,
    queues: [PUBLISH_QUEUE_NAME, ANALYTICS_QUEUE_NAME],
    onError: (error) => {
      log.warn("worker heartbeat failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const sweep = async (): Promise<void> => {
    if (sweeping) return;
    sweeping = true;
    try {
      const { enqueued } = await runRecoverySweep(workerId);
      if (enqueued > 0) log.info("recovery sweep enqueued", { enqueued });
    } catch (error) {
      log.error("recovery sweep failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      sweeping = false;
    }
  };

  const sweepTimer = setInterval(() => {
    void sweep();
  }, RECOVERY_INTERVAL_MS);
  sweepTimer.unref();

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("worker shutting down", { signal });

    clearInterval(sweepTimer);

    try {
      await heartbeat?.stop();
    } catch {
      // Redis may already be unavailable during shutdown.
    }

    try {
      await worker.close();
      await analyticsWorker.close();
    } catch (error) {
      log.error("worker close failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await closeQueue();
    } catch {
      // The shared Redis connection may already be gone.
    }

    try {
      await closeDb();
    } catch {
      // Nothing to flush; the process is exiting.
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await worker.waitUntilReady();
  await analyticsWorker.waitUntilReady();

  heartbeat.start();

  // `run()` owns the processing loop and only settles once the worker closes,
  // so it must not be awaited here.
  worker.run().catch((error: unknown) => {
    log.error("worker loop stopped", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  analyticsWorker.run().catch((error: unknown) => {
    log.error("analytics worker loop stopped", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  log.info("worker started", {
    queues: [PUBLISH_QUEUE_NAME, ANALYTICS_QUEUE_NAME],
    concurrency: CONCURRENCY,
  });

  void sweep();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("publish worker failed to start", { error: message });
  process.exit(1);
});
