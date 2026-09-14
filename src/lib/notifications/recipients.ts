import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  posts,
  socialAccounts,
  workspaceMembers,
  workspaceInvitations,
  workspaces,
} from "@/lib/db/schema";

export type NotificationRecipient = {
  workspaceId: string;
  recipientId: string;
};

export async function getPostRecipient(postId: string): Promise<NotificationRecipient | null> {
  const [row] = await db
    .select({ workspaceId: posts.workspaceId, recipientId: posts.userId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  return row ?? null;
}

export async function getAccountRecipient(accountId: string): Promise<NotificationRecipient | null> {
  const [row] = await db
    .select({ workspaceId: socialAccounts.workspaceId, recipientId: socialAccounts.userId })
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .limit(1);
  return row ?? null;
}

export async function getWorkspaceOwnerRecipient(
  workspaceId: string,
): Promise<NotificationRecipient | null> {
  const [row] = await db
    .select({ workspaceId: workspaces.id, recipientId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getInvitationRecipient(
  invitationId: string,
): Promise<NotificationRecipient | null> {
  const [row] = await db
    .select({
      workspaceId: workspaceInvitations.workspaceId,
      email: workspaceInvitations.normalizedEmail,
    })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.id, invitationId))
    .limit(1);
  if (!row) return null;

  const users = (await db.execute(sql`
    select id
    from auth.users
    where lower(email) = ${row.email}
    limit 1
  `)) as Array<{ id: string }>;
  const recipientId = users[0]?.id;
  return recipientId ? { workspaceId: row.workspaceId, recipientId } : null;
}

export async function getMemberRecipient(
  workspaceId: string,
  userId: string,
): Promise<NotificationRecipient | null> {
  const [row] = await db
    .select({ workspaceId: workspaceMembers.workspaceId, recipientId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
}
