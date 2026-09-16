import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";
import { perfLoggingEnabled } from "@/lib/perf";

export type PublishTraceEvent =
  | "PUBLISH_REQUEST"
  | "POST_CREATED"
  | "POST_UPDATED"
  | "EXECUTION_FOUND"
  | "EXECUTION_CREATED"
  | "QUEUE_ENQUEUE_START"
  | "QUEUE_ENQUEUE_SUCCESS"
  | "QUEUE_ENQUEUE_FAILED"
  | "WORKER_JOB_RECEIVED"
  | "EXECUTION_PROCESSING"
  | "PROVIDER_START"
  | "META_REQUEST_START"
  | "META_RESPONSE"
  | "META_RESPONSE_ERROR"
  | "EXECUTION_SUCCESS"
  | "EXECUTION_FAILED"
  | "POST_STATUS_UPDATED";

export type PublishTraceFields = {
  postId?: string;
  postPlatformId?: string;
  executionId?: string;
  bullmqJobId?: string | null;
  jobId?: string | null;
  platform?: string;
  operation?: string;
  queue?: string;
  endpoint?: string;
  method?: string;
  attempt?: number | null;
  attemptNumber?: number | null;
  status?: string | number | null;
  postStatus?: string | null;
  code?: string | null;
  retryable?: boolean;
  targetCount?: number;
  durationMs?: number;
  hasBody?: boolean;
  hasAccessToken?: boolean;
  hasAppSecretProof?: boolean;
  responseSuccess?: boolean;
  metaErrorCode?: string | number | null;
  metaErrorSubcode?: string | number | null;
  metaErrorType?: string | null;
  metaErrorMessage?: string | null;
};

const publishTraceStorage = new AsyncLocalStorage<string>();

/** Correlation only: never place credentials or request bodies in this ID. */
export function createPublishTraceId(): string {
  return randomUUID();
}

export async function withPublishTrace<T>(
  publishTraceId: string | undefined,
  callback: () => T | Promise<T>,
): Promise<T> {
  if (!publishTraceId) return await callback();
  return await publishTraceStorage.run(publishTraceId, callback);
}

/** Development/staging-only, credential-free publish lifecycle diagnostics. */
export function logPublishTrace(
  publishTraceId: string | undefined,
  event: PublishTraceEvent,
  fields: PublishTraceFields = {},
): void {
  const traceId =
    publishTraceId ??
    publishTraceStorage.getStore() ??
    // Worker retries created before trace propagation was added can still
    // reach the provider without an inherited ID. Keep the raw provider error
    // observable with a fresh correlation ID instead of dropping it.
    (event === "META_RESPONSE_ERROR" ? createPublishTraceId() : undefined);
  // Keep the normal lifecycle trace opt-in, but never hide a provider error
  // that is needed to diagnose an external API response in a worker process.
  if (!traceId || (!perfLoggingEnabled() && event !== "META_RESPONSE_ERROR")) return;
  logger.info("[POST-TRACE]", { publishTraceId: traceId, event, ...fields });
}
