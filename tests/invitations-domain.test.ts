import { strict as assert } from "node:assert";
import { beforeEach, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";

import { AppError } from "@/lib/errors";
import {
  acceptWorkspaceInvitation,
  cancelWorkspaceInvitation,
  createWorkspaceInvitation,
  getInvitationPreview,
  listWorkspaceMembers,
  removeWorkspaceMember,
  resendWorkspaceInvitation,
  updateWorkspaceMemberRole,
} from "@/lib/domain/invitations";
import {
  createWorkspaceForUser,
  setActiveWorkspaceForUser,
} from "@/lib/domain/workspaces";
import { db, workspaceInvitations, workspaceMembers } from "@/lib/db";

import { getDb } from "./db-harness";
import { OTHER_USER_ID, setupTestDatabase, USER_ID } from "./fixtures";

function hasCode(code: AppError["code"]) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

describe("team invitations and member management", () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  test("creates hashed, expiring invitations and exposes a limited preview", async () => {
    const result = await createWorkspaceInvitation(USER_ID, {
      email: "Invitee@Example.com",
      role: "editor",
    });
    assert.equal(result.invitation.email, "invitee@example.com");
    assert.equal(result.invitation.status, "pending");
    assert.equal(result.token.length, 43);
    const [stored] = await db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, result.invitation.id));
    assert.ok(stored);
    assert.notEqual(stored.tokenHash, result.token);

    const preview = await getInvitationPreview(result.token);
    assert.deepEqual(preview, {
      workspaceName: "Personal workspace",
      role: "editor",
      status: "pending",
    });
  });

  test("replacing an email's pending invite invalidates the old token", async () => {
    const first = await createWorkspaceInvitation(USER_ID, {
      email: "same@example.com",
      role: "viewer",
    });
    const second = await createWorkspaceInvitation(USER_ID, {
      email: " SAME@example.com ",
      role: "editor",
    });
    assert.equal(first.invitation.id, second.invitation.id);
    await assert.rejects(() => getInvitationPreview(first.token), hasCode("not_found"));
    assert.equal((await getInvitationPreview(second.token)).role, "editor");
  });

  test("rejects owner invitations and enforces admin target policy", async () => {
    await assert.rejects(
      () => createWorkspaceInvitation(USER_ID, { email: "x@example.com", role: "owner" }),
      hasCode("validation_failed"),
    );

    const workspace = await createWorkspaceForUser(USER_ID, "Editorial team");
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: OTHER_USER_ID,
      role: "admin",
    });
    await setActiveWorkspaceForUser(OTHER_USER_ID, workspace.id);

    const allowed = await createWorkspaceInvitation(OTHER_USER_ID, {
      email: "writer@example.com",
      role: "editor",
    });
    assert.equal(allowed.invitation.role, "editor");
    await assert.rejects(
      () => createWorkspaceInvitation(OTHER_USER_ID, { email: "manager@example.com", role: "admin" }),
      hasCode("forbidden"),
    );
  });

  test("accepts only for the invited email and prevents replay", async () => {
    const invitation = await createWorkspaceInvitation(USER_ID, {
      email: OTHER_USER_ID + "@example.com",
      role: "viewer",
    });
    await assert.rejects(
      () => acceptWorkspaceInvitation(OTHER_USER_ID, "wrong@example.com", invitation.token),
      hasCode("forbidden"),
    );

    const accepted = await acceptWorkspaceInvitation(
      OTHER_USER_ID,
      OTHER_USER_ID + "@example.com",
      invitation.token,
    );
    assert.equal(accepted.role, "viewer");
    await assert.rejects(
      () => acceptWorkspaceInvitation(OTHER_USER_ID, OTHER_USER_ID + "@example.com", invitation.token),
      hasCode("conflict"),
    );

    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, accepted.workspaceId), eq(workspaceMembers.userId, OTHER_USER_ID)));
    assert.equal(membership?.role, "viewer");
  });

  test("cancel and resend rotate the token, and expiry is not accepted", async () => {
    const invitation = await createWorkspaceInvitation(USER_ID, {
      email: "expire@example.com",
      role: "viewer",
    });
    await db
      .update(workspaceInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(workspaceInvitations.id, invitation.invitation.id));
    assert.equal((await getInvitationPreview(invitation.token)).status, "expired");

    const resent = await resendWorkspaceInvitation(USER_ID, invitation.invitation.id);
    assert.notEqual(resent.token, invitation.token);
    await assert.rejects(() => getInvitationPreview(invitation.token), hasCode("not_found"));
    assert.equal((await getInvitationPreview(resent.token)).status, "pending");

    await cancelWorkspaceInvitation(USER_ID, invitation.invitation.id);
    assert.equal((await getInvitationPreview(resent.token)).status, "cancelled");
    await assert.rejects(
      () => acceptWorkspaceInvitation(OTHER_USER_ID, "expire@example.com", resent.token),
      hasCode("conflict"),
    );
    await assert.rejects(
      () => resendWorkspaceInvitation(USER_ID, invitation.invitation.id),
      hasCode("conflict"),
    );
  });

  test("owners can update/remove non-owner members but cannot remove themselves", async () => {
    const invitation = await createWorkspaceInvitation(USER_ID, {
      email: OTHER_USER_ID + "@example.com",
      role: "editor",
    });
    const accepted = await acceptWorkspaceInvitation(
      OTHER_USER_ID,
      OTHER_USER_ID + "@example.com",
      invitation.token,
    );
    const members = await listWorkspaceMembers(USER_ID);
    const other = members.find((member) => !member.isCurrentUser);
    assert.ok(other);
    await assert.rejects(
      () => removeWorkspaceMember(USER_ID, members.find((member) => member.isCurrentUser)!.id),
      hasCode("forbidden"),
    );
    await updateWorkspaceMemberRole(USER_ID, other.id, "viewer");

    const rows = await getDb()
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, OTHER_USER_ID));
    assert.equal(rows.some((row) => row.workspaceId === accepted.workspaceId), true);
    await removeWorkspaceMember(USER_ID, rows.find((row) => row.workspaceId === accepted.workspaceId)!.id);
    await assert.rejects(
      () => updateWorkspaceMemberRole(USER_ID, rows.find((row) => row.workspaceId === accepted.workspaceId)!.id, "editor"),
      hasCode("not_found"),
    );
  });
});
