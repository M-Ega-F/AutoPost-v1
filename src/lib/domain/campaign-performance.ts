import type { AnalyticsMetrics } from "@/lib/domain/types";
import { ANALYTICS_METRICS } from "@/lib/domain/analytics";
import type { CampaignHealthStatus, CampaignProgress, CampaignStatus, CampaignTargetMetric } from "@/lib/domain/campaigns";

export type CampaignPerformanceTarget = {
  postId: string;
  postPlatformId: string;
  platform: string;
};

export type CampaignPerformanceSnapshot = CampaignPerformanceTarget & {
  status: "available" | "unavailable" | "failed";
  metrics: AnalyticsMetrics;
  collectedAt: Date;
};

export type CampaignPlatformPerformance = {
  platform: string;
  posts: number;
  analyticsPosts: number;
  metrics: AnalyticsMetrics & { engagement: number | null };
};

export type CampaignPerformanceTrend = {
  current: AnalyticsMetrics & { engagement: number | null };
  previous: AnalyticsMetrics & { engagement: number | null };
  deltaPercent: Partial<Record<keyof (AnalyticsMetrics & { engagement: number | null }), number | null>>;
};

export type CampaignPerformanceInsight = {
  kind: "platform" | "reach" | "coverage" | "publishing";
  message: string;
};

export type CampaignPerformanceSummary = {
  postsWithAnalytics: number;
  postsWithoutAnalytics: number;
  totalPosts: number;
  metrics: AnalyticsMetrics & { engagement: number | null };
  metricCoverage: Record<CampaignTargetMetric, { available: number; total: number }>;
  platforms: CampaignPlatformPerformance[];
  trend: CampaignPerformanceTrend | null;
  insights: CampaignPerformanceInsight[];
  publishingSuccessRate: number | null;
};

export type CampaignGoalEvaluation = {
  metric: CampaignTargetMetric | null;
  targetValue: number | null;
  currentValue: number | null;
  progressPercent: number;
  status: "not_started" | "in_progress" | "on_track" | "at_risk" | "behind" | "completed";
  reachedMilestones: number[];
  nextMilestone: number | null;
};

export type CampaignHealthEvaluation = {
  status: CampaignHealthStatus;
  reasons: string[];
  alerts: Array<{
    type: "publishing" | "approval" | "deadline" | "goal" | "analytics";
    severity: "warning" | "critical";
    title: string;
    href: string;
  }>;
};

function emptyMetrics(): AnalyticsMetrics {
  return { views: null, likes: null, comments: null, shares: null, saves: null, reach: null, impressions: null };
}

function engagement(metrics: AnalyticsMetrics): number | null {
  const values = [metrics.likes, metrics.comments, metrics.shares, metrics.saves].filter((value): value is number => value !== null);
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

function withEngagement(metrics: AnalyticsMetrics): AnalyticsMetrics & { engagement: number | null } {
  return { ...metrics, engagement: engagement(metrics) };
}

function addMetrics(target: AnalyticsMetrics, source: AnalyticsMetrics): void {
  for (const metric of ANALYTICS_METRICS) {
    if (source[metric] === null) continue;
    target[metric] = (target[metric] ?? 0) + source[metric];
  }
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
}

export function aggregateCampaignPerformance(input: {
  targets: CampaignPerformanceTarget[];
  snapshots: CampaignPerformanceSnapshot[];
  totalPosts: number;
  publishedPosts: number;
  failedPosts: number;
  partialFailurePosts: number;
}): CampaignPerformanceSummary {
  const snapshotsByTarget = new Map<string, CampaignPerformanceSnapshot[]>();
  for (const snapshot of input.snapshots) {
    const list = snapshotsByTarget.get(snapshot.postPlatformId) ?? [];
    list.push(snapshot);
    snapshotsByTarget.set(snapshot.postPlatformId, list);
  }
  for (const list of snapshotsByTarget.values()) list.sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());

  const latest = new Map<string, CampaignPerformanceSnapshot>();
  const previous = new Map<string, CampaignPerformanceSnapshot>();
  for (const target of input.targets) {
    const rows = snapshotsByTarget.get(target.postPlatformId) ?? [];
    const available = rows.filter((row) => row.status === "available");
    if (available[0]) latest.set(target.postPlatformId, available[0]);
    if (available[1]) previous.set(target.postPlatformId, available[1]);
  }

  const metrics = emptyMetrics();
  const previousMetrics = emptyMetrics();
  const metricCoverage = Object.fromEntries(ANALYTICS_METRICS.map((metric) => [metric, { available: 0, total: input.targets.length }])) as CampaignPerformanceSummary["metricCoverage"];
  for (const snapshot of latest.values()) {
    addMetrics(metrics, snapshot.metrics);
    for (const metric of ANALYTICS_METRICS) if (snapshot.metrics[metric] !== null) metricCoverage[metric].available += 1;
  }
  for (const snapshot of previous.values()) addMetrics(previousMetrics, snapshot.metrics);

  const byPlatform = new Map<string, CampaignPlatformPerformance>();
  for (const target of input.targets) {
    const item = byPlatform.get(target.platform) ?? { platform: target.platform, posts: 0, analyticsPosts: 0, metrics: withEngagement(emptyMetrics()) };
    item.posts += 1;
    const snapshot = latest.get(target.postPlatformId);
    if (snapshot) {
      item.analyticsPosts += 1;
      addMetrics(item.metrics, snapshot.metrics);
    }
    item.metrics.engagement = engagement(item.metrics);
    byPlatform.set(target.platform, item);
  }
  const platforms = [...byPlatform.values()].sort((a, b) => b.metrics.engagement === null ? -1 : a.metrics.engagement === null ? 1 : b.metrics.engagement - a.metrics.engagement);
  const currentWithEngagement = withEngagement(metrics);
  const previousWithEngagement = withEngagement(previousMetrics);
  const hasPrevious = previous.size > 0;
  const trendMetrics = [...ANALYTICS_METRICS, "engagement"] as const;
  const trend = hasPrevious ? {
    current: currentWithEngagement,
    previous: previousWithEngagement,
    deltaPercent: Object.fromEntries(trendMetrics.map((metric) => [metric, delta(currentWithEngagement[metric], previousWithEngagement[metric])])),
  } as CampaignPerformanceTrend : null;
  const insights: CampaignPerformanceInsight[] = [];
  const bestPlatform = platforms.find((platform) => platform.analyticsPosts > 0 && platform.metrics.engagement !== null);
  if (platforms.length > 1 && bestPlatform) insights.push({ kind: "platform", message: `${bestPlatform.platform} has the highest recorded engagement.` });
  if (currentWithEngagement.reach !== null && currentWithEngagement.reach > 0) insights.push({ kind: "reach", message: `Campaign reach is ${currentWithEngagement.reach.toLocaleString()}.` });
  if (input.totalPosts > 0) insights.push({ kind: "coverage", message: `Analytics are available for ${latest.size} of ${input.totalPosts} posts.` });
  const terminal = input.publishedPosts + input.failedPosts + input.partialFailurePosts;
  const publishingSuccessRate = terminal === 0 ? null : input.publishedPosts / terminal;
  if (publishingSuccessRate !== null && terminal >= 2) insights.push({ kind: "publishing", message: `Publishing success rate is ${Math.round(publishingSuccessRate * 100)}%.` });
  return { postsWithAnalytics: new Set([...latest.values()].map((snapshot) => snapshot.postId)).size, postsWithoutAnalytics: Math.max(0, input.totalPosts - new Set([...latest.values()].map((snapshot) => snapshot.postId)).size), totalPosts: input.totalPosts, metrics: currentWithEngagement, metricCoverage, platforms, trend, insights, publishingSuccessRate };
}

export function evaluateCampaignGoal(input: {
  metric: CampaignTargetMetric | null;
  targetValue: number | null;
  currentValue: number | null;
  startAt: Date | null;
  endAt: Date | null;
  now?: Date;
}): CampaignGoalEvaluation {
  const currentValue = input.currentValue;
  const progressPercent = input.targetValue && currentValue !== null ? Math.min(100, Math.round((currentValue / input.targetValue) * 10_000) / 100) : 0;
  const reachedMilestones = [25, 50, 75, 100].filter((milestone) => progressPercent >= milestone);
  const nextMilestone = [25, 50, 75, 100].find((milestone) => progressPercent < milestone) ?? null;
  if (!input.metric || !input.targetValue || currentValue === null || currentValue <= 0) return { metric: input.metric, targetValue: input.targetValue, currentValue, progressPercent, status: "not_started", reachedMilestones, nextMilestone };
  if (progressPercent >= 100) return { metric: input.metric, targetValue: input.targetValue, currentValue, progressPercent, status: "completed", reachedMilestones, nextMilestone };
  const now = (input.now ?? new Date()).getTime();
  const start = input.startAt?.getTime();
  const end = input.endAt?.getTime();
  const elapsed = start !== undefined && end !== undefined && end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : null;
  const expected = elapsed === null ? null : elapsed * 100;
  const status = expected === null || progressPercent >= expected * 0.75 ? "on_track" : progressPercent >= expected * 0.5 ? "at_risk" : "behind";
  return { metric: input.metric, targetValue: input.targetValue, currentValue, progressPercent, status: progressPercent === 0 ? "in_progress" : status, reachedMilestones, nextMilestone };
}

export function evaluateCampaignHealth(input: {
  status: CampaignStatus;
  progress: CampaignProgress;
  overdueReviews: number;
  approvalRequired: boolean;
  goal: CampaignGoalEvaluation;
  analyticsCoverage: number;
  now?: Date;
  endAt: Date | null;
}): CampaignHealthEvaluation {
  if (input.status === "completed" || input.status === "archived") return { status: "completed", reasons: [], alerts: [] };
  const reasons: string[] = [];
  const alerts: CampaignHealthEvaluation["alerts"] = [];
  const unfinished = input.progress.relevantPosts - input.progress.publishedPosts;
  const failures = input.progress.failedPosts + input.progress.partialFailurePosts;
  const now = (input.now ?? new Date()).getTime();
  const remaining = input.endAt ? input.endAt.getTime() - now : null;
  const deadlineDays = remaining === null ? null : remaining / 86_400_000;
  if (failures > 0) { reasons.push("Some content failed to publish."); alerts.push({ type: "publishing", severity: failures >= 2 ? "critical" : "warning", title: "Publishing issues need attention", href: "/history" }); }
  if (input.approvalRequired && input.progress.inReviewPosts > 0) { reasons.push("Some content is waiting for approval."); alerts.push({ type: "approval", severity: input.overdueReviews > 0 ? "critical" : "warning", title: "Approval work is waiting", href: "/reviews" }); }
  if (input.progress.totalPosts === 0) reasons.push("No content planned yet.");
  if (deadlineDays !== null && unfinished > 0 && deadlineDays < 0) { reasons.push("The campaign end date has passed."); alerts.push({ type: "deadline", severity: "critical", title: "Campaign deadline is overdue", href: "/calendar" }); }
  else if (deadlineDays !== null && unfinished > 0 && deadlineDays <= 3) { reasons.push("The campaign end date is very close."); alerts.push({ type: "deadline", severity: "critical", title: "Campaign deadline is within 3 days", href: "/calendar" }); }
  else if (deadlineDays !== null && unfinished > 0 && deadlineDays <= 7) { reasons.push("The campaign end date is approaching."); alerts.push({ type: "deadline", severity: "warning", title: "Campaign deadline is approaching", href: "/calendar" }); }
  if (input.goal.status === "behind" || input.goal.status === "at_risk") { reasons.push("Goal progress is behind the campaign timeline."); alerts.push({ type: "goal", severity: input.goal.status === "behind" ? "critical" : "warning", title: "Goal progress needs attention", href: "/campaigns" }); }
  if (input.analyticsCoverage > 0 && input.analyticsCoverage < 0.5) reasons.push("Analytics coverage is still limited.");
  const status: CampaignHealthStatus = (deadlineDays !== null && deadlineDays < 0 && unfinished > 0) || failures >= Math.max(2, Math.ceil(Math.max(1, input.progress.relevantPosts) / 2)) ? "critical" : alerts.some((alert) => alert.severity === "critical") || input.goal.status === "behind" ? "at_risk" : reasons.length > 0 ? "warning" : "healthy";
  return { status, reasons, alerts };
}
