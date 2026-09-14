import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  userPreferences,
  workspaceMembers,
  workspaces,
  posts,
  socialAccounts,
  contentTemplates,
  mediaAssets,
  postMedia,
  postPlatforms,
  workspaceInvitations,
} from "@/lib/db/schema";
import { hasPermission, type Permission, type WorkspaceRole } from "@/lib/auth/permissions";
import { isValidTimeZone } from "@/lib/time";
import { removeMediaObject } from "@/lib/storage";
import { removePublishJobs } from "@/lib/queue/publish";
import { logger } from "@/lib/logger";
import { notifyWorkspaceMemberEvent, notifyWorkspaceTransfer } from "@/lib/domain/notifications";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: WorkspaceRole;
  description: string | null;
  avatarUrl: string | null;
  timezone: string;
  approvalRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberCount?: number;
};

export type WorkspaceContext = {
  userId: string;
  workspace: WorkspaceSummary;
};

async function requireWorkspaceAction(
  userId: string,
  permission: Permission,
): Promise<WorkspaceContext> {
  const context = await getActiveWorkspaceForUser(userId);
  if (!hasPermission(context.workspace.role, permission)) {
    throw new AppError("forbidden", "You don't have permission to perform this action.");
  }
  return context;
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";
}

function personalWorkspaceName(): string {
  return "Personal workspace";
}

function toSummary(
  row: typeof workspaces.$inferSelect,
  role: WorkspaceRole = "owner",
  memberCount?: number,
): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isPersonal: row.isPersonal,
    role,
    description: row.description,
    avatarUrl: row.avatarUrl,
    timezone: row.timezone,
    approvalRequired: row.approvalRequired,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(memberCount === undefined ? {} : { memberCount }),
  };
}

/** Creates the one personal workspace for a user, safely on repeated calls. */
export async function ensurePersonalWorkspace(userId: string): Promise<WorkspaceSummary> {
  const existing = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.ownerId, userId), eq(workspaces.isPersonal, true)))
    .limit(1);

  if (existing[0]) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: existing[0].id, userId, role: "owner" })
      .onConflictDoNothing({ target: [workspaceMembers.workspaceId, workspaceMembers.userId] });
    return toSummary(existing[0]);
  }

  const slug = `personal-${userId.replaceAll("-", "").slice(0, 24)}`;
  const [created] = await db
    .insert(workspaces)
    .values({
      name: personalWorkspaceName(),
      slug,
      ownerId: userId,
      isPersonal: true,
    })
    .onConflictDoNothing()
    .returning();

  const workspace = created ?? (await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.ownerId, userId), eq(workspaces.isPersonal, true)))
    .limit(1))[0];

  if (!workspace) {
    throw new AppError("server_error", "We couldn't prepare your workspace. Try again.");
  }

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId, role: "owner" })
    .onConflictDoNothing({ target: [workspaceMembers.workspaceId, workspaceMembers.userId] });

  return toSummary(workspace);
}

export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  await ensurePersonalWorkspace(userId);
  const rows = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.isPersonal), asc(workspaces.name));

  return rows.map(({ workspace, role }) => toSummary(workspace, role));
}

export async function getWorkspaceForUser(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceSummary | null> {
  const [row] = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  return row ? toSummary(row.workspace, row.role) : null;
}

export async function getActiveWorkspaceForUser(userId: string): Promise<WorkspaceContext> {
  const personal = await ensurePersonalWorkspace(userId);
  const [preferences] = await db
    .select({ activeWorkspaceId: userPreferences.activeWorkspaceId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const activeId = preferences?.activeWorkspaceId;
  if (activeId) {
    const active = await getWorkspaceForUser(userId, activeId);
    if (active) return { userId, workspace: active };
  }

  const currentPersonal = await getWorkspaceForUser(userId, personal.id);
  const fallback = currentPersonal ?? personal;
  if (!preferences || preferences.activeWorkspaceId !== fallback.id) {
    await db
      .insert(userPreferences)
      .values({ userId, activeWorkspaceId: fallback.id })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { activeWorkspaceId: fallback.id, updatedAt: new Date() },
      });
  }
  return { userId, workspace: fallback };
}

export async function getActiveWorkspaceId(userId: string): Promise<string> {
  return (await getActiveWorkspaceForUser(userId)).workspace.id;
}

export async function requireWorkspaceMember(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceSummary> {
  const workspace = await getWorkspaceForUser(userId, workspaceId);
  if (!workspace) {
    throw new AppError("forbidden", "You do not have access to that workspace.");
  }
  return workspace;
}

export async function setActiveWorkspaceForUser(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceSummary> {
  const workspace = await requireWorkspaceMember(userId, workspaceId);
  await db
    .insert(userPreferences)
    .values({ userId, activeWorkspaceId: workspaceId })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { activeWorkspaceId: workspaceId, updatedAt: new Date() },
    });
  return workspace;
}

export type WorkspaceCreateInput = {
  name: string;
  description?: string | null;
  timezone?: string;
};

export type WorkspaceUpdateInput = {
  name?: string;
  slug?: string;
  description?: string | null;
  avatarUrl?: string | null;
  timezone?: string;
  approvalRequired?: boolean;
};

function cleanWorkspaceName(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError("validation_failed", "Workspace name is required.");
  }
  const name = value.trim();
  if (name.length < 2) throw new AppError("validation_failed", "Workspace name must be at least 2 characters.");
  if (name.length > 80) throw new AppError("validation_failed", "Workspace name is too long.");
  return name;
}

function cleanDescription(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new AppError("validation_failed", "Workspace description is invalid.");
  const description = value.trim();
  if (description.length > 500) throw new AppError("validation_failed", "Workspace description is too long.");
  return description || null;
}

function cleanTimezone(value: unknown): string {
  if (typeof value !== "string" || !isValidTimeZone(value.trim())) {
    throw new AppError("validation_failed", "Choose a valid workspace timezone.");
  }
  return value.trim();
}

function cleanSlug(value: unknown): string {
  if (typeof value !== "string") throw new AppError("validation_failed", "Workspace slug is required.");
  const slug = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new AppError("validation_failed", "Use lowercase letters, numbers, and hyphens only.");
  }
  return slug;
}

function cleanAvatarUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) {
    throw new AppError("validation_failed", "Enter a valid avatar URL.");
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("https required");
  } catch {
    throw new AppError("validation_failed", "Avatar URL must use HTTPS.");
  }
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code?: unknown }).code === "23505") return true;
  if ("cause" in error) return isUniqueViolation((error as { cause?: unknown }).cause);
  return false;
}

export async function createWorkspaceForUser(
  userId: string,
  name: string,
  input: Omit<WorkspaceCreateInput, "name"> = {},
): Promise<WorkspaceSummary> {
  const cleanName = cleanWorkspaceName(name);
  const description = cleanDescription(input.description) ?? null;
  const timezone = input.timezone === undefined ? "UTC" : cleanTimezone(input.timezone);
  const baseSlug = slugPart(cleanName);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : baseSlug + "-" + String(attempt + 1);
    try {
      const created = await db.transaction(async (tx) => {
        const [workspace] = await tx
          .insert(workspaces)
          .values({
            name: cleanName,
            slug,
            description,
            timezone,
            ownerId: userId,
            isPersonal: false,
          })
          .returning();
        if (!workspace) throw new AppError("server_error", "We couldn't create that workspace.");
        await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
        await tx
          .insert(userPreferences)
          .values({ userId, activeWorkspaceId: workspace.id })
          .onConflictDoUpdate({
            target: userPreferences.userId,
            set: { activeWorkspaceId: workspace.id, updatedAt: new Date() },
          });
        return toSummary(workspace, "owner", 1);
      });
      return created;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 19) {
        if (isUniqueViolation(error)) throw new AppError("conflict", "That workspace name is already in use.");
        throw error;
      }
    }
  }
  throw new AppError("server_error", "We couldn't create that workspace.");
}

export async function getWorkspaceOverview(userId: string): Promise<WorkspaceOverview> {
  const authorization = await requireWorkspaceAction(userId, "workspace:view");
  const workspace = authorization.workspace;
  if (!workspace) throw new AppError("not_found", "Workspace not found.");

  const [members, postTotals, drafts, scheduled, accounts] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id)),
    db.select({ count: sql<number>`count(*)` }).from(posts).where(eq(posts.workspaceId, workspace.id)),
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.workspaceId, workspace.id), eq(posts.status, "draft"))),
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.workspaceId, workspace.id), eq(posts.status, "scheduled"))),
    db.select({ count: sql<number>`count(*)` }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspace.id), sql`${socialAccounts.status} <> 'disconnected'`)),
  ]);

  return {
    ...workspace,
    memberCount: Number(members[0]?.count ?? 0),
    stats: {
      posts: Number(postTotals[0]?.count ?? 0),
      drafts: Number(drafts[0]?.count ?? 0),
      scheduled: Number(scheduled[0]?.count ?? 0),
      connectedAccounts: Number(accounts[0]?.count ?? 0),
    },
  };
}

export type WorkspaceOverview = WorkspaceSummary & {
  memberCount: number;
  stats: {
    posts: number;
    drafts: number;
    scheduled: number;
    connectedAccounts: number;
  };
};

export async function updateWorkspaceForUser(
  userId: string,
  input: WorkspaceUpdateInput,
): Promise<WorkspaceSummary> {
  const authorization = await requireWorkspaceAction(userId, "workspace:update");
  const values: Partial<typeof workspaces.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = cleanWorkspaceName(input.name);
  if (input.slug !== undefined) {
    if (authorization.workspace.role !== "owner" && authorization.workspace.role !== "admin") {
      throw new AppError("forbidden", "Only workspace owners and admins can change the slug.");
    }
    values.slug = cleanSlug(input.slug);
  }
  if (input.description !== undefined) values.description = cleanDescription(input.description) ?? null;
  if (input.avatarUrl !== undefined) values.avatarUrl = cleanAvatarUrl(input.avatarUrl) ?? null;
  if (input.timezone !== undefined) values.timezone = cleanTimezone(input.timezone);
  if (input.approvalRequired !== undefined) values.approvalRequired = input.approvalRequired;

  try {
    const [updated] = await db
      .update(workspaces)
      .set(values)
      .where(eq(workspaces.id, authorization.workspace.id))
      .returning();
    if (!updated) throw new AppError("not_found", "Workspace not found.");
    return toSummary(updated, authorization.workspace.role);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("conflict", "That workspace slug is already in use.");
    throw error;
  }
}

export async function transferWorkspaceOwnership(
  userId: string,
  targetMemberId: string,
): Promise<void> {
  const authorization = await requireWorkspaceAction(userId, "workspace:transfer");
  if (authorization.workspace.isPersonal) {
    throw new AppError("conflict", "Personal workspace ownership cannot be transferred.");
  }
  const transferred = await db.transaction(async (tx) => {
    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, authorization.workspace.id), eq(workspaces.ownerId, userId)))
      .limit(1);
    if (!workspace) throw new AppError("forbidden", "Only the workspace owner can transfer ownership.");
    const [target] = await tx
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, targetMemberId), eq(workspaceMembers.workspaceId, workspace.id)))
      .limit(1);
    if (!target || target.userId === userId || target.role === "owner") {
      throw new AppError("conflict", "Choose an active member of this workspace.");
    }

    const [oldOwner] = await tx
      .update(workspaceMembers)
      .set({ role: "admin", updatedAt: new Date() })
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, "owner")))
      .returning({ id: workspaceMembers.id });
    if (!oldOwner) throw new AppError("conflict", "Ownership changed before your request completed.");

    const [newOwner] = await tx
      .update(workspaceMembers)
      .set({ role: "owner", updatedAt: new Date() })
      .where(and(eq(workspaceMembers.id, target.id), eq(workspaceMembers.role, target.role)))
      .returning({ userId: workspaceMembers.userId });
    if (!newOwner) throw new AppError("conflict", "The selected member changed before your request completed.");

    const [updated] = await tx
      .update(workspaces)
      .set({ ownerId: newOwner.userId, updatedAt: new Date() })
      .where(and(eq(workspaces.id, workspace.id), eq(workspaces.ownerId, userId)))
      .returning({ id: workspaces.id });
    if (!updated) throw new AppError("conflict", "Ownership changed before your request completed.");
    return { newOwnerId: newOwner.userId };
  });
  await notifyWorkspaceTransfer(authorization.workspace.id, userId, transferred.newOwnerId).catch((error) => {
    logger.warn("workspace transfer notification failed", {
      workspaceId: authorization.workspace.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function leaveWorkspace(userId: string): Promise<{ activeWorkspaceId: string | null }> {
  const authorization = await requireWorkspaceAction(userId, "workspace:leave");
  const result = await db.transaction(async (tx) => {
    const [membership] = await tx
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, authorization.workspace.id), eq(workspaceMembers.userId, userId)))
      .limit(1);
    if (!membership) throw new AppError("forbidden", "You do not belong to this workspace.");
    if (membership.role === "owner") {
      throw new AppError("conflict", "Transfer ownership before leaving this workspace.");
    }
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.id, membership.id));

    const [fallback] = await tx
      .select({ id: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(desc(workspaces.isPersonal), asc(workspaces.name))
      .limit(1);
    await tx
      .insert(userPreferences)
      .values({ userId, activeWorkspaceId: fallback?.id ?? null })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { activeWorkspaceId: fallback?.id ?? null, updatedAt: new Date() },
      });
    return { activeWorkspaceId: fallback?.id ?? null, workspaceId: authorization.workspace.id };
  });
  await notifyWorkspaceMemberEvent(result.workspaceId, userId, "MEMBER_LEFT", userId).catch((error) => {
    logger.warn("member left notification failed", {
      workspaceId: result.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return { activeWorkspaceId: result.activeWorkspaceId };
}

export async function deleteWorkspaceForUser(
  userId: string,
  confirmation: string,
): Promise<{ activeWorkspaceId: string | null }> {
  const authorization = await requireWorkspaceAction(userId, "workspace:delete");
  const workspace = authorization.workspace;
  if (workspace.isPersonal) {
    throw new AppError("conflict", "Personal workspace cannot be deleted.");
  }
  if (confirmation.trim() !== workspace.name) {
    throw new AppError("validation_failed", "Type the workspace name exactly to confirm deletion.");
  }

  const cleanup = await db.transaction(async (tx) => {
    const [processingPost] = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.workspaceId, workspace.id), eq(posts.status, "processing")))
      .limit(1);
    const [processingTarget] = await tx
      .select({ id: postPlatforms.id })
      .from(postPlatforms)
      .innerJoin(posts, eq(posts.id, postPlatforms.postId))
      .where(and(eq(posts.workspaceId, workspace.id), eq(postPlatforms.status, "processing")))
      .limit(1);
    if (processingPost || processingTarget) {
      throw new AppError("conflict", "Cannot delete this workspace while posts are being published.");
    }

    const jobs = await tx
      .select({ jobId: postPlatforms.bullmqJobId })
      .from(postPlatforms)
      .innerJoin(posts, eq(posts.id, postPlatforms.postId))
      .where(and(eq(posts.workspaceId, workspace.id), sql`${postPlatforms.bullmqJobId} is not null`));
    const assetRows = await tx.select({ storageKey: mediaAssets.storageKey }).from(mediaAssets).where(eq(mediaAssets.workspaceId, workspace.id));
    const postMediaRows = await tx
      .select({ storageKey: postMedia.storageKey })
      .from(postMedia)
      .innerJoin(posts, eq(posts.id, postMedia.postId))
      .where(eq(posts.workspaceId, workspace.id));
    const templateRows = await tx.select({ storageKey: contentTemplates.mediaStorageKey }).from(contentTemplates).where(eq(contentTemplates.workspaceId, workspace.id));
    const storageKeys = [...assetRows, ...postMediaRows, ...templateRows]
      .map((row) => row.storageKey)
      .filter((value): value is string => Boolean(value));

    await tx.delete(posts).where(eq(posts.workspaceId, workspace.id));
    await tx.delete(socialAccounts).where(eq(socialAccounts.workspaceId, workspace.id));
    await tx.delete(contentTemplates).where(eq(contentTemplates.workspaceId, workspace.id));
    await tx.delete(mediaAssets).where(eq(mediaAssets.workspaceId, workspace.id));
    await tx.delete(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, workspace.id));
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id));
    const [deleted] = await tx.delete(workspaces).where(and(eq(workspaces.id, workspace.id), eq(workspaces.ownerId, userId))).returning({ id: workspaces.id });
    if (!deleted) throw new AppError("conflict", "Workspace changed before deletion completed.");
    return {
      jobIds: jobs.map((row) => row.jobId).filter((value): value is string => Boolean(value)),
      storageKeys: [...new Set(storageKeys)],
    };
  });

  await removePublishJobs(cleanup.jobIds);
  const storageResults = await Promise.allSettled(cleanup.storageKeys.map((key) => removeMediaObject(key)));
  if (storageResults.some((result) => result.status === "rejected")) {
    logger.warn("workspace media cleanup incomplete", { workspaceId: workspace.id });
  }
  return { activeWorkspaceId: null };
}
