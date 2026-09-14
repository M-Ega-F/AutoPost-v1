import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  createWorkspaceForUser,
  ensurePersonalWorkspace,
  getActiveWorkspaceForUser,
  listUserWorkspaces,
  requireWorkspaceMember,
  setActiveWorkspaceForUser,
} from "@/lib/domain/workspaces";
import { listHistoryPosts } from "@/lib/domain/posts";

import {
  OTHER_USER_ID,
  USER_ID,
  insertPost,
  setupTestDatabase,
} from "./fixtures";

describe("workspace foundation", () => {
  test("provisions one personal workspace and owner membership idempotently", async () => {
    await setupTestDatabase();

    const first = await ensurePersonalWorkspace(USER_ID);
    const second = await ensurePersonalWorkspace(USER_ID);
    const workspaces = await listUserWorkspaces(USER_ID);

    assert.equal(first.id, second.id);
    assert.equal(workspaces.filter((workspace) => workspace.isPersonal).length, 1);
    assert.equal(workspaces[0]?.role, "owner");
    await assert.doesNotReject(() => requireWorkspaceMember(USER_ID, first.id));
    await assert.rejects(() => requireWorkspaceMember(OTHER_USER_ID, first.id), /access/);
  });

  test("active workspace switching scopes post reads", async () => {
    await setupTestDatabase();

    const personal = await getActiveWorkspaceForUser(USER_ID);
    await insertPost({ caption: "Personal post", status: "published" });
    const additional = await createWorkspaceForUser(USER_ID, "Campaign workspace");

    assert.equal((await listHistoryPosts(USER_ID)).length, 0);
    await insertPost({ caption: "Campaign post", status: "published" });
    assert.deepEqual(
      (await listHistoryPosts(USER_ID)).map((post) => post.contentText),
      ["Campaign post"],
    );

    await setActiveWorkspaceForUser(USER_ID, personal.workspace.id);
    assert.deepEqual(
      (await listHistoryPosts(USER_ID)).map((post) => post.contentText),
      ["Personal post"],
    );
    assert.equal((await getActiveWorkspaceForUser(USER_ID)).workspace.id, personal.workspace.id);
    assert.equal(additional.role, "owner");
  });
});
