import { strict as assert } from "node:assert";
import { beforeEach, describe, test } from "node:test";

import {
  createNotification,
  deleteAllRead,
  deleteNotification,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  notifyPostEvent,
} from "@/lib/domain/notifications";
import { createWorkspaceForUser, getActiveWorkspaceForUser, setActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { notifications, posts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

import { setupTestDatabase, USER_ID } from "./fixtures";
import { getDb } from "./db-harness";

describe("persistent notifications", () => {
  beforeEach(async () => setupTestDatabase());

  test("creates, lists, reads and deletes only the active recipient's notifications", async () => {
    const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    const notification = await createNotification({
      workspaceId: workspace.id,
      recipientId: USER_ID,
      type: "SYSTEM",
      priority: "info",
      title: "System update",
      message: "The system is ready.",
      href: "/dashboard",
      metadata: { source: "test" },
    });

    const result = await getNotifications(USER_ID);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.unreadCount, 1);
    assert.equal(result.notifications[0]?.id, notification.id);

    const read = await markAsRead(USER_ID, notification.id);
    assert.ok(read.readAt);
    assert.equal(await getUnreadCount(USER_ID), 0);
    assert.equal((await markAsRead(USER_ID, notification.id)).id, notification.id);

    await deleteNotification(USER_ID, notification.id);
    assert.equal((await getNotifications(USER_ID)).notifications.length, 0);
  });

  test("deduplicates active unread events but allows a new event after read", async () => {
    const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    const input = {
      workspaceId: workspace.id,
      recipientId: USER_ID,
      type: "ACCOUNT_RECONNECT_REQUIRED" as const,
      priority: "warning" as const,
      title: "Reconnect required",
      message: "Reconnect the account.",
      metadata: { accountId: "account-1" },
      dedupeKey: "account:account-1:ACCOUNT_RECONNECT_REQUIRED",
    };
    const first = await createNotification(input);
    const duplicate = await createNotification(input);
    assert.equal(duplicate.id, first.id);
    await markAsRead(USER_ID, first.id);
    const next = await createNotification(input);
    assert.notEqual(next.id, first.id);
  });

  test("rejects external links and sensitive metadata", async () => {
    const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    await assert.rejects(
      () => createNotification({
        workspaceId: workspace.id,
        recipientId: USER_ID,
        type: "SYSTEM",
        priority: "info",
        title: "Unsafe",
        message: "Unsafe",
        href: "//evil.example",
        metadata: {},
      }),
      (error: unknown) => error instanceof Error,
    );
    await assert.rejects(
      () => createNotification({
        workspaceId: workspace.id,
        recipientId: USER_ID,
        type: "SYSTEM",
        priority: "info",
        title: "Unsafe",
        message: "Unsafe",
        metadata: { accessToken: "do-not-store" },
      }),
      (error: unknown) => error instanceof Error,
    );
  });

  test("mark all, clear read and workspace switching isolate records", async () => {
    const firstWorkspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    await createNotification({
      workspaceId: firstWorkspace.id,
      recipientId: USER_ID,
      type: "SYSTEM",
      priority: "info",
      title: "First workspace",
      message: "Only in the first workspace.",
      metadata: {},
    });
    const secondWorkspace = await createWorkspaceForUser(USER_ID, "Notifications workspace");
    await createNotification({
      workspaceId: secondWorkspace.id,
      recipientId: USER_ID,
      type: "SYSTEM",
      priority: "info",
      title: "Second workspace",
      message: "Only in the second workspace.",
      metadata: {},
    });

    await setActiveWorkspaceForUser(USER_ID, secondWorkspace.id);
    let result = await getNotifications(USER_ID);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]?.title, "Second workspace");
    assert.equal(await markAllAsRead(USER_ID), 1);
    assert.equal(await deleteAllRead(USER_ID), 1);
    await setActiveWorkspaceForUser(USER_ID, firstWorkspace.id);
    result = await getNotifications(USER_ID);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications.some((item) => item.title === "Second workspace"), false);
  });

  test("post event targets the creator and keeps the copy provider-safe", async () => {
    const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    const [post] = await getDb().insert(posts).values({
      userId: USER_ID,
      workspaceId: workspace.id,
      contentText: "Test post",
      timezone: "UTC",
      status: "published",
    }).returning({ id: posts.id });
    assert.ok(post);
    await notifyPostEvent(post.id, "POST_FAILED");
    const result = await getNotifications(USER_ID);
    assert.equal(result.notifications[0]?.type, "POST_FAILED");
    assert.equal(result.notifications[0]?.message.includes("provider"), false);
  });

  test("delete cannot cross recipient or workspace boundaries", async () => {
    const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
    const item = await createNotification({
      workspaceId: workspace.id,
      recipientId: USER_ID,
      type: "SYSTEM",
      priority: "info",
      title: "Protected",
      message: "Protected",
      metadata: {},
    });
    await assert.rejects(
      () => deleteNotification("22222222-2222-2222-2222-222222222222", item.id),
      (error: unknown) => error instanceof AppError && error.code === "forbidden",
    );
    const rows = await getDb().select({ id: notifications.id }).from(notifications);
    assert.equal(rows.some((row) => row.id === item.id), true);
  });
});
