import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  aggregateCampaignPerformance,
  evaluateCampaignGoal,
  evaluateCampaignHealth,
} from "@/lib/domain/campaign-performance";
import type { AnalyticsMetrics } from "@/lib/domain/types";

function metrics(values: Partial<AnalyticsMetrics>): AnalyticsMetrics {
  return { views: null, likes: null, comments: null, shares: null, saves: null, reach: null, impressions: null, ...values };
}

describe("campaign performance", () => {
  test("aggregates latest available metrics by platform and preserves nulls", () => {
    const result = aggregateCampaignPerformance({
      targets: [
        { postId: "post-1", postPlatformId: "target-1", platform: "instagram" },
        { postId: "post-2", postPlatformId: "target-2", platform: "facebook" },
      ],
      snapshots: [
        { postId: "post-1", postPlatformId: "target-1", platform: "instagram", status: "available", metrics: metrics({ views: 100, likes: 10, reach: 80 }), collectedAt: new Date("2026-09-02") },
        { postId: "post-1", postPlatformId: "target-1", platform: "instagram", status: "available", metrics: metrics({ views: 50, likes: 5 }), collectedAt: new Date("2026-09-01") },
        { postId: "post-2", postPlatformId: "target-2", platform: "facebook", status: "unavailable", metrics: metrics({ views: 999 }), collectedAt: new Date("2026-09-02") },
      ],
      totalPosts: 2,
      publishedPosts: 2,
      failedPosts: 0,
      partialFailurePosts: 0,
    });
    assert.equal(result.metrics.views, 100);
    assert.equal(result.metrics.comments, null);
    assert.equal(result.postsWithAnalytics, 1);
    assert.equal(result.platforms.find((platform) => platform.platform === "instagram")?.metrics.engagement, 10);
    assert.equal(result.platforms.find((platform) => platform.platform === "facebook")?.analyticsPosts, 0);
    assert.equal(result.metricCoverage.views.available, 1);
    assert.equal(result.metricCoverage.views.total, 2);
    assert.equal(result.trend?.deltaPercent.views, 100);
  });
});

describe("campaign goals and health", () => {
  test("evaluates milestones and completion without an opaque score", () => {
    const goal = evaluateCampaignGoal({ metric: "views", targetValue: 100_000, currentValue: 64_250, startAt: new Date("2026-09-01"), endAt: new Date("2026-10-01"), now: new Date("2026-09-15") });
    assert.equal(goal.progressPercent, 64.25);
    assert.deepEqual(goal.reachedMilestones, [25, 50]);
    assert.equal(goal.nextMilestone, 75);
    assert.equal(goal.status, "on_track");
    assert.equal(evaluateCampaignGoal({ ...goal, metric: "views", targetValue: 100, currentValue: 100, startAt: null, endAt: null }).status, "completed");
  });

  test("treats analytics unavailable as non-critical and exposes actionable risk", () => {
    const result = evaluateCampaignHealth({
      status: "active",
      progress: { totalPosts: 2, relevantPosts: 2, publishedPosts: 0, scheduledPosts: 2, processingPosts: 0, inReviewPosts: 0, draftPosts: 0, failedPosts: 0, partialFailurePosts: 0, completionPercent: 0 },
      overdueReviews: 0,
      approvalRequired: false,
      goal: { metric: "views", targetValue: 100, currentValue: null, progressPercent: 0, status: "not_started", reachedMilestones: [], nextMilestone: 25 },
      analyticsCoverage: 0,
      endAt: new Date("2026-09-30"),
      now: new Date("2026-09-14"),
    });
    assert.equal(result.status, "healthy");
    assert.equal(result.alerts.length, 0);
  });

  test("raises critical risk for an overdue campaign with unfinished work", () => {
    const result = evaluateCampaignHealth({
      status: "active",
      progress: { totalPosts: 2, relevantPosts: 2, publishedPosts: 0, scheduledPosts: 0, processingPosts: 0, inReviewPosts: 0, draftPosts: 2, failedPosts: 0, partialFailurePosts: 0, completionPercent: 0 },
      overdueReviews: 0,
      approvalRequired: false,
      goal: { metric: null, targetValue: null, currentValue: null, progressPercent: 0, status: "not_started", reachedMilestones: [], nextMilestone: null },
      analyticsCoverage: 0,
      endAt: new Date("2026-09-01"),
      now: new Date("2026-09-14"),
    });
    assert.equal(result.status, "critical");
    assert.ok(result.alerts.some((alert) => alert.type === "deadline"));
  });
});
