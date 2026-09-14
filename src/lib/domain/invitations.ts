import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import {
  INVITABLE_ROLES,
  canManageRole,
  type InvitableWorkspaceRole,
  type WorkspaceRole,
} from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  userPreferences,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { notifyInvitationReceived, notifyWorkspaceMemberEvent } from "@/lib/domain/notifications";
import { emitWebhookEventSafely } from "@/lib/webhooks/events";
import { logger } from "@/lib/logger";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InvitationStatus = "pending" | "accepted" | "cancelled" | "expired";

export type InvitationSummary = {
  id: string;
  email: string;
  role: InvitableWorkspaceRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
};

export type WorkspaceMemberSummary = {
  id: string;
  displayName: string;
  role: WorkspaceRole;
  status: "active";
  joinedAt: Date;
  isCurrentUser: boolean;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeInvitationEmail(value: string): string {
  if (typeof value !== "string") {
    throw new AppError("validation_failed", "Enter a valid email address.");
  }
  const normalized = normalizeEmail(value);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AppError("validation_failed", "Enter a valid email address.");
  }
  return normalized;
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

function assertInvitableRole(value: unknown): InvitableWorkspaceRole {
  if (
    typeof value !== "string" ||
    !(INVITABLE_ROLES as readonly string[]).includes(value)
  ) {
    throw new AppError("validation_failed", "Choose a valid invitation role.");
  }
  return value as InvitableWorkspaceRole;
}

function invitationStatus(
  status: InvitationStatus,
  expiresAt: Date,
  now = new Date(),
): InvitationStatus {
  return status === "pending" && expiresAt <= now ? "expired" : status;
}

function toInvitationSummary(
  row: typeof workspaceInvitations.$inferSelect,
  now = new Date(),
): InvitationSummary {
  return {
    id: row.id,
    email: row.email,
    role: row.role as InvitableWorkspaceRole,
    status: invitationStatus(row.status, row.expiresAt, now),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function assertCanManageTarget(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): void {
  if (!canManageRole(actorRole, targetRole)) {
    throw new AppError("forbidden", "You don't have permission to manage this member.");
  }
}

async function existingMemberForEmail(
  workspaceId: string,
  normalizedEmail: string,
): Promise<boolean> {
  const rows = (await db.execute(sql`
    select wm.id
    from public.workspace_members wm
    join auth.users au on au.id = wm.user_id
    where wm.workspace_id = ${workspaceId}
      and lower(au.email) = ${normalizedEmail}
    limit 1
  `)) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function createWorkspaceInvitation(
  userId: string,
  input: { email: string; role: unknown },
): Promise<{ invitation: InvitationSummary; token: string }> {
  const authorization = await requireWorkspacePermission(userId, "members:invite");
  const email = normalizeInvitationEmail(input.email);
  const role = assertInvitableRole(input.role);
  assertCanManageTarget(authorization.role, role);

  if (await existingMemberForEmail(authorization.workspaceId, email)) {
    throw new AppError("conflict", "That user is already a workspace member.");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = newInvitationToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    try {
      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(workspaceInvitations)
          .where(
            and(
              eq(workspaceInvitations.workspaceId, authorization.workspaceId),
              eq(workspaceInvitations.normalizedEmail, email),
              eq(workspaceInvitations.status, "pending"),
            ),
          )
          .limit(1);

        const [row] = existing
          ? await tx
              .update(workspaceInvitations)
              .set({
                email,
                role,
                tokenHash: hashInvitationToken(token),
                status: "pending",
                expiresAt,
                acceptedAt: null,
                cancelledAt: null,
                createdBy: userId,
                updatedAt: now,
              })
              .where(eq(workspaceInvitations.id, existing.id))
              .returning()
          : await tx
              .insert(workspaceInvitations)
              .values({
                workspaceId: authorization.workspaceId,
                email,
                normalizedEmail: email,
                role,
                tokenHash: hashInvitationToken(token),
                status: "pending",
                expiresAt,
                createdBy: userId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();

        if (!row) throw new AppError("server_error", "We couldn't create the invitation.");
        return { invitation: toInvitationSummary(row, now), token };
      });
      await notifyInvitationReceived(result.invitation.id, userId).catch((error) => {
        logger.warn("invitation notification failed", {
          invitationId: result.invitation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return result;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 1) throw error;
    }
  }

  throw new AppError("server_error", "We couldn't create the invitation.");
}

export async function getInvitationPreview(token: string): Promise<{
  workspaceName: string;
  role: InvitableWorkspaceRole;
  status: InvitationStatus;
}> {
  const [row] = await db
    .select({ invitation: workspaceInvitations, workspaceName: workspaces.name })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
    .where(eq(workspaceInvitations.tokenHash, hashInvitationToken(token)))
    .limit(1);

  if (!row) throw new AppError("not_found", "This invitation is not available.");
  const status = invitationStatus(row.invitation.status, row.invitation.expiresAt);
  if (status === "expired" && row.invitation.status === "pending") {
    await db
      .update(workspaceInvitations)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(workspaceInvitations.id, row.invitation.id),
          eq(workspaceInvitations.status, "pending"),
        ),
      );
  }

  return {
    workspaceName: row.workspaceName,
    role: row.invitation.role as InvitableWorkspaceRole,
    status,
  };
}

export async function invitationMatchesEmail(token: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ email: workspaceInvitations.email })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, hashInvitationToken(token)))
    .limit(1);
  return row ? normalizeEmail(row.email) === normalizeEmail(email) : false;
}

export async function acceptWorkspaceInvitation(
  userId: string,
  currentEmail: string,
  token: string,
): Promise<{ workspaceId: string; role: InvitableWorkspaceRole }> {
  const email = normalizeInvitationEmail(currentEmail);
  const tokenHash = hashInvitationToken(token);

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, tokenHash))
      .limit(1);

    if (!row) throw new AppError("not_found", "This invitation is not available.");
    const status = invitationStatus(row.status, row.expiresAt);
    if (status === "accepted") {
      throw new AppError("conflict", "This invitation was already accepted.");
    }
    if (status === "cancelled") {
      throw new AppError("conflict", "This invitation is no longer available.");
    }
    if (status === "expired") {
      if (row.status === "pending") {
        await tx
          .update(workspaceInvitations)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(workspaceInvitations.id, row.id));
      }
      throw new AppError("gone", "This invitation has expired. Ask for a new link.");
    }
    if (normalizeEmail(row.email) !== email) {
      throw new AppError("forbidden", "This invitation was sent to a different email address.");
    }

    const now = new Date();
    const [claimed] = await tx
      .update(workspaceInvitations)
      .set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(
        and(
          eq(workspaceInvitations.id, row.id),
          eq(workspaceInvitations.status, "pending"),
          sql`${workspaceInvitations.expiresAt} > ${now}`,
        ),
      )
      .returning({ id: workspaceInvitations.id });
    if (!claimed) throw new AppError("conflict", "This invitation is no longer available.");

    const [member] = await tx
      .insert(workspaceMembers)
      .values({ workspaceId: row.workspaceId, userId, role: row.role })
      .onConflictDoNothing({ target: [workspaceMembers.workspaceId, workspaceMembers.userId] })
      .returning({ id: workspaceMembers.id });
    if (!member) throw new AppError("conflict", "You are already a workspace member.");

    await tx
      .insert(userPreferences)
      .values({ userId, activeWorkspaceId: row.workspaceId })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { activeWorkspaceId: row.workspaceId, updatedAt: now },
      });

    return { workspaceId: row.workspaceId, role: row.role as InvitableWorkspaceRole };
  });
  await Promise.all([
    notifyWorkspaceMemberEvent(result.workspaceId, userId, "INVITATION_ACCEPTED", userId),
    notifyWorkspaceMemberEvent(result.workspaceId, userId, "MEMBER_JOINED", userId),
  ]).catch((error) => {
    logger.warn("member notification failed", {
      workspaceId: result.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return result;
}

export async function listWorkspaceMembers(userId: string): Promise<WorkspaceMemberSummary[]> {
  const authorization = await requireWorkspacePermission(userId, "members:view");
  const rows = await db
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
      displayName: userPreferences.displayName,
      userId: workspaceMembers.userId,
    })
    .from(workspaceMembers)
    .leftJoin(userPreferences, eq(userPreferences.userId, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, authorization.workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName?.trim() || "Workspace member",
    role: row.role,
    status: "active",
    joinedAt: row.joinedAt,
    isCurrentUser: row.userId === userId,
  }));
}

export async function listWorkspaceInvitations(userId: string): Promise<InvitationSummary[]> {
  const authorization = await requireWorkspacePermission(userId, "members:invite");
  const now = new Date();
  const rows = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.workspaceId, authorization.workspaceId),
        inArray(workspaceInvitations.status, ["pending", "expired"]),
      ),
    )
    .orderBy(desc(workspaceInvitations.createdAt));

  return rows.map((row) => toInvitationSummary(row, now));
}

export async function cancelWorkspaceInvitation(
  userId: string,
  invitationId: string,
): Promise<void> {
  const authorization = await requireWorkspacePermission(userId, "members:invite");
  const [row] = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, authorization.workspaceId),
      ),
    )
    .limit(1);

  if (!row) throw new AppError("not_found", "Invitation not found.");
  assertCanManageTarget(authorization.role, row.role);
  if (invitationStatus(row.status, row.expiresAt) !== "pending") {
    throw new AppError("conflict", "Only a pending invitation can be cancelled.");
  }

  await db
    .update(workspaceInvitations)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.status, "pending"),
      ),
    );
  void emitWebhookEventSafely({ workspaceId: authorization.workspaceId, type: "workspace.invitation_cancelled", data: { invitationId } });
}

export async function resendWorkspaceInvitation(
  userId: string,
  invitationId: string,
): Promise<{ invitation: InvitationSummary; token: string }> {
  const authorization = await requireWorkspacePermission(userId, "members:invite");
  const [row] = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, authorization.workspaceId),
      ),
    )
    .limit(1);

  if (!row) throw new AppError("not_found", "Invitation not found.");
  assertCanManageTarget(authorization.role, row.role);
  if (row.status === "accepted") {
    throw new AppError("conflict", "This invitation was already accepted.");
  }
  if (row.status === "cancelled") {
    throw new AppError("conflict", "Create a new invitation for this person.");
  }

  const token = newInvitationToken();
  const now = new Date();
  const [updated] = await db
    .update(workspaceInvitations)
    .set({
      tokenHash: hashInvitationToken(token),
      status: "pending",
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      acceptedAt: null,
      cancelledAt: null,
      createdBy: userId,
      updatedAt: now,
    })
    .where(eq(workspaceInvitations.id, invitationId))
    .returning();

  if (!updated) throw new AppError("conflict", "This invitation is no longer available.");
  return { invitation: toInvitationSummary(updated, now), token };
}

export async function updateWorkspaceMemberRole(
  userId: string,
  memberId: string,
  requestedRole: unknown,
): Promise<{ id: string; role: InvitableWorkspaceRole }> {
  const authorization = await requireWorkspacePermission(userId, "members:update");
  const role = assertInvitableRole(requestedRole);
  const [target] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.workspaceId, authorization.workspaceId),
      ),
    )
    .limit(1);
  if (!target) throw new AppError("not_found", "Member not found.");
  if (target.userId === userId) {
    throw new AppError("forbidden", "You cannot change your own role.");
  }
  assertCanManageTarget(authorization.role, target.role);
  if (target.role === "owner") {
    throw new AppError("forbidden", "The workspace owner is protected.");
  }
  if (authorization.role === "admin" && role === "admin") {
    throw new AppError("forbidden", "Admins can only assign editor or viewer roles.");
  }

  const [updated] = await db
    .update(workspaceMembers)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.role, target.role),
      ),
    )
    .returning({ id: workspaceMembers.id, role: workspaceMembers.role });
  if (!updated) throw new AppError("conflict", "This member changed before your update.");
  void emitWebhookEventSafely({ workspaceId: authorization.workspaceId, type: "workspace.member_role_changed", data: { memberId: target.userId, oldRole: target.role, newRole: updated.role } });
  return { id: updated.id, role: updated.role as InvitableWorkspaceRole };
}

export async function removeWorkspaceMember(userId: string, memberId: string): Promise<void> {
  const authorization = await requireWorkspacePermission(userId, "members:remove");
  const [target] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.workspaceId, authorization.workspaceId),
      ),
    )
    .limit(1);
  if (!target) throw new AppError("not_found", "Member not found.");
  if (target.userId === userId) {
    throw new AppError("forbidden", "You cannot remove yourself from this workspace.");
  }
  if (target.role === "owner") {
    throw new AppError("forbidden", "The workspace owner is protected.");
  }
  assertCanManageTarget(authorization.role, target.role);

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.workspaceId, authorization.workspaceId),
      ),
    );
  void emitWebhookEventSafely({ workspaceId: authorization.workspaceId, type: "workspace.member_removed", data: { memberId: target.userId } });
}
