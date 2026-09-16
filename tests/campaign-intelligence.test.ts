import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { createCampaign } from "@/lib/domain/campaigns";
import { getCampaignIntelligence } from "@/lib/domain/campaign-intelligence";
import { persistCampaignIntelligenceEvaluation, listCampaignIntelligenceHistory } from "@/lib/domain/campaign-intelligence-history";
import { saveAnalyticsSnapshot } from "@/lib/domain/analytics";
import { AppError } from "@/lib/errors";
import { listPostIntelligenceRankings, markPostIntelligenceStale, persistPostIntelligenceSummaries } from "@/lib/domain/post-intelligence";

import { createAccount, insertPost, insertTarget, setupTestDatabase, OTHER_USER_ID, USER_ID } from "./fixtures";

beforeEach(async () => setupTestDatabase());

test("campaign intelligence uses workspace-scoped batch data and supports safe comparison", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Intelligence campaign", targetMetric: "views", targetValue: 1000 });
  const publishedAt = new Date("2026-09-01T10:00:00.000Z");
  const firstPost = await insertPost({ campaignId: campaign.id, status: "published", publishedAt });
  const secondPost = await insertPost({ campaignId: campaign.id, status: "published", publishedAt });
  const account = await createAccount("instagram");
  const firstTarget = await insertTarget(firstPost, account, "instagram", { status: "success" });
  const secondTarget = await insertTarget(secondPost, account, "instagram", { status: "success" });
  await saveAnalyticsSnapshot(USER_ID, { postPlatformId: firstTarget, status: "available", metrics: { views: 900, likes: 100, reach: 700 }, collectedAt: new Date("2026-09-04T10:00:00.000Z") });
  await saveAnalyticsSnapshot(USER_ID, { postPlatformId: secondTarget, status: "available", metrics: { views: 300, likes: 30, reach: 250 }, collectedAt: new Date("2026-09-04T10:00:00.000Z") });

  const report = await getCampaignIntelligence(USER_ID, campaign.id, { page: 1, pageSize: 20, comparisonIds: [firstPost, secondPost] });
  assert.equal(report.overview.comparablePosts, 2);
  assert.equal(report.posts.items.length, 2);
  assert.equal(report.comparison?.status, "ready");
  assert.equal(report.comparison?.winners.views, firstPost);
  assert.equal(report.posts.items[0]?.postId, firstPost);
  assert.equal(report.posts.items[0]?.goalContribution, 90);
});

test("comparison cannot read a post from another campaign", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Scoped intelligence" });
  const otherCampaign = await createCampaign(USER_ID, { name: "Other campaign" });
  const ownPost = await insertPost({ campaignId: campaign.id, status: "published" });
  const otherPost = await insertPost({ campaignId: otherCampaign.id, status: "published" });
  await assert.rejects(() => getCampaignIntelligence(USER_ID, campaign.id, { comparisonIds: [ownPost, otherPost] }), (error: unknown) => error instanceof AppError && error.code === "not_found");
});

test("evaluation persists deduplicated history and exposes a bounded cursor page", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Historical intelligence" });
  const publishedAt = new Date("2026-09-01T10:00:00.000Z");
  const firstPost = await insertPost({ campaignId: campaign.id, status: "published", publishedAt });
  const account = await createAccount("instagram");
  const target = await insertTarget(firstPost, account, "instagram", { status: "success" });
  await saveAnalyticsSnapshot(USER_ID, { postPlatformId: target, status: "available", metrics: { views: 100, likes: 10 }, collectedAt: new Date("2026-09-04T10:00:00.000Z") });
  const report = await getCampaignIntelligence(USER_ID, campaign.id);
  const first = await persistCampaignIntelligenceEvaluation({ workspaceId: campaign.workspaceId, campaignId: campaign.id, report, mode: "full", reason: "manual" });
  const duplicate = await persistCampaignIntelligenceEvaluation({ workspaceId: campaign.workspaceId, campaignId: campaign.id, report, mode: "full", reason: "manual" });
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  const history = await listCampaignIntelligenceHistory(USER_ID, campaign.id, { limit: 1 });
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0]?.inputFingerprint, report.inputFingerprint);
  assert.equal(typeof history.items[0]?.opportunities, "object");
});

test("history remains workspace-scoped", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Private history" });
  await assert.rejects(() => listCampaignIntelligenceHistory(OTHER_USER_ID, campaign.id), (error: unknown) => error instanceof AppError && (error.code === "forbidden" || error.code === "not_found"));
});

test("post summaries rank with a stable cursor and preserve workspace scope", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Post ranking" });
  const publishedAt = new Date("2026-09-01T10:00:00.000Z");
  const firstPost = await insertPost({ campaignId: campaign.id, status: "published", publishedAt });
  const secondPost = await insertPost({ campaignId: campaign.id, status: "published", publishedAt });
  const thirdPost = await insertPost({ campaignId: campaign.id, status: "published", publishedAt });
  const account = await createAccount("instagram");
  const firstTarget = await insertTarget(firstPost, account, "instagram", { status: "success" });
  const secondTarget = await insertTarget(secondPost, account, "instagram", { status: "success" });
  await saveAnalyticsSnapshot(USER_ID, { postPlatformId: firstTarget, status: "available", metrics: { views: 900, likes: 90 }, collectedAt: publishedAt });
  await saveAnalyticsSnapshot(USER_ID, { postPlatformId: secondTarget, status: "available", metrics: { views: 300, likes: 30 }, collectedAt: publishedAt });
  const report = await getCampaignIntelligence(USER_ID, campaign.id, { pageSize: 20 });
  await persistPostIntelligenceSummaries({ workspaceId: campaign.workspaceId, campaignId: campaign.id, posts: report.posts.items, evaluatedAt: report.generatedAt });
  const firstPage = await listPostIntelligenceRankings(USER_ID, campaign.id, { type: "views", limit: 1 });
  const secondPage = await listPostIntelligenceRankings(USER_ID, campaign.id, { type: "views", limit: 1, cursor: firstPage.nextCursor ?? undefined });
  const thirdPage = await listPostIntelligenceRankings(USER_ID, campaign.id, { type: "views", limit: 1, cursor: secondPage.nextCursor ?? undefined });
  assert.equal(firstPage.items[0]?.postId, firstPost);
  assert.equal(secondPage.items[0]?.postId, secondPost);
  assert.equal(thirdPage.items[0]?.postId, thirdPost);
  assert.equal(new Set([...firstPage.items, ...secondPage.items, ...thirdPage.items].map((item) => item.postId)).size, 3);
  await markPostIntelligenceStale({ workspaceId: campaign.workspaceId, campaignId: campaign.id, postId: firstPost, reason: "test" });
  const stalePage = await listPostIntelligenceRankings(USER_ID, campaign.id, { type: "views", underperforming: false });
  assert.equal(stalePage.items.some((item) => item.postId === firstPost && item.state === "stale"), true);
  await assert.rejects(() => listPostIntelligenceRankings(OTHER_USER_ID, campaign.id), (error: unknown) => error instanceof AppError && (error.code === "forbidden" || error.code === "not_found"));
});
