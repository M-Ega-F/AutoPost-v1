import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import {
  postIntelligenceSummaries,
  postPlatforms,
  posts,
  campaigns,
  type PostIntelligenceSummary,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  getCampaignPostIntelligence,
  type CampaignIntelligencePost,
  type IntelligenceClassification,
  type IntelligenceConfidence,
  type IntelligenceFreshness,
  type CampaignIntelligenceMomentum,
  type IntelligenceTrend,
} from "@/lib/domain/campaign-intelligence";
import type { Platform } from "@/lib/status";

export const POST_INTELLIGENCE_ALGORITHM_VERSION = "17f-v1";
export const POST_INTELLIGENCE_PAGE_LIMIT = 20;
export const POST_INTELLIGENCE_MAX_PAGE_LIMIT = 100;

export type PostIntelligenceRankingType = "performance" | "engagement" | "reach" | "views" | "goal_contribution";
export type PostIntelligenceSummaryState = "fresh" | "stale" | "evaluating" | "failed";

export type PostIntelligenceSummaryView = {
  id: string;
  workspaceId: string;
  campaignId: string;
  postId: string;
  format: "image" | "video" | "text";
  algorithmVersion: string;
  performanceScore: number | null;
  engagementScore: number | null;
  reachScore: number | null;
  viewsScore: number | null;
  goalContribution: number | null;
  trend: IntelligenceTrend;
  momentum: CampaignIntelligenceMomentum;
  classification: IntelligenceClassification;
  confidence: IntelligenceConfidence;
  freshness: IntelligenceFreshness;
  state: PostIntelligenceSummaryState;
  isUnderperforming: boolean;
  analyticsCoverage: number;
  sampleSize: number;
  inputFingerprint: string;
  evaluatedAt: Date;
  updatedAt: Date;
  platforms: Platform[];
};

export type PostIntelligenceRanking = {
  items: PostIntelligenceSummaryView[];
  nextCursor: string | null;
  hasMore: boolean;
  algorithmVersion: string;
  dataFreshness: "fresh" | "aging" | "stale" | "unavailable";
  evaluatedAt: Date | null;
};

export function summaryToCampaignIntelligencePost(summary: PostIntelligenceSummaryView): CampaignIntelligencePost {
  return {
    postId: summary.postId,
    status: "published",
    platforms: summary.platforms,
    format: summary.format,
    publishedAt: summary.evaluatedAt,
    scheduledAt: null,
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null, reach: null, impressions: null, engagement: null },
    engagementRate: { value: null, source: null },
    score: summary.performanceScore,
    confidence: summary.confidence,
    trend: summary.trend,
    classification: summary.classification,
    rank: null,
    goalContribution: summary.goalContribution,
    goalMetricValue: null,
    analyticsCollectedAt: summary.evaluatedAt,
    dataQuality: { coverage: summary.analyticsCoverage / 100, sampleSize: summary.sampleSize, freshness: summary.freshness },
    observation: "ready",
  };
}

type RankingCursor = {
  type: PostIntelligenceRankingType;
  value: number | null;
  postId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodePostIntelligenceCursor(cursor: RankingCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePostIntelligenceCursor(value: string): RankingCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<RankingCursor>;
    if (!parsed.type || !["performance", "engagement", "reach", "views", "goal_contribution"].includes(parsed.type)) throw new Error("type");
    if (parsed.value !== null && (typeof parsed.value !== "number" || !Number.isFinite(parsed.value))) throw new Error("value");
    if (typeof parsed.postId !== "string" || !UUID_PATTERN.test(parsed.postId)) throw new Error("post");
    return { type: parsed.type, value: parsed.value ?? null, postId: parsed.postId };
  } catch {
    throw new AppError("validation_failed", "That post intelligence cursor is invalid.");
  }
}

export function isPostIntelligenceSummaryFresh(summary: Pick<PostIntelligenceSummary, "algorithmVersion" | "state">): boolean {
  return summary.algorithmVersion === POST_INTELLIGENCE_ALGORITHM_VERSION && summary.state === "fresh";
}

function metricScore(value: number | null, maximum: number): number | null {
  if (value === null || maximum <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, (value / maximum) * 100)));
}

function momentumForTrend(trend: IntelligenceTrend): CampaignIntelligenceMomentum {
  return trend === "rising" ? "improving" : trend === "declining" ? "slowing" : trend === "stable" ? "stable" : "unknown";
}

function postFingerprint(post: CampaignIntelligencePost): string {
  return createHash("sha256").update(JSON.stringify({
    postId: post.postId,
    status: post.status,
    platforms: post.platforms,
    format: post.format,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    metrics: post.metrics,
    trend: post.trend,
    score: post.score,
    goalContribution: post.goalContribution,
    analyticsCollectedAt: post.analyticsCollectedAt?.toISOString() ?? null,
    algorithmVersion: POST_INTELLIGENCE_ALGORITHM_VERSION,
  })).digest("hex");
}

function toView(row: PostIntelligenceSummary, platforms: Platform[] = []): PostIntelligenceSummaryView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    campaignId: row.campaignId,
    postId: row.postId,
    format: row.format as PostIntelligenceSummaryView["format"],
    algorithmVersion: row.algorithmVersion,
    performanceScore: row.performanceScore,
    engagementScore: row.engagementScore,
    reachScore: row.reachScore,
    viewsScore: row.viewsScore,
    goalContribution: row.goalContribution,
    trend: row.trend as IntelligenceTrend,
    momentum: row.momentum as CampaignIntelligenceMomentum,
    classification: row.classification as IntelligenceClassification,
    confidence: row.confidence as IntelligenceConfidence,
    freshness: row.freshness as IntelligenceFreshness,
    state: row.state as PostIntelligenceSummaryState,
    isUnderperforming: row.isUnderperforming,
    analyticsCoverage: row.analyticsCoverage,
    sampleSize: row.sampleSize,
    inputFingerprint: row.inputFingerprint,
    evaluatedAt: row.evaluatedAt,
    updatedAt: row.updatedAt,
    platforms,
  };
}

export async function getPostIntelligenceSummaryForWorkspace(workspaceId: string, campaignId: string, postId: string): Promise<PostIntelligenceSummaryView | null> {
  const [row] = await db.select().from(postIntelligenceSummaries).where(and(
    eq(postIntelligenceSummaries.workspaceId, workspaceId),
    eq(postIntelligenceSummaries.campaignId, campaignId),
    eq(postIntelligenceSummaries.postId, postId),
  )).limit(1);
  if (!row) return null;
  const platformRows = await db.select({ platform: postPlatforms.platform }).from(postPlatforms).where(eq(postPlatforms.postId, postId));
  return toView(row, platformRows.map((item) => item.platform));
}

export async function getPostIntelligenceSummary(userId: string, campaignId: string, postId: string, workspaceId?: string): Promise<PostIntelligenceSummaryView | null> {
  const context = await requireWorkspacePermission(userId, "campaigns:view", workspaceId);
  return getPostIntelligenceSummaryForWorkspace(context.workspaceId, campaignId, postId);
}

export async function markPostIntelligenceStale(input: { workspaceId: string; campaignId: string; postId: string; reason?: string }): Promise<void> {
  await db.update(postIntelligenceSummaries).set({ state: "stale", updatedAt: new Date() }).where(and(
    eq(postIntelligenceSummaries.workspaceId, input.workspaceId),
    eq(postIntelligenceSummaries.campaignId, input.campaignId),
    eq(postIntelligenceSummaries.postId, input.postId),
  ));
  void input.reason;
}

export async function persistPostIntelligenceSummaries(input: { workspaceId: string; campaignId: string; posts: CampaignIntelligencePost[]; evaluatedAt?: Date }): Promise<number> {
  if (input.posts.length === 0) return 0;
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const maxima = {
    engagement: Math.max(0, ...input.posts.map((post) => post.metrics.engagement ?? 0)),
    reach: Math.max(0, ...input.posts.map((post) => post.metrics.reach ?? 0)),
    views: Math.max(0, ...input.posts.map((post) => post.metrics.views ?? 0)),
  };
  let updated = 0;
  for (const post of input.posts) {
    const values = {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      postId: post.postId,
      format: post.format,
      algorithmVersion: POST_INTELLIGENCE_ALGORITHM_VERSION,
      performanceScore: post.score,
      engagementScore: metricScore(post.metrics.engagement, maxima.engagement),
      reachScore: metricScore(post.metrics.reach, maxima.reach),
      viewsScore: metricScore(post.metrics.views, maxima.views),
      goalContribution: post.goalContribution,
      trend: post.trend,
      momentum: momentumForTrend(post.trend),
      classification: post.classification,
      confidence: post.confidence,
      freshness: post.dataQuality.freshness,
      state: "fresh" as const,
      isUnderperforming: post.classification === "underperforming",
      analyticsCoverage: Math.round(post.dataQuality.coverage * 100),
      sampleSize: post.dataQuality.sampleSize,
      inputFingerprint: postFingerprint(post),
      evaluatedAt,
      updatedAt: new Date(),
    };
    await db.insert(postIntelligenceSummaries).values(values).onConflictDoUpdate({
      target: [postIntelligenceSummaries.workspaceId, postIntelligenceSummaries.campaignId, postIntelligenceSummaries.postId],
      set: values,
      setWhere: sql`${postIntelligenceSummaries.evaluatedAt} <= excluded.evaluated_at`,
    });
    updated += 1;
  }
  return updated;
}

const rankingColumn = {
  performance: postIntelligenceSummaries.performanceScore,
  engagement: postIntelligenceSummaries.engagementScore,
  reach: postIntelligenceSummaries.reachScore,
  views: postIntelligenceSummaries.viewsScore,
  goal_contribution: postIntelligenceSummaries.goalContribution,
} as const;

function rankingValue(row: PostIntelligenceSummary, type: PostIntelligenceRankingType): number | null {
  return type === "performance" ? row.performanceScore : type === "engagement" ? row.engagementScore : type === "reach" ? row.reachScore : type === "views" ? row.viewsScore : row.goalContribution;
}

export async function listPostIntelligenceRankings(userId: string, campaignId: string, input: {
  type?: PostIntelligenceRankingType;
  cursor?: string;
  limit?: number;
  platform?: Platform;
  format?: "image" | "video" | "text";
  trend?: IntelligenceTrend;
  momentum?: CampaignIntelligenceMomentum;
  confidence?: IntelligenceConfidence;
  minimumConfidence?: IntelligenceConfidence;
  underperforming?: boolean;
} = {}): Promise<PostIntelligenceRanking> {
  const context = await requireWorkspacePermission(userId, "campaigns:view");
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, context.workspaceId))).limit(1);
  if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");
  const type = input.type ?? "performance";
  const limit = Math.min(POST_INTELLIGENCE_MAX_PAGE_LIMIT, Math.max(1, Math.floor(input.limit ?? POST_INTELLIGENCE_PAGE_LIMIT)));
  const column = rankingColumn[type];
  const conditions = [
    eq(postIntelligenceSummaries.workspaceId, context.workspaceId),
    eq(postIntelligenceSummaries.campaignId, campaignId),
    eq(postIntelligenceSummaries.algorithmVersion, POST_INTELLIGENCE_ALGORITHM_VERSION),
  ];
  if (input.format) conditions.push(eq(postIntelligenceSummaries.format, input.format));
  if (input.trend) conditions.push(eq(postIntelligenceSummaries.trend, input.trend));
  if (input.momentum) conditions.push(eq(postIntelligenceSummaries.momentum, input.momentum));
  if (input.confidence) conditions.push(eq(postIntelligenceSummaries.confidence, input.confidence));
  if (input.minimumConfidence) {
    const allowed = input.minimumConfidence === "high" ? ["high"] : input.minimumConfidence === "medium" ? ["high", "medium"] : input.minimumConfidence === "low" ? ["high", "medium", "low"] : ["high", "medium", "low", "insufficient"];
    conditions.push(inArray(postIntelligenceSummaries.confidence, allowed));
  }
  if (input.underperforming !== undefined) conditions.push(eq(postIntelligenceSummaries.isUnderperforming, input.underperforming));
  if (input.platform) conditions.push(sql`exists (select 1 from ${postPlatforms} pp where pp.post_id = ${postIntelligenceSummaries.postId} and pp.platform = ${input.platform})`);
  if (input.cursor) {
    const cursor = decodePostIntelligenceCursor(input.cursor);
    if (cursor.type !== type) throw new AppError("validation_failed", "That cursor belongs to a different ranking.");
    conditions.push(cursor.value === null
      ? and(isNull(column), gt(postIntelligenceSummaries.postId, cursor.postId))!
      : or(isNull(column), lt(column, cursor.value), and(eq(column, cursor.value), gt(postIntelligenceSummaries.postId, cursor.postId)))!);
  }
  const rows = await db.select().from(postIntelligenceSummaries).where(and(...conditions)).orderBy(sql`${column} desc nulls last`, asc(postIntelligenceSummaries.postId)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const platformRows = page.length === 0 ? [] : await db.select({ postId: postPlatforms.postId, platform: postPlatforms.platform }).from(postPlatforms).where(inArray(postPlatforms.postId, page.map((row) => row.postId)));
  const platforms = new Map<string, Platform[]>();
  for (const row of platformRows) platforms.set(row.postId, [...(platforms.get(row.postId) ?? []), row.platform]);
  const items = page.map((row) => toView(row, platforms.get(row.postId) ?? []));
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodePostIntelligenceCursor({ type, value: rankingValue(last, type), postId: last.postId }) : null;
  const freshness = items.some((item) => item.freshness === "fresh") ? "fresh" : items.some((item) => item.freshness === "aging") ? "aging" : items.length ? "stale" : "unavailable";
  const evaluatedAt = items.reduce<Date | null>((latest, item) => !latest || item.evaluatedAt > latest ? item.evaluatedAt : latest, null);
  return { items, nextCursor, hasMore, algorithmVersion: POST_INTELLIGENCE_ALGORITHM_VERSION, dataFreshness: freshness, evaluatedAt };
}

export async function evaluateAndPersistPostIntelligence(input: { userId: string; campaignId: string; postId: string }): Promise<PostIntelligenceSummaryView | null> {
  await requireWorkspacePermission(input.userId, "campaigns:update");
  const post = await getCampaignPostIntelligence(input.userId, input.campaignId, input.postId);
  if (!post) return null;
  const context = await requireWorkspacePermission(input.userId, "campaigns:view");
  await persistPostIntelligenceSummaries({ workspaceId: context.workspaceId, campaignId: input.campaignId, posts: [post] });
  return getPostIntelligenceSummaryForWorkspace(context.workspaceId, input.campaignId, input.postId);
}

export async function postBelongsToCampaign(workspaceId: string, campaignId: string, postId: string): Promise<boolean> {
  const [row] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, postId), eq(posts.campaignId, campaignId), eq(posts.workspaceId, workspaceId))).limit(1);
  return Boolean(row);
}
