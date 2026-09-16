import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { createAccount, insertPost, insertTarget, setupTestDatabase, USER_ID } from "./fixtures";
import { db } from "./db-harness";
import { campaigns, campaignAutomationEvents } from "@/lib/db/schema";
import { createCampaign } from "@/lib/domain/campaigns";
import { evaluateCampaignAutomation } from "@/lib/domain/campaign-automation";
import { saveAnalyticsSnapshot } from "@/lib/domain/analytics";

beforeEach(async () => setupTestDatabase());

test("campaign automation emits goal milestones once across duplicate evaluations", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Milestone campaign", targetMetric: "views", targetValue: 100 });
  const postId = await insertPost({ campaignId: campaign.id, status: "published" });
  const accountId = await createAccount("instagram");
  const targetId = await insertTarget(postId, accountId, "instagram", { status: "success" });
  await saveAnalyticsSnapshot(USER_ID, { postPlatformId: targetId, status: "available", metrics: { views: 100 } });

  const first = await evaluateCampaignAutomation({ workspaceId: campaign.workspaceId, campaignId: campaign.id, trigger: "manual", now: new Date("2026-09-14T00:00:00.000Z") });
  const second = await evaluateCampaignAutomation({ workspaceId: campaign.workspaceId, campaignId: campaign.id, trigger: "manual", now: new Date("2026-09-14T00:00:00.000Z") });
  assert.equal(first.evaluated, true);
  assert.ok(first.claimedEvents >= 4);
  assert.equal(second.claimedEvents, 0);
  assert.ok(second.skippedEvents >= 4);
  const events = await db.select({ id: campaignAutomationEvents.id, eventType: campaignAutomationEvents.eventType }).from(campaignAutomationEvents).where(eq(campaignAutomationEvents.campaignId, campaign.id));
  assert.equal(events.filter((event) => event.eventType === "goal_milestone" || event.eventType === "goal_completed").length, 4);
  assert.ok(events.length >= 4);
  assert.equal((await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaign.id))).length, 1);
});
