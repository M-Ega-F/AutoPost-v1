import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { eq } from "drizzle-orm";

import {
  attachPostToCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaignPosts,
  listCampaigns,
  listAvailablePostsForCampaign,
  transitionCampaign,
  updateCampaign,
} from "@/lib/domain/campaigns";
import { listCampaignActivity, recordCampaignActivity } from "@/lib/domain/campaign-activity";
import { campaigns, posts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";

import { db } from "./db-harness";
import { insertPost, OTHER_USER_ID, setupTestDatabase, USER_ID } from "./fixtures";

beforeEach(async () => setupTestDatabase());

describe("campaign foundation", () => {
  test("creates, paginates, updates and summarizes a workspace campaign", async () => {
    const created = await createCampaign(USER_ID, {
      name: "September launch",
      description: "A coordinated product launch.",
      objective: "promotion",
      targetMetric: "views",
      targetValue: 100_000,
      startAt: new Date("2026-09-01T00:00:00.000Z"),
      endAt: new Date("2026-09-30T00:00:00.000Z"),
    });
    const postId = await insertPost({ campaignId: created.id, status: "published", approvalStatus: "approved" });

    const listed = await listCampaigns(USER_ID, { page: 1, pageSize: 10, sort: "updated", order: "desc" });
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0]?.postCount, 1);

    const detail = await getCampaign(USER_ID, created.id);
    assert.equal(detail.targetMetric, "views");
    assert.equal(detail.targetValue, 100_000);
    assert.equal(detail.postStats.total, 1);
    assert.equal(detail.postStats.byStatus.published, 1);
    assert.equal(detail.postStats.byApproval.approved, 1);

    const updated = await updateCampaign(USER_ID, created.id, { description: "Updated launch brief." });
    assert.equal(updated.description, "Updated launch brief.");
    const campaignPost = await listCampaignPosts(USER_ID, created.id, { page: 1, pageSize: 20 });
    assert.deepEqual(campaignPost.items.map((post) => post.id), [postId]);
  });

  test("summarizes planning health and blocks completion with scheduled content", async () => {
    const campaign = await createCampaign(USER_ID, {
      name: "Planned launch",
      objective: "other",
      customObjective: "Validate the new launch message",
    });
    await insertPost({ campaignId: campaign.id, status: "scheduled" });

    const detail = await getCampaign(USER_ID, campaign.id);
    assert.equal(detail.progress.scheduledPosts, 1);
    assert.equal(detail.timeline.current, "scheduling");
    assert.equal(detail.health.status, "healthy");
    await assert.rejects(
      () => transitionCampaign(USER_ID, campaign.id, "completed"),
      (error: unknown) => error instanceof AppError && error.code === "conflict",
    );
  });

  test("records a deduplicated, workspace-scoped activity feed", async () => {
    const campaign = await createCampaign(USER_ID, { name: "Activity test" });
    const first = await recordCampaignActivity({
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      actorId: USER_ID,
      type: "goal_updated",
      metadata: { targetMetric: "views" },
      dedupeKey: "goal-update-1",
    });
    const duplicate = await recordCampaignActivity({
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      actorId: USER_ID,
      type: "goal_updated",
      dedupeKey: "goal-update-1",
    });
    assert.ok(first);
    assert.equal(duplicate, null);

    const activity = await listCampaignActivity(USER_ID, campaign.id, { page: 1, pageSize: 20 });
    assert.ok(activity.total >= 1);
    assert.ok(activity.items.some((item) => item.type === "goal_updated"));
  });

  test("available-post filtering excludes posts already assigned to another campaign", async () => {
    const first = await createCampaign(USER_ID, { name: "First campaign" });
    const second = await createCampaign(USER_ID, { name: "Second campaign" });
    await insertPost({ campaignId: first.id, status: "draft", caption: "Assigned" });
    const availableId = await insertPost({ status: "draft", caption: "Available launch draft" });

    const available = await listAvailablePostsForCampaign(USER_ID, second.id, {
      page: 1,
      pageSize: 20,
      search: "launch",
    });
    assert.deepEqual(available.items.map((post) => post.id), [availableId]);
  });

  test("enforces explicit transitions and keeps posts after deletion", async () => {
    const campaign = await createCampaign(USER_ID, { name: "Lifecycle test" });
    await assert.rejects(() => transitionCampaign(USER_ID, campaign.id, "completed"), (error: unknown) => error instanceof AppError && error.code === "conflict");
    await transitionCampaign(USER_ID, campaign.id, "active");
    await transitionCampaign(USER_ID, campaign.id, "completed");
    await transitionCampaign(USER_ID, campaign.id, "archived");
    const postId = await insertPost({ campaignId: campaign.id, status: "draft" });
    await deleteCampaign(USER_ID, campaign.id);
    const [post] = await db.select({ campaignId: posts.campaignId }).from(posts).where(eq(posts.id, postId)).limit(1);
    assert.equal(post?.campaignId, null);
    assert.equal((await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaign.id))).length, 0);
  });

  test("attaches only inside the active workspace and rejects cross-workspace access", async () => {
    const campaign = await createCampaign(USER_ID, { name: "Workspace-safe campaign" });
    const post = await insertPost({ status: "draft" });
    await attachPostToCampaign(USER_ID, campaign.id, post);
    const [attached] = await db.select({ campaignId: posts.campaignId }).from(posts).where(eq(posts.id, post)).limit(1);
    assert.equal(attached?.campaignId, campaign.id);

    await getActiveWorkspaceForUser(OTHER_USER_ID);
    await assert.rejects(() => getCampaign(OTHER_USER_ID, campaign.id), (error: unknown) => error instanceof AppError && error.code === "not_found");

    assert.notEqual((await getActiveWorkspaceForUser(OTHER_USER_ID)).workspace.id, campaign.workspaceId);
  });
});
