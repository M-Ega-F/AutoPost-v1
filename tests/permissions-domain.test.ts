import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { eq } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { workspaceMembers } from "@/lib/db/schema";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { publishDraft, saveDraft } from "@/lib/domain/posts";

import { USER_ID, setupTestDatabase } from "./fixtures";
import { getDb } from "./db-harness";

describe("workspace authorization", () => {
  test("resolves the active workspace role on every check", async () => {
    await setupTestDatabase();
    const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;

    await getDb().update(workspaceMembers)
      .set({ role: "editor" })
      .where(eq(workspaceMembers.workspaceId, workspace.id));

    const editor = await requireWorkspacePermission(USER_ID, "posts:create");
    assert.equal(editor.role, "editor");
    await assert.rejects(
      () => requireWorkspacePermission(USER_ID, "posts:publish"),
      /permission/,
    );
    await assert.doesNotReject(() => saveDraft({
      userId: USER_ID,
      contentText: "Editor draft",
      timezone: "UTC",
      media: null,
      targets: [],
    }));
    await assert.rejects(
      () => publishDraft({
        userId: USER_ID,
        postId: "00000000-0000-0000-0000-000000000000",
        contentText: "Blocked publish",
        timezone: "UTC",
        media: null,
        targets: [],
        scheduledAt: null,
      }),
      /permission/,
    );

    await getDb().update(workspaceMembers)
      .set({ role: "viewer" })
      .where(eq(workspaceMembers.workspaceId, workspace.id));

    const viewer = await requireWorkspacePermission(USER_ID, "posts:view");
    assert.equal(viewer.role, "viewer");
    await assert.rejects(
      () => requireWorkspacePermission(USER_ID, "posts:create"),
      /permission/,
    );
    await assert.rejects(
      () => saveDraft({
        userId: USER_ID,
        contentText: "Blocked draft",
        timezone: "UTC",
        media: null,
        targets: [],
      }),
      /permission/,
    );
  });
});
