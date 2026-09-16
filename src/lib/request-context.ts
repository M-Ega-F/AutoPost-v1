import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import type { WorkspaceAuthorizationContext } from "@/lib/auth/authorization";
import type { WorkspaceContext, WorkspaceSummary } from "@/lib/domain/workspaces";
import type { TransportCorrelation } from "@/lib/transport";

export type RequestContext = {
  contextId: string;
  transportId?: string;
  transportKind?: TransportCorrelation["transportKind"];
  currentUserPromise?: Promise<User | null>;
  personalWorkspacePromises: Map<string, Promise<WorkspaceSummary>>;
  activeWorkspacePromises: Map<string, Promise<WorkspaceContext>>;
  workspacePromises: Map<string, Promise<WorkspaceSummary | null>>;
  authorizationPromises: Map<string, Promise<WorkspaceAuthorizationContext>>;
  metrics: {
    authResolveCount: number;
    authCacheHitCount: number;
    personalWorkspaceResolveCount: number;
    personalWorkspaceCacheHitCount: number;
    activeWorkspaceResolveCount: number;
    activeWorkspaceCacheHitCount: number;
    membershipResolveCount: number;
    membershipCacheHitCount: number;
    authorizationResolveCount: number;
    authorizationCacheHitCount: number;
    perfBoundaryCount: number;
  };
};

const storage = new AsyncLocalStorage<RequestContext>();

function createRequestContext(): RequestContext {
  return {
    contextId: randomUUID(),
    personalWorkspacePromises: new Map(),
    activeWorkspacePromises: new Map(),
    workspacePromises: new Map(),
    authorizationPromises: new Map(),
    metrics: {
      authResolveCount: 0,
      authCacheHitCount: 0,
      personalWorkspaceResolveCount: 0,
      personalWorkspaceCacheHitCount: 0,
      activeWorkspaceResolveCount: 0,
      activeWorkspaceCacheHitCount: 0,
      membershipResolveCount: 0,
      membershipCacheHitCount: 0,
      authorizationResolveCount: 0,
      authorizationCacheHitCount: 0,
      perfBoundaryCount: 0,
    },
  };
}

// React invalidates server-component caches for every server request/render.
// Keeping this cache at module scope gives sibling RSC boundaries one context
// without introducing a process-global map that could leak across users.
const getRenderRequestContext = cache(createRequestContext);

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setRequestTransportCorrelation(
  correlation: TransportCorrelation | undefined,
): boolean {
  const context = currentRequestContext();
  if (!context || !correlation) return false;
  if (context.transportId && context.transportId !== correlation.transportId) return false;
  context.transportId = correlation.transportId;
  context.transportKind = correlation.transportKind;
  return true;
}

export function recordRequestContextMetric(metric: keyof RequestContext["metrics"]): void {
  const context = currentRequestContext();
  if (context) context.metrics[metric] += 1;
}

export async function withRequestContext<T>(
  callback: () => T | Promise<T>,
  expectedTransportId?: string,
): Promise<T> {
  const existing = currentRequestContext();
  if (existing) return await callback();

  const renderContext = getRenderRequestContext();
  const context =
    expectedTransportId &&
    renderContext.transportId &&
    renderContext.transportId !== expectedTransportId
      ? createRequestContext()
      : renderContext;

  return await storage.run(context, callback);
}
