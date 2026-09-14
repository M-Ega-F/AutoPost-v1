import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { and, eq, lte, or, isNull } from "drizzle-orm";
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

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BODY = 4_096;
const CONCURRENCY = 10;
const RECOVERY_INTERVAL_MS = 60_000;

async function main(): Promise<void> {
  const { serverConfig, describeMissingConfig } = await import("@/lib/env");
  try { void serverConfig.databaseUrl; void serverConfig.redisUrl; void serverConfig.encryptionKey; } catch (error) {
    const missing = describeMissingConfig(error);
    throw new Error(missing ? `Missing environment configuration: ${missing.join(", ")}.` : error instanceof Error ? error.message : String(error));
  }

  const { WEBHOOK_QUEUE_NAME, closeQueue, getRedisClient, getRedisConnection } = await import("@/lib/queue");
  const { createWorkerHeartbeat } = await import("@/lib/reliability/health");
  const { db } = await import("@/lib/db");
  const { webhookDeliveries, webhooks } = await import("@/lib/db/schema");
  const { loadWebhookForDelivery, decryptSecret, WEBHOOK_AUTO_DISABLE_THRESHOLD } = await import("@/lib/webhooks/service");
  const { assertWebhookUrlIsPublic } = await import("@/lib/webhooks/security");
  const { enqueueWebhookDelivery } = await import("@/lib/queue/webhooks");
  const { isRetryableWebhookStatus, retryDelayMs, WEBHOOK_MAX_ATTEMPTS } = await import("@/lib/webhooks/retry");
  const { notifyWebhookOperationalEvent } = await import("@/lib/domain/notifications");
  const { logger } = await import("@/lib/logger");

  type Data = { webhookId: string; deliveryId: string };
  const workerId = `webhook-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const log = logger.child({ workerId, queue: WEBHOOK_QUEUE_NAME });

  const safeBody = async (response: Response): Promise<string> => {
    try { return (await response.text()).slice(0, MAX_RESPONSE_BODY); } catch { return ""; }
  };

  const processDelivery = async (job: Job<Data>): Promise<void> => {
    const row = await loadWebhookForDelivery(job.data.webhookId, job.data.deliveryId);
    if (!row || row.webhook.deletedAt || !row.webhook.isActive || row.delivery.status === "cancelled" || row.delivery.status === "delivered" || row.delivery.status === "failed") return;
    const startedAt = Date.now();
    const attemptCount = row.delivery.attemptCount + 1;
    const now = new Date();
    await db.update(webhookDeliveries).set({ status: "processing", attemptCount, lastAttemptAt: now, updatedAt: now }).where(and(eq(webhookDeliveries.id, row.delivery.id), or(eq(webhookDeliveries.status, "pending"), eq(webhookDeliveries.status, "retrying"))));

    let responseStatus: number | null = null;
    let responseBody = "";
    let errorCode: string | null = null;
    let safeErrorMessage: string | null = null;
    let retryAfter: string | null = null;
    try {
      const target = new URL(row.webhook.url);
      await assertWebhookUrlIsPublic(target);
      const rawPayload = JSON.stringify(row.delivery.payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const { signWebhookPayload } = await import("@/lib/webhooks/signing");
      const response = await fetch(target, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          "user-agent": "AutoPost-Webhooks/1.0",
          "X-AutoPost-Event-Id": row.delivery.eventId,
          "X-AutoPost-Event": row.delivery.eventType,
          "X-AutoPost-Version": "2026-09-01",
          "X-AutoPost-Timestamp": String(timestamp),
          "X-AutoPost-Signature": signWebhookPayload(decryptSecret(row.webhook.encryptedSecret), timestamp, rawPayload),
        },
        body: rawPayload,
      });
      responseStatus = response.status;
      retryAfter = response.headers.get("retry-after");
      responseBody = await safeBody(response);
      if (response.ok) {
        await db.update(webhookDeliveries).set({ status: "delivered", responseStatus, responseTimeMs: Date.now() - startedAt, responseBody: responseBody || null, deliveredAt: new Date(), nextAttemptAt: null, updatedAt: new Date() }).where(eq(webhookDeliveries.id, row.delivery.id));
        await db.update(webhooks).set({ lastDeliveryAt: new Date(), lastSuccessAt: new Date(), consecutiveFailureCount: 0, updatedAt: new Date() }).where(eq(webhooks.id, row.webhook.id));
        return;
      }
      if (!isRetryableWebhookStatus(response.status)) {
        errorCode = `http_${response.status}`;
        safeErrorMessage = "The destination rejected this delivery.";
      }
    } catch (error) {
      errorCode = error instanceof Error && error.name === "TimeoutError" ? "timeout" : error instanceof Error && error.message.includes("not allowed") ? "url_blocked" : "network_error";
      safeErrorMessage = errorCode === "url_blocked" ? "The destination address is not allowed." : errorCode === "timeout" ? "The destination did not respond in time." : "The destination could not be reached.";
    }

    const retryable = isRetryableWebhookStatus(responseStatus) && errorCode !== "url_blocked";
    if (retryable && attemptCount < WEBHOOK_MAX_ATTEMPTS) {
      const nextAttemptAt = new Date(Date.now() + retryDelayMs(attemptCount, retryAfter));
      await db.update(webhookDeliveries).set({ status: "retrying", responseStatus, responseTimeMs: Date.now() - startedAt, responseBody: responseBody || null, errorCode, safeErrorMessage, nextAttemptAt, updatedAt: new Date() }).where(eq(webhookDeliveries.id, row.delivery.id));
      try { await enqueueWebhookDelivery({ webhookId: row.webhook.id, deliveryId: row.delivery.id, attempt: attemptCount, delayMs: nextAttemptAt.getTime() - Date.now() }); } catch (error) { log.warn("webhook retry enqueue failed", { deliveryId: row.delivery.id, error: error instanceof Error ? error.message : String(error) }); }
      return;
    }

    const nextFailureCount = row.webhook.failureCount + 1;
    const nextConsecutive = row.webhook.consecutiveFailureCount + 1;
    const autoDisabled = nextConsecutive >= WEBHOOK_AUTO_DISABLE_THRESHOLD;
    await db.update(webhookDeliveries).set({ status: "failed", responseStatus, responseTimeMs: Date.now() - startedAt, responseBody: responseBody || null, errorCode: errorCode ?? "delivery_failed", safeErrorMessage: safeErrorMessage ?? "The destination rejected this delivery.", nextAttemptAt: null, failedAt: new Date(), updatedAt: new Date() }).where(eq(webhookDeliveries.id, row.delivery.id));
    await db.update(webhooks).set({ isActive: autoDisabled ? false : row.webhook.isActive, failureCount: nextFailureCount, consecutiveFailureCount: nextConsecutive, lastDeliveryAt: new Date(), lastFailureAt: new Date(), disabledAt: autoDisabled ? new Date() : row.webhook.disabledAt, disabledReason: autoDisabled ? "repeated_delivery_failures" : row.webhook.disabledReason, updatedAt: new Date() }).where(eq(webhooks.id, row.webhook.id));
    void notifyWebhookOperationalEvent(row.webhook.workspaceId, row.webhook.id, row.delivery.eventType === "webhook.test" ? "test_failed" : autoDisabled ? "auto_disabled" : "delivery_failed");
    throw new Error(safeErrorMessage ?? "Webhook delivery failed.");
  };

  const worker = new Worker<Data>(WEBHOOK_QUEUE_NAME, processDelivery, { connection: getRedisConnection(), concurrency: CONCURRENCY, stalledInterval: 30_000, maxStalledCount: 2, lockDuration: 60_000, autorun: false });
  worker.on("error", (error) => log.error("webhook worker error", { error: error instanceof Error ? error.message : String(error) }));
  worker.on("failed", (job, error) => log.error("webhook delivery failed", { deliveryId: job?.data?.deliveryId ?? null, error: error instanceof Error ? error.message : String(error) }));

  const heartbeat = createWorkerHeartbeat({ client: getRedisClient(), workerId, queues: [WEBHOOK_QUEUE_NAME], onError: (error) => log.warn("webhook heartbeat failed", { error: error instanceof Error ? error.message : String(error) }) });
  const recovery = async (): Promise<void> => {
    const rows = await db.select({ id: webhookDeliveries.id, webhookId: webhookDeliveries.webhookId }).from(webhookDeliveries).where(and(or(eq(webhookDeliveries.status, "pending"), and(eq(webhookDeliveries.status, "retrying"), or(isNull(webhookDeliveries.nextAttemptAt), lte(webhookDeliveries.nextAttemptAt, new Date())))))).limit(100);
    for (const delivery of rows) { try { await enqueueWebhookDelivery({ webhookId: delivery.webhookId, deliveryId: delivery.id }); } catch { /* next sweep retries */ } }
  };
  const recoveryTimer = setInterval(() => void recovery(), RECOVERY_INTERVAL_MS); recoveryTimer.unref();
  let shuttingDown = false;
  const shutdown = async (signal: string) => { if (shuttingDown) return; shuttingDown = true; log.info("webhook worker shutting down", { signal }); clearInterval(recoveryTimer); await heartbeat.stop().catch(() => undefined); await worker.close().catch(() => undefined); await closeQueue().catch(() => undefined); process.exit(0); };
  process.on("SIGTERM", () => void shutdown("SIGTERM")); process.on("SIGINT", () => void shutdown("SIGINT"));
  await worker.waitUntilReady(); heartbeat.start(); await worker.run();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
