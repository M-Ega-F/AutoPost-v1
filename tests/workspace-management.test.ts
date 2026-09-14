import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { and, eq } from "drizzle-orm";

import {
  createWorkspaceForUser,
  deleteWorkspaceForUser,
  getActiveWorkspaceForUser,
  getWorkspaceOverview,
  leaveWorkspace,
  setActiveWorkspaceForUser,
  transferWorkspaceOwnership,
  updateWorkspaceForUser,
} from "@/lib/domain/workspaces";
import { posts, workspaceMembers } from "@/lib/db/schema";

import { getDb } from "./db-harness";
import { OTHER_USER_ID, setupTestDatabase, USER_ID } from "./fixtures";

describe("workspace management", () => {
  test("creates an active workspace with collision-safe slugs and overview stats", async () => {
    await setupTestDatabase();

    const first = await createWorkspaceForUser(USER_ID, "Marketing Team", {
      description: "Campaign planning",
      timezone: "Asia/Jakarta",
    });
    const second = await createWorkspaceForUser(USER_ID, "Marketing Team");
    const overview = await getWorkspaceOverview(USER_ID);

    assert.equal(first.slug, "marketing-team");
    assert.equal(second.slug, "marketing-team-2");
    assert.equal(first.timezone, "Asia/Jakarta");
    assert.equal(overview.id, second.id);
    assert.equal(overview.memberCount, 1);
    assert.deepEqual(overview.stats, { posts: 0, drafts: 0, scheduled: 0, connectedAccounts: 0 });
  });

  test("validates and authorizes metadata updates by role", async () => {
    await setupTestDatabase();
    const workspace = await createWorkspaceForUser(USER_ID, "Operations");
    const db = getDb();

    await assert.rejects(
      () => updateWorkspaceForUser(USER_ID, { slug: "Not Valid" }),
      /lowercase letters/,
    );
    await assert.rejects(
      () => updateWorkspaceForUser(USER_ID, { timezone: "Mars/Phobos" }),
      /valid workspace timezone/,
    );

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: OTHER_USER_ID,
      role: "admin",
    });
    await setActiveWorkspaceForUser(OTHER_USER_ID, workspace.id);
    const updated = await updateWorkspaceForUser(OTHER_USER_ID, {
      name: "Operations team",
      description: "Shared workflows",
    });
    assert.equal(updated.name, "Operations team");

    await db
      .update(workspaceMembers)
      .set({ role: "editor" })
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, OTHER_USER_ID)));
    await assert.rejects(
      () => updateWorkspaceForUser(OTHER_USER_ID, { name: "Should fail" }),
      /permission/,
    );
  });

  test("transfers ownership atomically and leaves exactly one owner", async () => {
    await setupTestDatabase();
    const workspace = await createWorkspaceForUser(USER_ID, "Production");
    const db = getDb();
    const [member] = await db
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: OTHER_USER_ID, role: "editor" })
      .returning();

    await transferWorkspaceOwnership(USER_ID, member.id);

    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspace.id));
    assert.equal(memberships.filter((row) => row.role === "owner").length, 1);
    assert.equal(memberships.find((row) => row.userId === USER_ID)?.role, "admin");
    assert.equal(memberships.find((row) => row.userId === OTHER_USER_ID)?.role, "owner");
    await assert.rejects(() => transferWorkspaceOwnership(USER_ID, member.id), /permission/);
  });

  test("allows non-owners to leave and returns them to a valid fallback", async () => {
    await setupTestDatabase();
    const workspace = await createWorkspaceForUser(USER_ID, "Editorial");
    const db = getDb();
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: OTHER_USER_ID,
      role: "viewer",
    });
    await setActiveWorkspaceForUser(OTHER_USER_ID, workspace.id);

    const result = await leaveWorkspace(OTHER_USER_ID);
    const active = await getActiveWorkspaceForUser(OTHER_USER_ID);
    assert.equal(result.activeWorkspaceId, active.workspace.id);
    assert.equal(active.workspace.isPersonal, true);
    assert.equal(
      (await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, OTHER_USER_ID)))
        .some((row) => row.workspaceId === workspace.id),
      false,
    );

    await setActiveWorkspaceForUser(USER_ID, workspace.id);
    await assert.rejects(() => leaveWorkspace(USER_ID), /Transfer ownership/);
  });

  test("blocks deletion during processing and deletes the full workspace after confirmation", async () => {
    await setupTestDatabase();
    const workspace = await createWorkspaceForUser(USER_ID, "Launch");
    const db = getDb();
    const [post] = await db
      .insert(posts)
      .values({
        userId: USER_ID,
        workspaceId: workspace.id,
        contentText: "Processing post",
        timezone: "UTC",
        status: "processing",
      })
      .returning();

    await assert.rejects(
      () => deleteWorkspaceForUser(USER_ID, workspace.name),
      /being published/,
    );
    await db.update(posts).set({ status: "draft" }).where(eq(posts.id, post.id));
    const deleted = await deleteWorkspaceForUser(USER_ID, workspace.name);
    const active = await getActiveWorkspaceForUser(USER_ID);

    assert.equal(deleted.activeWorkspaceId, null);
    assert.equal(active.workspace.isPersonal, true);
    assert.equal((await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id))).length, 0);
  });
});
