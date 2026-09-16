import "server-only";

import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";

import type { AnalyticsMetricKey, AnalyticsMetrics } from "@/lib/domain/types";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { campaigns, postAnalyticsSnapshots, postMedia, postPlatforms, posts, workspaces } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { Platform, PostStatus } from "@/lib/status";
import { normalizeTimeZone } from "@/lib/time";

export const CONTENT_SCORE_WEIGHTS = {
  engagement: 0.35,
  reach: 0.2,
  views: 0.2,
  trend: 0.1,
  goalContribution: 0.1,
  publishing: 0.05,
} as const;

export const INTELLIGENCE_THRESHOLDS = {
  minimumComparablePosts: 2,
  minimumClassificationPosts: 3,
  minimumUnderperformerPosts: 5,
  minimumGroupSample: 3,
  minimumTimingSample: 3,
  minimumObservationHours: 24,
  freshDays: 2,
  agingDays: 7,
  risingDelta: 0.1,
  stableDelta: 0.1,
  historicalStableDelta: 5,
  momentumChangeDelta: 8,
  staleSnapshotDays: 2,
  evaluationLockTtlMs: 5 * 60_000,
  minimumExperimentSample: 2,
} as const;

export const CAMPAIGN_INTELLIGENCE_BATCH_SIZE = 100;
export const CAMPAIGN_INTELLIGENCE_EVALUATION_VERSION = "17e-v1";
export const CAMPAIGN_INTELLIGENCE_HISTORY_LIMIT = 50;

export type CampaignIntelligenceEvaluationMode = "incremental" | "full";
export type CampaignIntelligenceSnapshotReason = "scheduled" | "manual" | "analytics_changed" | "campaign_changed" | "goal_changed" | "post_changed" | "automation";
export type CampaignIntelligenceHistoricalTrend = "improving" | "stable" | "declining" | "insufficient_data";
export type CampaignIntelligenceMomentum = "accelerating" | "improving" | "stable" | "slowing" | "declining" | "unknown";
export type CampaignOptimizationOpportunity = {
  type: "posting_time" | "platform" | "format" | "content_performance" | "goal_contribution";
  priority: "low" | "medium" | "high";
  confidence: IntelligenceConfidence;
  title: string;
  reason: string;
  evidence: Record<string, string | number | null>;
  createdAt: string;
  status: "active" | "historical";
  fingerprint: string;
};

export const INTELLIGENCE_METRICS = [
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "reach",
  "impressions",
] as const satisfies readonly AnalyticsMetricKey[];

export type IntelligenceConfidence = "high" | "medium" | "low" | "insufficient";
export type IntelligenceFreshness = "fresh" | "aging" | "stale" | "unavailable";
export type IntelligenceTrend = "rising" | "stable" | "declining" | "unknown";
export type IntelligenceClassification = "top_performer" | "performing" | "average" | "underperforming" | "insufficient_data";
export type IntelligenceDataQualityStatus = "high" | "medium" | "low" | "insufficient";
export type IntelligenceMetric = AnalyticsMetricKey | "engagement" | "engagementRate";

export type CampaignIntelligenceSnapshot = {
  status: "available" | "unavailable" | "failed";
  metrics: Partial<AnalyticsMetrics>;
  collectedAt: Date;
};

export type CampaignIntelligenceTargetInput = {
  postPlatformId: string;
  platform: Platform;
  history: CampaignIntelligenceSnapshot[];
};

export type CampaignIntelligencePostInput = {
  postId: string;
  status: PostStatus;
  platforms: CampaignIntelligenceTargetInput[];
  format: "image" | "video" | "text";
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
};

export type CampaignIntelligencePost = {
  postId: string;
  status: PostStatus;
  platforms: Platform[];
  format: "image" | "video" | "text";
  publishedAt: Date | null;
  scheduledAt: Date | null;
  metrics: AnalyticsMetrics & { engagement: number | null };
  engagementRate: { value: number | null; source: "reach" | "impressions" | "views" | null };
  score: number | null;
  confidence: IntelligenceConfidence;
  trend: IntelligenceTrend;
  classification: IntelligenceClassification;
  rank: number | null;
  goalContribution: number | null;
  goalMetricValue: number | null;
  analyticsCollectedAt: Date | null;
  dataQuality: {
    coverage: number;
    sampleSize: number;
    freshness: IntelligenceFreshness;
  };
  observation: "ready" | "insufficient_observation_time" | "not_published";
};

export type CampaignIntelligenceGroup = {
  name: string;
  posts: number;
  analyticsPosts: number;
  confidence: IntelligenceConfidence;
  trend: IntelligenceTrend;
  averageScore: number | null;
  averageEngagement: number | null;
  averageEngagementRate: number | null;
  metricCoverage: number;
  goalContribution: number | null;
};

export type CampaignPostingTimeInsight = {
  bestDay: string | null;
  bestWindow: string | null;
  metricBasis: "score" | "engagementRate" | "engagement" | null;
  value: number | null;
  sampleSize: number;
  confidence: IntelligenceConfidence;
  status: "ready" | "insufficient_data";
};

export type CampaignIntelligenceInsight = {
  kind: "performance" | "platform" | "format" | "timing" | "goal" | "data_quality";
  title: string;
  message: string;
  evidence: Record<string, string | number | null>;
  confidence: IntelligenceConfidence;
};

export type CampaignRecommendation = {
  type: "continue_format" | "test_format" | "focus_platform" | "adjust_posting_time" | "investigate_underperformance" | "improve_analytics_coverage" | "goal_concentration" | "content_reuse_candidate";
  priority: "info" | "low" | "medium" | "high";
  title: string;
  reason: string;
  evidence: Record<string, string | number | null>;
  confidence: IntelligenceConfidence;
  action: string | null;
  fingerprint: string;
};

export type CampaignIntelligenceDataQuality = {
  status: IntelligenceDataQualityStatus;
  analyticsCoverage: number;
  metricCoverage: number;
  sampleSize: number;
  freshestSnapshotAt: Date | null;
  freshness: IntelligenceFreshness;
  confidence: IntelligenceConfidence;
  message: string;
};

export type CampaignIntelligenceGoal = {
  metric: AnalyticsMetricKey | null;
  targetValue: number | null;
  currentValue: number | null;
  topContributors: CampaignIntelligencePost[];
  contributionCoverage: number;
};

export type CampaignIntelligenceComparison = {
  status: "ready" | "insufficient_data";
  posts: CampaignIntelligencePost[];
  winners: Partial<Record<"score" | AnalyticsMetricKey | "engagement" | "engagementRate" | "goalContribution", string>>;
};

export type CampaignIntelligenceReport = {
  campaignId: string;
  campaignName: string;
  timezone: string;
  generatedAt: Date;
  dataQuality: CampaignIntelligenceDataQuality;
  overview: {
    totalPosts: number;
    publishedPosts: number;
    comparablePosts: number;
    averageScore: number | null;
    topPerformer: CampaignIntelligencePost | null;
    underperformerCount: number;
  };
  posts: { items: CampaignIntelligencePost[]; page: number; pageSize: number; total: number; totalPages: number };
  rankings: {
    topPerformers: CampaignIntelligencePost[];
    rising: CampaignIntelligencePost[];
    improving: CampaignIntelligencePost[];
    declining: CampaignIntelligencePost[];
    underperformers: CampaignIntelligencePost[];
    mostEngaging: CampaignIntelligencePost[];
    highestReach: CampaignIntelligencePost[];
    highestViews: CampaignIntelligencePost[];
    goalContributors: CampaignIntelligencePost[];
  };
  platformPerformance: CampaignIntelligenceGroup[];
  formatPerformance: CampaignIntelligenceGroup[];
  postingTime: CampaignPostingTimeInsight;
  goal: CampaignIntelligenceGoal;
  insights: CampaignIntelligenceInsight[];
  recommendations: CampaignRecommendation[];
  opportunities: CampaignOptimizationOpportunity[];
  historicalTrend: CampaignIntelligenceHistoricalTrend;
  momentum: CampaignIntelligenceMomentum;
  comparison: CampaignIntelligenceComparison | null;
  fingerprint: string;
  inputFingerprint: string;
};

type PreparedPost = CampaignIntelligencePost & { historyPoints: number };

function emptyMetrics(): AnalyticsMetrics {
  return { views: null, likes: null, comments: null, shares: null, saves: null, reach: null, impressions: null };
}

function normalizeMetrics(metrics: Partial<AnalyticsMetrics>): AnalyticsMetrics {
  return Object.fromEntries(INTELLIGENCE_METRICS.map((metric) => {
    const value = metrics[metric];
    return [metric, typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null];
  })) as AnalyticsMetrics;
}

function sumMetrics(rows: AnalyticsMetrics[]): AnalyticsMetrics {
  const result = emptyMetrics();
  for (const metric of INTELLIGENCE_METRICS) {
    const values = rows.map((row) => row[metric]).filter((value): value is number => value !== null);
    result[metric] = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  return result;
}

function engagement(metrics: AnalyticsMetrics): number | null {
  const values = [metrics.likes, metrics.comments, metrics.shares, metrics.saves].filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function engagementRate(metrics: AnalyticsMetrics): CampaignIntelligencePost["engagementRate"] {
  const total = engagement(metrics);
  if (total === null) return { value: null, source: null };
  for (const source of ["reach", "impressions", "views"] as const) {
    const denominator = metrics[source];
    if (denominator !== null && denominator > 0) return { value: total / denominator, source };
  }
  return { value: null, source: null };
}

function average(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return available.length > 0 ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function freshness(collectedAt: Date | null, now: Date): IntelligenceFreshness {
  if (!collectedAt) return "unavailable";
  const days = Math.max(0, now.getTime() - collectedAt.getTime()) / 86_400_000;
  return days <= INTELLIGENCE_THRESHOLDS.freshDays ? "fresh" : days <= INTELLIGENCE_THRESHOLDS.agingDays ? "aging" : "stale";
}

function confidence(input: { coverage: number; sampleSize: number; freshness: IntelligenceFreshness }): IntelligenceConfidence {
  if (input.sampleSize === 0 || input.coverage === 0) return "insufficient";
  if (input.coverage >= 0.75 && input.sampleSize >= 2 && input.freshness === "fresh") return "high";
  if (input.coverage >= 0.5 || input.sampleSize >= 2) return "medium";
  return "low";
}

function trend(current: AnalyticsMetrics & { engagement: number | null }, previous: AnalyticsMetrics & { engagement: number | null }): IntelligenceTrend {
  const pairs: Array<[number | null, number | null]> = [[current.engagement, previous.engagement], [current.views, previous.views], [current.reach, previous.reach]];
  const pair = pairs.find(([value, prior]) => value !== null && prior !== null && prior > 0);
  if (!pair) return "unknown";
  const change = (pair[0]! - pair[1]!) / Math.abs(pair[1]!);
  if (change >= INTELLIGENCE_THRESHOLDS.risingDelta) return "rising";
  if (change <= -INTELLIGENCE_THRESHOLDS.stableDelta) return "declining";
  return "stable";
}

function observationStatus(post: CampaignIntelligencePostInput, now: Date): CampaignIntelligencePost["observation"] {
  if (!post.publishedAt) return "not_published";
  return now.getTime() - post.publishedAt.getTime() >= INTELLIGENCE_THRESHOLDS.minimumObservationHours * 3_600_000 ? "ready" : "insufficient_observation_time";
}

function preparedPost(input: CampaignIntelligencePostInput, goalMetric: AnalyticsMetricKey | null, goalTarget: number | null, now: Date): PreparedPost {
  const latestMetrics: AnalyticsMetrics[] = [];
  const previousMetrics: AnalyticsMetrics[] = [];
  let latestCollectedAt: Date | null = null;
  let historyPoints = 0;
  let metricValues = 0;
  let metricSlots = 0;
  for (const target of input.platforms) {
    const rows = [...target.history].sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime()).filter((row) => row.status === "available");
    const latest = rows[0];
    if (latest) {
      latestMetrics.push(normalizeMetrics(latest.metrics));
      historyPoints += rows.length;
      if (!latestCollectedAt || latest.collectedAt > latestCollectedAt) latestCollectedAt = latest.collectedAt;
      for (const metric of INTELLIGENCE_METRICS) {
        metricSlots += 1;
        if (latest.metrics[metric] !== null && latest.metrics[metric] !== undefined) metricValues += 1;
      }
    }
    if (rows[1]) previousMetrics.push(normalizeMetrics(rows[1].metrics));
  }
  const metrics = sumMetrics(latestMetrics);
  const previous = sumMetrics(previousMetrics);
  const withEngagement = { ...metrics, engagement: engagement(metrics) };
  const previousWithEngagement = { ...previous, engagement: engagement(previous) };
  const coverage = metricSlots === 0 ? 0 : metricValues / metricSlots;
  const fresh = freshness(latestCollectedAt, now);
  const dataConfidence = confidence({ coverage, sampleSize: historyPoints, freshness: fresh });
  const goalMetricValue = goalMetric ? metrics[goalMetric] : null;
  const goalContribution = goalMetricValue !== null && goalTarget && goalTarget > 0 ? Math.min(100, rounded((goalMetricValue / goalTarget) * 100) ?? 0) : null;
  return {
    postId: input.postId,
    status: input.status,
    platforms: input.platforms.map((target) => target.platform),
    format: input.format,
    publishedAt: input.publishedAt,
    scheduledAt: input.scheduledAt,
    metrics: withEngagement,
    engagementRate: engagementRate(metrics),
    score: null,
    confidence: dataConfidence,
    trend: trend(withEngagement, previousWithEngagement),
    classification: "insufficient_data",
    rank: null,
    goalContribution,
    goalMetricValue,
    analyticsCollectedAt: latestCollectedAt,
    dataQuality: { coverage, sampleSize: historyPoints, freshness: fresh },
    observation: observationStatus(input, now),
    historyPoints,
  };
}

function normalizedValue(value: number | null, maximum: number | null): number | null {
  if (value === null || maximum === null || maximum <= 0) return null;
  return Math.min(1, value / maximum);
}

function scorePosts(postsToScore: PreparedPost[], goalMetric: AnalyticsMetricKey | null): void {
  const comparable = postsToScore.filter((post) => post.confidence !== "insufficient" && post.observation === "ready");
  const max = (key: "engagement" | "reach" | "views" | "goalMetricValue") => Math.max(0, ...comparable.map((post) => post.metrics[key as keyof typeof post.metrics] as number | null ?? (key === "goalMetricValue" ? post.goalMetricValue : null) ?? 0));
  const maxima = { engagement: max("engagement"), reach: max("reach"), views: max("views"), goal: goalMetric ? max("goalMetricValue") : 0 };
  const ranked: Array<{ post: PreparedPost; score: number }> = [];
  for (const post of postsToScore) {
    if (comparable.length < INTELLIGENCE_THRESHOLDS.minimumComparablePosts || !comparable.includes(post)) continue;
    const factors: Array<[number | null, number]> = [
      [normalizedValue(post.metrics.engagement, maxima.engagement), CONTENT_SCORE_WEIGHTS.engagement],
      [normalizedValue(post.metrics.reach, maxima.reach), CONTENT_SCORE_WEIGHTS.reach],
      [normalizedValue(post.metrics.views, maxima.views), CONTENT_SCORE_WEIGHTS.views],
      [post.trend === "rising" ? 1 : post.trend === "stable" ? 0.5 : post.trend === "declining" ? 0 : null, CONTENT_SCORE_WEIGHTS.trend],
      [goalMetric ? normalizedValue(post.goalMetricValue, maxima.goal) : null, CONTENT_SCORE_WEIGHTS.goalContribution],
      [post.status === "published" ? 1 : post.status === "partial_failure" ? 0.5 : post.status === "failed" ? 0 : null, CONTENT_SCORE_WEIGHTS.publishing],
    ];
    const available = factors.filter(([value]) => value !== null);
    if (available.length === 0) continue;
    const totalWeight = available.reduce((sum, [, weight]) => sum + weight, 0);
    const value = available.reduce((sum, [factor, weight]) => sum + factor! * weight, 0) / totalWeight;
    ranked.push({ post, score: Math.round(Math.max(0, Math.min(100, value * 100))) });
  }
  ranked.sort((a, b) => b.score - a.score || a.post.postId.localeCompare(b.post.postId));
  const averageScore = average(ranked.map((item) => item.score));
  for (const [index, item] of ranked.entries()) {
    item.post.score = item.score;
    item.post.rank = index + 1;
    const sampleSize = ranked.length;
    if (sampleSize < INTELLIGENCE_THRESHOLDS.minimumComparablePosts || item.post.observation !== "ready") item.post.classification = "insufficient_data";
    else if (sampleSize >= INTELLIGENCE_THRESHOLDS.minimumClassificationPosts && index < Math.max(1, Math.ceil(sampleSize * 0.2))) item.post.classification = "top_performer";
    else if (sampleSize >= INTELLIGENCE_THRESHOLDS.minimumUnderperformerPosts && index >= Math.floor(sampleSize * 0.8) && item.score < (averageScore ?? item.score)) item.post.classification = "underperforming";
    else if (item.score >= (averageScore ?? item.score)) item.post.classification = "performing";
    else item.post.classification = "average";
  }
}

function groupConfidence(postsInGroup: CampaignIntelligencePost[]): IntelligenceConfidence {
  return confidence({ coverage: average(postsInGroup.map((post) => post.dataQuality.coverage)) ?? 0, sampleSize: postsInGroup.length, freshness: postsInGroup.some((post) => post.dataQuality.freshness === "fresh") ? "fresh" : postsInGroup.some((post) => post.dataQuality.freshness === "aging") ? "aging" : postsInGroup.length ? "stale" : "unavailable" });
}

function groupPerformance(name: string, group: CampaignIntelligencePost[]): CampaignIntelligenceGroup {
  const tracked = group.filter((post) => post.confidence !== "insufficient");
  const trendCounts = new Map<IntelligenceTrend, number>();
  for (const post of tracked) trendCounts.set(post.trend, (trendCounts.get(post.trend) ?? 0) + 1);
  const trendValue = [...trendCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  return { name, posts: group.length, analyticsPosts: tracked.length, confidence: groupConfidence(group), trend: trendValue, averageScore: rounded(average(group.map((post) => post.score))), averageEngagement: rounded(average(group.map((post) => post.metrics.engagement))), averageEngagementRate: rounded(average(group.map((post) => post.engagementRate.value))), metricCoverage: rounded(average(group.map((post) => post.dataQuality.coverage))) ?? 0, goalContribution: rounded(average(group.map((post) => post.goalContribution))) };
}

function topBy(postsToRank: CampaignIntelligencePost[], value: (post: CampaignIntelligencePost) => number | null): CampaignIntelligencePost[] {
  return postsToRank.filter((post) => value(post) !== null).sort((a, b) => (value(b)! - value(a)!) || a.postId.localeCompare(b.postId)).slice(0, 3);
}

function postingTime(postsToAnalyze: CampaignIntelligencePost[], timeZone: string): CampaignPostingTimeInsight {
  const rows = postsToAnalyze.filter((post) => post.publishedAt && post.observation === "ready" && (post.score !== null || post.engagementRate.value !== null || post.metrics.engagement !== null));
  if (rows.length < INTELLIGENCE_THRESHOLDS.minimumTimingSample) return { bestDay: null, bestWindow: null, metricBasis: null, value: null, sampleSize: rows.length, confidence: "insufficient", status: "insufficient_data" };
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", hour: "numeric", hourCycle: "h23" });
  const groups = new Map<string, { day: string; window: string; values: number[] }>();
  for (const post of rows) {
    const parts = formatter.formatToParts(post.publishedAt!);
    const day = parts.find((part) => part.type === "weekday")?.value ?? "Unknown";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const start = Math.floor(hour / 3) * 3;
    const value = post.engagementRate.value ?? post.metrics.engagement ?? post.score;
    if (value === null) continue;
    const key = `${day}:${start}`;
    const item = groups.get(key) ?? { day, window: `${String(start).padStart(2, "0")}-${String(start + 3).padStart(2, "0")}`, values: [] };
    item.values.push(value);
    groups.set(key, item);
  }
  const best = [...groups.values()].sort((a, b) => (average(b.values)! - average(a.values)!) || a.day.localeCompare(b.day))[0];
  if (!best) return { bestDay: null, bestWindow: null, metricBasis: null, value: null, sampleSize: rows.length, confidence: "insufficient", status: "insufficient_data" };
  const basis = rows.some((post) => post.engagementRate.value !== null) ? "engagementRate" : rows.some((post) => post.metrics.engagement !== null) ? "engagement" : "score";
  return { bestDay: best.day, bestWindow: best.window, metricBasis: basis, value: rounded(average(best.values)), sampleSize: rows.length, confidence: rows.length >= 6 ? "high" : "medium", status: "ready" };
}

function buildRecommendations(input: { posts: CampaignIntelligencePost[]; platformPerformance: CampaignIntelligenceGroup[]; formatPerformance: CampaignIntelligenceGroup[]; postingTime: CampaignPostingTimeInsight; dataQuality: CampaignIntelligenceDataQuality; goal: CampaignIntelligenceGoal; underperformers: CampaignIntelligencePost[]; }): CampaignRecommendation[] {
  const recommendations: CampaignRecommendation[] = [];
  const add = (recommendation: Omit<CampaignRecommendation, "fingerprint">) => recommendations.push({ ...recommendation, fingerprint: `${recommendation.type}:${JSON.stringify(recommendation.evidence)}` });
  if (input.dataQuality.analyticsCoverage < 0.6) add({ type: "improve_analytics_coverage", priority: "info", title: "Improve analytics coverage", reason: "Several campaign posts do not have usable analytics yet.", evidence: { coverage: input.dataQuality.analyticsCoverage, sampleSize: input.dataQuality.sampleSize }, confidence: input.dataQuality.confidence, action: "Refresh analytics" });
  if (input.underperformers.length > 0) add({ type: "investigate_underperformance", priority: "medium", title: "Investigate underperforming content", reason: "These posts are below the campaign comparison baseline after the observation window.", evidence: { underperformingCount: input.underperformers.length, sampleSize: input.dataQuality.sampleSize }, confidence: input.dataQuality.confidence, action: "Review content" });
  const formats = input.formatPerformance.filter((group) => group.analyticsPosts >= INTELLIGENCE_THRESHOLDS.minimumGroupSample && group.averageScore !== null);
  if (formats.length >= 2) {
    const sorted = [...formats].sort((a, b) => (b.averageScore! - a.averageScore!));
    const best = sorted[0];
    const other = sorted[1];
    add({ type: best.averageScore! - other.averageScore! >= 10 ? "continue_format" : "test_format", priority: best.averageScore! - other.averageScore! >= 10 ? "medium" : "low", title: best.averageScore! - other.averageScore! >= 10 ? `Continue testing ${best.name} content` : "Test another content format", reason: `${best.name} currently has the strongest campaign score signal among formats with enough data.`, evidence: { bestFormat: best.name, bestAverageScore: best.averageScore, comparisonAverageScore: other.averageScore, sampleSize: best.analyticsPosts }, confidence: best.confidence, action: null });
  }
  const platforms = input.platformPerformance.filter((group) => group.analyticsPosts >= INTELLIGENCE_THRESHOLDS.minimumGroupSample && group.averageScore !== null).sort((a, b) => (b.averageScore! - a.averageScore!));
  if (platforms.length >= 2 && platforms[0].averageScore! - platforms[1].averageScore! >= 10) add({ type: "focus_platform", priority: "medium", title: `Focus on ${platforms[0].name}`, reason: `${platforms[0].name} is leading the campaign comparison by average performance score.`, evidence: { platform: platforms[0].name, averageScore: platforms[0].averageScore, comparisonAverageScore: platforms[1].averageScore, sampleSize: platforms[0].analyticsPosts }, confidence: platforms[0].confidence, action: null });
  if (input.postingTime.status === "ready") add({ type: "adjust_posting_time", priority: "low", title: `Use the ${input.postingTime.bestDay} ${input.postingTime.bestWindow} window as a test`, reason: "Published campaign content shows the strongest available signal in this local-time window.", evidence: { day: input.postingTime.bestDay, window: input.postingTime.bestWindow, metricBasis: input.postingTime.metricBasis, sampleSize: input.postingTime.sampleSize }, confidence: input.postingTime.confidence, action: null });
  const reusable = input.posts.find((post) => post.classification === "top_performer" && (post.confidence === "high" || post.confidence === "medium"));
  if (reusable) add({ type: "content_reuse_candidate", priority: "low", title: "Reuse a proven content pattern", reason: "A top campaign performer has enough data to be a safe candidate for a new draft.", evidence: { postId: reusable.postId, score: reusable.score, confidence: reusable.confidence }, confidence: reusable.confidence, action: "Duplicate as draft" });
  const contributors = input.goal.topContributors.filter((post) => post.goalContribution !== null);
  const concentration = contributors.reduce((sum, post) => sum + (post.goalContribution ?? 0), 0);
  if (contributors.length >= 3 && concentration >= 70) add({ type: "goal_concentration", priority: "medium", title: "Reduce goal concentration risk", reason: "A small group of posts contributes most of the current campaign goal signal.", evidence: { topContributorCount: contributors.length, contributionPercent: rounded(concentration), sampleSize: input.dataQuality.sampleSize }, confidence: input.dataQuality.confidence, action: null });
  return recommendations;
}

export function buildOptimizationOpportunities(
  recommendations: CampaignRecommendation[],
  createdAt: Date,
): CampaignOptimizationOpportunity[] {
  const typeMap: Record<CampaignRecommendation["type"], CampaignOptimizationOpportunity["type"]> = {
    continue_format: "format",
    test_format: "format",
    focus_platform: "platform",
    adjust_posting_time: "posting_time",
    investigate_underperformance: "content_performance",
    improve_analytics_coverage: "content_performance",
    goal_concentration: "goal_contribution",
    content_reuse_candidate: "content_performance",
  };
  return recommendations.map((recommendation) => ({
    type: typeMap[recommendation.type],
    priority: recommendation.priority === "info" ? "low" : recommendation.priority,
    confidence: recommendation.confidence,
    title: recommendation.title,
    reason: recommendation.reason,
    evidence: recommendation.evidence,
    createdAt: createdAt.toISOString(),
    status: "active",
    fingerprint: recommendation.fingerprint,
  }));
}

function buildInsights(input: { dataQuality: CampaignIntelligenceDataQuality; platformPerformance: CampaignIntelligenceGroup[]; formatPerformance: CampaignIntelligenceGroup[]; postingTime: CampaignPostingTimeInsight; goal: CampaignIntelligenceGoal; }): CampaignIntelligenceInsight[] {
  const insights: CampaignIntelligenceInsight[] = [];
  if (input.dataQuality.status === "insufficient" || input.dataQuality.freshness === "stale") insights.push({ kind: "data_quality", title: input.dataQuality.freshness === "stale" ? "Analytics may be outdated" : "More analytics are needed", message: input.dataQuality.message, evidence: { coverage: input.dataQuality.analyticsCoverage, sampleSize: input.dataQuality.sampleSize, freshness: input.dataQuality.freshness }, confidence: input.dataQuality.confidence });
  const platform = [...input.platformPerformance].filter((group) => group.analyticsPosts >= INTELLIGENCE_THRESHOLDS.minimumGroupSample && group.averageScore !== null).sort((a, b) => (b.averageScore! - a.averageScore!))[0];
  if (platform) insights.push({ kind: "platform", title: "Leading platform signal", message: `${platform.name} currently leads the campaign performance comparison.`, evidence: { platform: platform.name, averageScore: platform.averageScore, sampleSize: platform.analyticsPosts }, confidence: platform.confidence });
  const format = [...input.formatPerformance].filter((group) => group.analyticsPosts >= INTELLIGENCE_THRESHOLDS.minimumGroupSample && group.averageScore !== null).sort((a, b) => (b.averageScore! - a.averageScore!))[0];
  if (format) insights.push({ kind: "format", title: "Format signal", message: `${format.name} currently has the strongest average score among comparable formats.`, evidence: { format: format.name, averageScore: format.averageScore, sampleSize: format.analyticsPosts }, confidence: format.confidence });
  if (input.postingTime.status === "ready") insights.push({ kind: "timing", title: "Posting-time signal", message: `${input.postingTime.bestDay} ${input.postingTime.bestWindow} is the strongest available local-time window.`, evidence: { day: input.postingTime.bestDay, window: input.postingTime.bestWindow, sampleSize: input.postingTime.sampleSize }, confidence: input.postingTime.confidence });
  if (input.goal.metric && input.goal.topContributors.length > 0) insights.push({ kind: "goal", title: "Goal contribution", message: `The leading posts are contributing to the campaign ${input.goal.metric} target.`, evidence: { metric: input.goal.metric, coverage: input.goal.contributionCoverage, topPostId: input.goal.topContributors[0].postId }, confidence: input.dataQuality.confidence });
  return insights;
}

function dataQuality(postsToAssess: CampaignIntelligencePost[], now: Date): CampaignIntelligenceDataQuality {
  const tracked = postsToAssess.filter((post) => post.confidence !== "insufficient");
  const coverage = postsToAssess.length === 0 ? 0 : tracked.length / postsToAssess.length;
  const metricCoverage = average(postsToAssess.map((post) => post.dataQuality.coverage)) ?? 0;
  const newest = postsToAssess.map((post) => post.analyticsCollectedAt).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const fresh = freshness(newest, now);
  const sampleSize = postsToAssess.filter((post) => post.score !== null).length;
  const status: IntelligenceDataQualityStatus = sampleSize < 2 || tracked.length === 0 ? "insufficient" : coverage >= 0.8 && metricCoverage >= 0.75 && fresh === "fresh" && sampleSize >= 5 ? "high" : coverage >= 0.5 && sampleSize >= 3 ? "medium" : "low";
  const message = status === "insufficient" ? "Not enough comparable analytics to draw a content conclusion." : fresh === "stale" ? "Analytics may be outdated; refresh snapshots before making a decision." : `${tracked.length} of ${postsToAssess.length} posts have usable analytics.`;
  return { status, analyticsCoverage: rounded(coverage) ?? 0, metricCoverage: rounded(metricCoverage) ?? 0, sampleSize, freshestSnapshotAt: newest, freshness: fresh, confidence: status === "high" ? "high" : status === "medium" ? "medium" : status === "low" ? "low" : "insufficient", message };
}

function comparePosts(postsToCompare: CampaignIntelligencePost[], ids: string[]): CampaignIntelligenceComparison {
  const selected = ids.map((id) => postsToCompare.find((post) => post.postId === id)).filter((post): post is CampaignIntelligencePost => Boolean(post));
  if (selected.length < 2 || selected.some((post) => post.score === null)) return { status: "insufficient_data", posts: selected, winners: {} };
  const winners: CampaignIntelligenceComparison["winners"] = {};
  const metrics: Array<"score" | AnalyticsMetricKey | "engagement" | "engagementRate" | "goalContribution"> = ["score", ...INTELLIGENCE_METRICS, "engagement", "engagementRate", "goalContribution"];
  for (const metric of metrics) {
    const winner = [...selected].filter((post) => {
      const value = metric === "score" ? post.score : metric === "engagementRate" ? post.engagementRate.value : metric === "engagement" ? post.metrics.engagement : metric === "goalContribution" ? post.goalContribution : post.metrics[metric];
      return value !== null;
    }).sort((a, b) => {
      const value = (post: CampaignIntelligencePost) => metric === "score" ? post.score : metric === "engagementRate" ? post.engagementRate.value : metric === "engagement" ? post.metrics.engagement : metric === "goalContribution" ? post.goalContribution : post.metrics[metric];
      return value(b)! - value(a)! || a.postId.localeCompare(b.postId);
    })[0];
    if (winner) winners[metric] = winner.postId;
  }
  return { status: "ready", posts: selected, winners };
}

export function evaluateCampaignIntelligence(input: { campaignId: string; campaignName: string; timezone: string; posts: CampaignIntelligencePostInput[]; goalMetric: AnalyticsMetricKey | null; goalTarget: number | null; now?: Date; page?: number; pageSize?: number; sort?: "score" | "views" | "engagement" | "published"; comparisonIds?: string[]; inputFingerprint?: string; previous?: { performanceScore: number | null; momentum: CampaignIntelligenceMomentum; confidence: IntelligenceConfidence; goalProgress: number | null } | null; }): CampaignIntelligenceReport {
  const now = input.now ?? new Date();
  const prepared = input.posts.map((post) => preparedPost(post, input.goalMetric, input.goalTarget, now));
  scorePosts(prepared, input.goalMetric);
  const allPosts = prepared as CampaignIntelligencePost[];
  const postWithGoal = input.goalMetric ? allPosts.filter((post) => post.goalMetricValue !== null) : [];
  const goalContributors = topBy(postWithGoal, (post) => post.goalMetricValue);
  const goal: CampaignIntelligenceGoal = { metric: input.goalMetric, targetValue: input.goalTarget, currentValue: input.goalMetric ? (sumMetrics(allPosts.map((post) => post.metrics))[input.goalMetric]) : null, topContributors: goalContributors, contributionCoverage: input.goalMetric ? (postWithGoal.length / Math.max(1, allPosts.length)) : 0 };
  const platformPerformance = [...new Set(input.posts.flatMap((post) => post.platforms.map((target) => target.platform)))].map((platform) => groupPerformance(platform, allPosts.filter((post) => post.platforms.includes(platform))));
  const formatPerformance = [...new Set(allPosts.map((post) => post.format))].map((format) => groupPerformance(format, allPosts.filter((post) => post.format === format)));
  const quality = dataQuality(allPosts, now);
  const underperformers = allPosts.filter((post) => post.classification === "underperforming");
  const topPerformers = allPosts.filter((post) => post.classification === "top_performer");
  const posting = postingTime(allPosts, normalizeTimeZone(input.timezone));
  const recommendations = buildRecommendations({ posts: allPosts, platformPerformance, formatPerformance, postingTime: posting, dataQuality: quality, goal, underperformers });
  const insights = buildInsights({ dataQuality: quality, platformPerformance, formatPerformance, postingTime: posting, goal });
  const performanceScore = rounded(average(allPosts.map((post) => post.score)));
  const historicalTrend: CampaignIntelligenceHistoricalTrend = input.previous?.performanceScore === null || input.previous?.performanceScore === undefined || performanceScore === null
    ? "insufficient_data"
    : performanceScore - input.previous.performanceScore >= INTELLIGENCE_THRESHOLDS.historicalStableDelta
      ? "improving"
      : performanceScore - input.previous.performanceScore <= -INTELLIGENCE_THRESHOLDS.historicalStableDelta
        ? "declining"
        : "stable";
  const scoreDelta = input.previous?.performanceScore !== null && input.previous?.performanceScore !== undefined && performanceScore !== null
    ? performanceScore - input.previous.performanceScore
    : null;
  const momentum: CampaignIntelligenceMomentum = scoreDelta === null || quality.confidence === "insufficient"
    ? "unknown"
    : scoreDelta >= INTELLIGENCE_THRESHOLDS.momentumChangeDelta * 2 ? "accelerating"
      : scoreDelta >= INTELLIGENCE_THRESHOLDS.momentumChangeDelta ? "improving"
        : scoreDelta <= -INTELLIGENCE_THRESHOLDS.momentumChangeDelta * 2 ? "declining"
          : scoreDelta <= -INTELLIGENCE_THRESHOLDS.momentumChangeDelta ? "slowing"
            : "stable";
  const opportunities = buildOptimizationOpportunities(recommendations, now);
  const sort = input.sort ?? "score";
  const sortedPosts = [...allPosts].sort((a, b) => {
    if (sort === "published") return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
    const value = (post: CampaignIntelligencePost) => sort === "score" ? post.score : sort === "views" ? post.metrics.views : post.metrics.engagement;
    return (value(b) ?? -1) - (value(a) ?? -1) || a.postId.localeCompare(b.postId);
  });
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
  const start = (page - 1) * pageSize;
  const comparison = input.comparisonIds ? comparePosts(allPosts, input.comparisonIds) : null;
  const fingerprint = JSON.stringify({ top: topPerformers.map((post) => post.postId), underperformers: underperformers.map((post) => post.postId), recommendations: recommendations.map((recommendation) => recommendation.fingerprint), quality: quality.status, freshness: quality.freshness, momentum });
  return { campaignId: input.campaignId, campaignName: input.campaignName, timezone: normalizeTimeZone(input.timezone), generatedAt: now, dataQuality: quality, overview: { totalPosts: allPosts.length, publishedPosts: allPosts.filter((post) => post.status === "published" || post.status === "partial_failure").length, comparablePosts: allPosts.filter((post) => post.score !== null).length, averageScore: performanceScore, topPerformer: topPerformers[0] ?? null, underperformerCount: underperformers.length }, posts: { items: sortedPosts.slice(start, start + pageSize), page, pageSize, total: sortedPosts.length, totalPages: Math.max(1, Math.ceil(sortedPosts.length / pageSize)) }, rankings: { topPerformers: topPerformers.slice(0, 3), rising: allPosts.filter((post) => post.trend === "rising"), improving: allPosts.filter((post) => post.trend === "rising" && post.score !== null), declining: allPosts.filter((post) => post.trend === "declining"), underperformers, mostEngaging: topBy(allPosts, (post) => post.metrics.engagement), highestReach: topBy(allPosts, (post) => post.metrics.reach), highestViews: topBy(allPosts, (post) => post.metrics.views), goalContributors }, platformPerformance, formatPerformance, postingTime: posting, goal, insights, recommendations, opportunities, historicalTrend, momentum, comparison, fingerprint, inputFingerprint: input.inputFingerprint ?? fingerprint };
}

export type CampaignIntelligenceQuery = { page?: number; pageSize?: number; sort?: "score" | "views" | "engagement" | "published"; comparisonIds?: string[] };

type CampaignPostCursor = { createdAt: string; id: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeCampaignPostCursor(cursor: CampaignPostCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCampaignPostCursor(value: string): CampaignPostCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CampaignPostCursor>;
    if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) throw new Error("invalid");
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch {
    throw new AppError("validation_failed", "That campaign cursor is invalid.");
  }
}

type CampaignIntelligenceBatch = {
  inputs: CampaignIntelligencePostInput[];
  nextCursor: string | null;
};

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createIntelligenceInputFingerprint(input: {
  campaignId: string;
  campaignUpdatedAt: Date;
  goalMetric: AnalyticsMetricKey | null;
  goalTarget: number | null;
  posts: CampaignIntelligencePostInput[];
}): string {
  const normalized = input.posts.map((post) => ({
    id: post.postId,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    platforms: post.platforms.map((target) => ({
      id: target.postPlatformId,
      platform: target.platform,
      latest: target.history[0]?.collectedAt.toISOString() ?? null,
      latestStatus: target.history[0]?.status ?? null,
      historyCount: target.history.length,
    })),
  }));
  return `v${CAMPAIGN_INTELLIGENCE_EVALUATION_VERSION}:${stableHash(JSON.stringify({ campaignId: input.campaignId, campaignUpdatedAt: input.campaignUpdatedAt.toISOString(), goalMetric: input.goalMetric, goalTarget: input.goalTarget, posts: normalized }))}`;
}

async function fetchCampaignIntelligenceBatch(workspaceId: string, campaignId: string, cursor: CampaignPostCursor | null): Promise<CampaignIntelligenceBatch> {
  const conditions = [eq(posts.campaignId, campaignId), eq(posts.workspaceId, workspaceId)];
  if (cursor) {
    const createdAt = new Date(cursor.createdAt);
    conditions.push(or(gt(posts.createdAt, createdAt), and(eq(posts.createdAt, createdAt), gt(posts.id, cursor.id)))!);
  }
  const postRows = await db.select({ post: posts, mediaType: postMedia.mediaType, mediaPosition: postMedia.position }).from(posts).leftJoin(postMedia, eq(postMedia.postId, posts.id)).where(and(...conditions)).orderBy(asc(posts.createdAt), asc(posts.id), asc(postMedia.position)).limit(CAMPAIGN_INTELLIGENCE_BATCH_SIZE);
  const postIds = [...new Set(postRows.map((row) => row.post.id))];
  if (postIds.length === 0) return { inputs: [], nextCursor: null };
  const targetRows = await db.select({ target: postPlatforms }).from(postPlatforms).innerJoin(posts, eq(posts.id, postPlatforms.postId)).where(and(inArray(postPlatforms.postId, postIds), eq(posts.workspaceId, workspaceId)));
  const targetIds = targetRows.map((row) => row.target.id);
  const snapshotRows = targetIds.length === 0 ? [] : await db.select({ snapshot: postAnalyticsSnapshots }).from(postAnalyticsSnapshots).where(inArray(postAnalyticsSnapshots.postPlatformId, targetIds)).orderBy(desc(postAnalyticsSnapshots.collectedAt), desc(postAnalyticsSnapshots.createdAt));
  const history = new Map<string, CampaignIntelligenceSnapshot[]>();
  for (const row of snapshotRows) {
    const list = history.get(row.snapshot.postPlatformId) ?? [];
    list.push({ status: row.snapshot.status, metrics: row.snapshot, collectedAt: row.snapshot.collectedAt });
    history.set(row.snapshot.postPlatformId, list);
  }
  const media = new Map<string, "image" | "video">();
  const postsById = new Map<string, typeof postRows[number]["post"]>();
  for (const row of postRows) {
    postsById.set(row.post.id, row.post);
    if (row.mediaType && !media.has(row.post.id)) media.set(row.post.id, row.mediaType);
  }
  const inputs = postIds.map((postId) => {
    const post = postsById.get(postId)!;
    return { postId, status: post.status, platforms: targetRows.filter((target) => target.target.postId === postId).map((target) => ({ postPlatformId: target.target.id, platform: target.target.platform, history: history.get(target.target.id) ?? [] })), format: (media.get(postId) ?? "text") as CampaignIntelligencePostInput["format"], publishedAt: post.publishedAt, scheduledAt: post.scheduledAt, createdAt: post.createdAt };
  });
  const last = postRows[postRows.length - 1]?.post;
  const nextCursor = postRows.length === CAMPAIGN_INTELLIGENCE_BATCH_SIZE && last ? encodeCampaignPostCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
  return { inputs, nextCursor };
}

async function fetchCampaignIntelligenceData(workspaceId: string, campaignId: string) {
  const [campaignRow] = await db.select({ campaign: campaigns, timezone: workspaces.timezone }).from(campaigns).innerJoin(workspaces, eq(workspaces.id, campaigns.workspaceId)).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId))).limit(1);
  const campaign = campaignRow?.campaign;
  if (!campaign) return null;
  const inputs: CampaignIntelligencePostInput[] = [];
  let cursor: CampaignPostCursor | null = null;
  do {
    const batch = await fetchCampaignIntelligenceBatch(workspaceId, campaignId, cursor);
    inputs.push(...batch.inputs);
    cursor = batch.nextCursor ? decodeCampaignPostCursor(batch.nextCursor) : null;
  } while (cursor);
  return { campaign, timezone: campaignRow.timezone, posts: inputs };
}

export async function getCampaignIntelligenceForWorkspace(workspaceId: string, campaignId: string, query: CampaignIntelligenceQuery = {}): Promise<CampaignIntelligenceReport | null> {
  const data = await fetchCampaignIntelligenceData(workspaceId, campaignId);
  if (!data) return null;
  if (query.comparisonIds) {
    const postIds = new Set(data.posts.map((post) => post.postId));
    if (query.comparisonIds.length < 2 || query.comparisonIds.length > 3 || new Set(query.comparisonIds).size !== query.comparisonIds.length) throw new AppError("validation_failed", "Compare between two and three unique campaign posts.");
    if (query.comparisonIds.some((postId) => !postIds.has(postId))) throw new AppError("not_found", "One or more comparison posts do not belong to this campaign.");
  }
  const inputFingerprint = createIntelligenceInputFingerprint({ campaignId: data.campaign.id, campaignUpdatedAt: data.campaign.updatedAt, goalMetric: data.campaign.targetMetric, goalTarget: data.campaign.targetValue, posts: data.posts });
  return evaluateCampaignIntelligence({ campaignId: data.campaign.id, campaignName: data.campaign.name, timezone: data.timezone, posts: data.posts, goalMetric: data.campaign.targetMetric, goalTarget: data.campaign.targetValue, page: query.page, pageSize: query.pageSize, sort: query.sort, comparisonIds: query.comparisonIds, inputFingerprint });
}

export async function getCampaignIntelligence(userId: string, campaignId: string, query: CampaignIntelligenceQuery = {}): Promise<CampaignIntelligenceReport> {
  const context = await requireWorkspacePermission(userId, "campaigns:view");
  const report = await getCampaignIntelligenceForWorkspace(context.workspaceId, campaignId, query);
  if (!report) throw new AppError("not_found", "We couldn't find that campaign.");
  return { ...report, timezone: context.workspace.timezone };
}

export async function getCampaignPostIntelligence(userId: string, campaignId: string, postId: string): Promise<CampaignIntelligencePost | null> {
  const report = await getCampaignIntelligence(userId, campaignId, { page: 1, pageSize: 50 });
  return report.posts.items.find((post) => post.postId === postId) ?? null;
}
