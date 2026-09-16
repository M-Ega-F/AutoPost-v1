import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeCampaignPostCursor, encodeCampaignPostCursor, evaluateCampaignIntelligence } from "@/lib/domain/campaign-intelligence";
import { scoreCampaignEvaluationPriority } from "@/lib/domain/campaign-intelligence-history";

const publishedAt = new Date("2026-09-01T10:00:00.000Z");
const snapshot = (collectedAt: string, metrics: Record<string, number | null>) => ({ status: "available" as const, metrics, collectedAt: new Date(collectedAt) });

function post(postId: string, format: "image" | "video", metrics: Record<string, number | null>, previous?: Record<string, number | null>) {
  return {
    postId,
    status: "published" as const,
    format,
    publishedAt,
    scheduledAt: null,
    createdAt: new Date("2026-08-31T10:00:00.000Z"),
    platforms: [{ postPlatformId: `${postId}-target`, platform: "instagram" as const, history: [snapshot("2026-09-04T10:00:00.000Z", metrics), ...(previous ? [snapshot("2026-09-02T10:00:00.000Z", previous)] : [])] }],
  };
}

test("campaign intelligence scores and ranks comparable posts without exposing content", () => {
  const report = evaluateCampaignIntelligence({
    campaignId: "campaign-1",
    campaignName: "Launch",
    timezone: "Asia/Jakarta",
    goalMetric: "views",
    goalTarget: 10_000,
    now: new Date("2026-09-05T10:00:00.000Z"),
    posts: [
      post("post-a", "video", { views: 1000, likes: 100, comments: 20, shares: 10, saves: null, reach: 800, impressions: 1200 }, { views: 700, likes: 60, comments: 10, shares: 5, saves: null, reach: 600, impressions: 900 }),
      post("post-b", "image", { views: 300, likes: 10, comments: 2, shares: 1, saves: null, reach: null, impressions: 500 }, { views: 300, likes: 10, comments: 2, shares: 1, saves: null, reach: null, impressions: 500 }),
      post("post-c", "video", { views: 600, likes: 40, comments: 8, shares: 4, saves: 3, reach: 450, impressions: 700 }, { views: 500, likes: 30, comments: 6, shares: 2, saves: 2, reach: 400, impressions: 600 }),
    ],
  });
  assert.equal(report.overview.comparablePosts, 3);
  assert.equal(report.rankings.topPerformers[0]?.postId, "post-a");
  assert.equal(report.rankings.topPerformers[0]?.format, "video");
  assert.equal(report.posts.items[0]?.postId, "post-a");
  assert.equal(report.posts.items[0]?.engagementRate.source, "reach");
  assert.equal(report.posts.items[0]?.trend, "rising");
  assert.equal(report.formatPerformance.length, 2);
  assert.equal("contentText" in report.posts.items[0]!, false);
});

test("one post and insufficient observation do not produce a misleading winner", () => {
  const report = evaluateCampaignIntelligence({
    campaignId: "campaign-2",
    campaignName: "Small",
    timezone: "UTC",
    goalMetric: null,
    goalTarget: null,
    now: new Date("2026-09-01T10:30:00.000Z"),
    posts: [post("post-only", "image", { views: 10, likes: 1, comments: 0, shares: 0, saves: null, reach: 8, impressions: 12 })],
  });
  assert.equal(report.overview.comparablePosts, 0);
  assert.equal(report.overview.topPerformer, null);
  assert.equal(report.rankings.topPerformers.length, 0);
  assert.equal(report.posts.items[0]?.classification, "insufficient_data");
  assert.equal(report.postingTime.status, "insufficient_data");
});

test("comparison returns per-metric leaders and preserves unavailable metrics", () => {
  const report = evaluateCampaignIntelligence({
    campaignId: "campaign-3",
    campaignName: "Compare",
    timezone: "UTC",
    goalMetric: "reach",
    goalTarget: 1000,
    now: new Date("2026-09-05T10:00:00.000Z"),
    comparisonIds: ["post-a", "post-b"],
    posts: [
      post("post-a", "image", { views: 100, likes: 10, comments: 1, shares: 0, saves: null, reach: 80, impressions: null }),
      post("post-b", "video", { views: 90, likes: 20, comments: 2, shares: 1, saves: null, reach: 50, impressions: 100 }),
    ],
  });
  assert.equal(report.comparison?.status, "ready");
  assert.equal(report.comparison?.winners.reach, "post-a");
  assert.equal(report.comparison?.winners.engagement, "post-b");
  assert.equal(report.comparison?.posts[0]?.metrics.impressions, null);
});

test("cursor encoding is opaque and rejects malformed values", () => {
  const cursor = encodeCampaignPostCursor({ createdAt: "2026-09-01T10:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" });
  assert.notEqual(cursor.includes("2026-09-01"), true);
  assert.deepEqual(decodeCampaignPostCursor(cursor), { createdAt: "2026-09-01T10:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" });
  assert.throws(() => decodeCampaignPostCursor("not-a-cursor"));
});

test("evaluation priority is deterministic and fair to aging campaigns", () => {
  const now = new Date("2026-09-14T00:00:00.000Z");
  assert.equal(scoreCampaignEvaluationPriority({ status: "active", endAt: new Date("2026-09-15T00:00:00.000Z"), lastEvaluatedAt: now, freshness: "fresh", now }).priority, "urgent");
  assert.equal(scoreCampaignEvaluationPriority({ status: "draft", endAt: null, lastEvaluatedAt: new Date("2026-09-12T00:00:00.000Z"), freshness: "fresh", now }).priority, "high");
  assert.equal(scoreCampaignEvaluationPriority({ status: "draft", endAt: null, lastEvaluatedAt: now, freshness: "fresh", now }).priority, "low");
});
