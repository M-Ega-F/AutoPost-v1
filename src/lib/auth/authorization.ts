import "server-only";

import { getActiveWorkspaceForUser, getWorkspaceForUser, type WorkspaceSummary } from "@/lib/domain/workspaces";
import { hasPermission, type Permission, type WorkspaceRole } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";

export type WorkspaceAuthorizationContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  workspace: WorkspaceSummary;
};

export async function getWorkspaceAuthorizationContext(userId: string, workspaceId?: string): Promise<WorkspaceAuthorizationContext> {
  const workspace = workspaceId ? await getWorkspaceForUser(userId, workspaceId) : (await getActiveWorkspaceForUser(userId)).workspace;
  if (!workspace) throw new AppError("forbidden", "You do not have access to that workspace.");
  return { userId, workspaceId: workspace.id, role: workspace.role, workspace };
}

export async function requireWorkspacePermission(userId: string, permission: Permission, workspaceId?: string): Promise<WorkspaceAuthorizationContext> {
  const context = await getWorkspaceAuthorizationContext(userId, workspaceId);
  if (!hasPermission(context.role, permission)) throw new AppError("forbidden", "You don't have permission to perform this action.");
  return context;
}

export const requireActiveWorkspacePermission = requireWorkspacePermission;
