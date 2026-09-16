import "server-only";

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { logger } from "@/lib/logger";
import {
  currentRequestContext,
  setRequestTransportCorrelation,
  withRequestContext,
} from "@/lib/request-context";
import { readServerTransportCorrelation } from "@/lib/transport-server";
import type { TransportCorrelation } from "@/lib/transport";

type PerfContext = {
  endpoint: string;
  requestId: string;
  contextId: string;
  contextReused: boolean;
  transportId?: string;
  transportKind?: TransportCorrelation["transportKind"];
};

const storage = new AsyncLocalStorage<PerfContext>();

/** Opt-in profiling for development and staging only. */
export function perfLoggingEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.APP_ENV === "staging";
}

export async function withPerfRequest<T>(endpoint: string, callback: () => T | Promise<T>): Promise<T> {
  const existingPerfContext = currentPerfContext();
  const enabled = perfLoggingEnabled();
  const transport = enabled
    ? existingPerfContext?.transportId
      ? {
          transportId: existingPerfContext.transportId,
          transportKind: existingPerfContext.transportKind ?? "UNKNOWN",
        }
      : await readServerTransportCorrelation()
    : undefined;
  const startedAt = performance.now();

  return withRequestContext(async () => {
    const requestContext = currentRequestContext();
    const isRootPerfBoundary = !existingPerfContext;
    const contextReused = Boolean(requestContext && requestContext.metrics.perfBoundaryCount > 0);
    if (requestContext) requestContext.metrics.perfBoundaryCount += 1;
    setRequestTransportCorrelation(transport);
    try {
      if (!enabled) return await callback();
      const perfContext = existingPerfContext
        ? {
            ...existingPerfContext,
            endpoint,
            contextId: requestContext?.contextId ?? existingPerfContext.contextId,
            contextReused: true,
          }
        : {
            endpoint,
            requestId: randomUUID(),
            contextId: requestContext?.contextId ?? randomUUID(),
            contextReused,
            transportId: transport?.transportId,
            transportKind: transport?.transportKind,
          };
      return await storage.run(perfContext, callback);
    } finally {
      const perfContext = currentPerfContext();
      const activeRequestContext = currentRequestContext();
      if (enabled && perfContext) {
        logger.info("[PERF][boundary]", {
          endpoint: perfContext.endpoint,
          requestId: perfContext.requestId,
          contextId: activeRequestContext?.contextId ?? perfContext.contextId,
          contextReused: perfContext.contextReused,
          ...(perfContext.transportId
            ? {
                transportId: perfContext.transportId,
                transportKind: perfContext.transportKind,
              }
            : {}),
          durationMs: Math.round(performance.now() - startedAt),
        });
      }
      if (enabled && isRootPerfBoundary && perfContext && activeRequestContext) {
        logger.info("[PERF][context]", {
          endpoint: perfContext.endpoint,
          requestId: perfContext.requestId,
          contextId: activeRequestContext.contextId,
          contextReused: perfContext.contextReused,
          ...(perfContext.transportId
            ? {
                transportId: perfContext.transportId,
                transportKind: perfContext.transportKind,
              }
            : {}),
          ...activeRequestContext.metrics,
        });
      }
    }
  });
}

export function currentPerfContext(): PerfContext | undefined {
  return storage.getStore();
}

export async function measurePerf<T>(
  label: string,
  operation: string,
  callback: () => T | Promise<T>,
  fields: Record<string, unknown> = {},
): Promise<T> {
  if (!perfLoggingEnabled()) return callback();
  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    const context = currentPerfContext();
    const requestContext = currentRequestContext();
    const transportId = context?.transportId ?? requestContext?.transportId;
    const transportKind = context?.transportKind ?? requestContext?.transportKind;
    logger.info(label, {
      ...(context ? { endpoint: context.endpoint, requestId: context.requestId } : {}),
      ...(requestContext ? { contextId: requestContext.contextId } : {}),
      ...(transportId ? { transportId, transportKind } : {}),
      operation,
      durationMs: Math.round(performance.now() - startedAt),
      ...fields,
    });
  }
}
