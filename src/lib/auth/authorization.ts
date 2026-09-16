import "server-only";

import { getActiveWorkspaceForUser, getWorkspaceForUser, type WorkspaceSummary } from "@/lib/domain/workspaces";
import { hasPermission, type Permission, type WorkspaceRole } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { measurePerf } from "@/lib/perf";
import { currentRequestContext, recordRequestContextMetric } from "@/lib/request-context";

export type WorkspaceAuthorizationContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  workspace: WorkspaceSummary;
};

export async function getWorkspaceAuthorizationContext(userId: string, workspaceId?: string): Promise<WorkspaceAuthorizationContext> {
  const requestContext = currentRequestContext();
  const cacheKey = `${userId}:${workspaceId ?? "active"}`;
  const cached = requestContext?.authorizationPromises.get(cacheKey);
  if (cached) {
    recordRequestContextMetric("authorizationCacheHitCount");
    return cached;
  }
  recordRequestContextMetric("authorizationResolveCount");
  const promise = measurePerf("[PERF][authorization]", "getWorkspaceAuthorizationContext", async () => {
    const workspace = workspaceId ? await getWorkspaceForUser(userId, workspaceId) : (await getActiveWorkspaceForUser(userId)).workspace;
    if (!workspace) throw new AppError("forbidden", "You do not have access to that workspace.");
    return { userId, workspaceId: workspace.id, role: workspace.role, workspace };
  });
  requestContext?.authorizationPromises.set(cacheKey, promise);
  return promise;
}

export async function requireWorkspacePermission(userId: string, permission: Permission, workspaceId?: string): Promise<WorkspaceAuthorizationContext> {
  return measurePerf("[PERF][authorization]", "requireWorkspacePermission", async () => {
    const context = await getWorkspaceAuthorizationContext(userId, workspaceId);
    if (!hasPermission(context.role, permission)) throw new AppError("forbidden", "You don't have permission to perform this action.");
    return context;
  }, { permission });
}

export const requireActiveWorkspacePermission = requireWorkspacePermission;
