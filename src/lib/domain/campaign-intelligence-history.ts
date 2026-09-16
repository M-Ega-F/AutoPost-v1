import "server-only";

import { and, desc, eq, gte, lte, lt, or } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { campaigns, campaignIntelligenceSnapshots, type CampaignIntelligenceSnapshot } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  buildOptimizationOpportunities,
  CAMPAIGN_INTELLIGENCE_EVALUATION_VERSION,
  CAMPAIGN_INTELLIGENCE_HISTORY_LIMIT,
  getCampaignIntelligenceForWorkspace,
  INTELLIGENCE_THRESHOLDS,
  type CampaignIntelligenceHistoricalTrend,
  type CampaignIntelligenceMomentum,
  type CampaignIntelligenceReport,
  type CampaignIntelligenceSnapshotReason,
  type CampaignIntelligenceEvaluationMode,
  type CampaignOptimizationOpportunity,
  type IntelligenceConfidence,
} from "@/lib/domain/campaign-intelligence";

export type CampaignIntelligenceSnapshotSummary = {
  id: string;
  campaignId: string;
  evaluationVersion: string;
  inputFingerprint: string;
  evaluationMode: CampaignIntelligenceEvaluationMode;
  snapshotReason: CampaignIntelligenceSnapshotReason;
  performanceScore: number | null;
  healthStatus: string | null;
  momentum: CampaignIntelligenceMomentum;
  historicalTrend: CampaignIntelligenceHistoricalTrend;
  freshness: string;
  confidence: IntelligenceConfidence;
  coverage: number;
  postCount: number;
  evaluatedPostCount: number;
  topPerformerCount: number;
  underperformingCount: number;
  risingCount: number;
  decliningCount: number;
  goalProgress: number | null;
  insights: Array<Record<string, unknown>>;
  recommendations: Array<Record<string, unknown>>;
  opportunities: CampaignOptimizationOpportunity[];
  createdAt: Date;
};

export type CampaignIntelligenceHistoryQuery = {
  limit?: number;
  cursor?: string;
  from?: Date;
  to?: Date;
};

export type CampaignIntelligenceHistory = {
  items: CampaignIntelligenceSnapshotSummary[];
  nextCursor: string | null;
  limit: number;
};

export type PersistedCampaignIntelligence = {
  created: boolean;
  snapshot: CampaignIntelligenceSnapshotSummary;
  report: CampaignIntelligenceReport;
};

export type CampaignEvaluationPriority = "urgent" | "high" | "normal" | "low";

export function scoreCampaignEvaluationPriority(input: {
  status: "draft" | "active";
  endAt: Date | null;
  lastEvaluatedAt: Date | null;
  freshness: string | null;
  now?: Date;
}): { priority: CampaignEvaluationPriority; score: number } {
  const now = input.now ?? new Date();
  const daysToDeadline = input.endAt ? (input.endAt.getTime() - now.getTime()) / 86_400_000 : null;
  const ageHours = input.lastEvaluatedAt ? Math.max(0, now.getTime() - input.lastEvaluatedAt.getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;
  const urgent = input.status === "active" && daysToDeadline !== null && daysToDeadline <= 3;
  const high = urgent || input.freshness === "stale" || (input.status === "active" && daysToDeadline !== null && daysToDeadline <= 7) || ageHours >= 24;
  const priority: CampaignEvaluationPriority = urgent ? "urgent" : high ? "high" : input.status === "active" ? "normal" : "low";
  const score = urgent ? 100 : high ? 75 : input.status === "active" ? 50 : 25;
  return { priority, score };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_HISTORY_RANGE_MS = 90 * 86_400_000;

function encodeSnapshotCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8").toString("base64url");
}

function decodeSnapshotCursor(value: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) throw new Error("invalid");
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new AppError("validation_failed", "That intelligence history cursor is invalid.");
  }
}

function safeArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function safeOpportunities(value: unknown): CampaignOptimizationOpportunity[] {
  return safeArray(value).filter((item): item is CampaignOptimizationOpportunity =>
    typeof item.type === "string" && typeof item.title === "string" && typeof item.reason === "string" && typeof item.fingerprint === "string",
  ).map((item) => ({
    type: item.type as CampaignOptimizationOpportunity["type"],
    priority: item.priority === "high" || item.priority === "medium" ? item.priority : "low",
    confidence: item.confidence === "high" || item.confidence === "medium" || item.confidence === "low" ? item.confidence : "insufficient",
    title: item.title,
    reason: item.reason,
    evidence: item.evidence && typeof item.evidence === "object" && !Array.isArray(item.evidence) ? item.evidence as CampaignOptimizationOpportunity["evidence"] : {},
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
    status: item.status === "historical" ? "historical" : "active",
    fingerprint: item.fingerprint,
  }));
}

function toSummary(row: CampaignIntelligenceSnapshot): CampaignIntelligenceSnapshotSummary {
  return {
    id: row.id,
    campaignId: row.campaignId,
    evaluationVersion: row.evaluationVersion,
    inputFingerprint: row.inputFingerprint,
    evaluationMode: row.evaluationMode === "full" ? "full" : "incremental",
    snapshotReason: row.snapshotReason as CampaignIntelligenceSnapshotReason,
    performanceScore: row.performanceScore,
    healthStatus: row.healthStatus,
    momentum: row.momentum as CampaignIntelligenceMomentum,
    historicalTrend: row.historicalTrend as CampaignIntelligenceHistoricalTrend,
    freshness: row.freshness,
    confidence: row.confidence as IntelligenceConfidence,
    coverage: row.coverage,
    postCount: row.postCount,
    evaluatedPostCount: row.evaluatedPostCount,
    topPerformerCount: row.topPerformerCount,
    underperformingCount: row.underperformingCount,
    risingCount: row.risingCount,
    decliningCount: row.decliningCount,
    goalProgress: row.goalProgress,
    insights: safeArray(row.insights),
    recommendations: safeArray(row.recommendations),
    opportunities: safeOpportunities(row.opportunities),
    createdAt: row.createdAt,
  };
}

function historicalTrend(currentScore: number | null, previousScore: number | null): CampaignIntelligenceHistoricalTrend {
  if (currentScore === null || previousScore === null) return "insufficient_data";
  const delta = currentScore - previousScore;
  if (delta >= INTELLIGENCE_THRESHOLDS.historicalStableDelta) return "improving";
  if (delta <= -INTELLIGENCE_THRESHOLDS.historicalStableDelta) return "declining";
  return "stable";
}

function momentum(current: CampaignIntelligenceReport, previous: CampaignIntelligenceSnapshotSummary | null): CampaignIntelligenceMomentum {
  if (!previous || current.overview.averageScore === null || previous.performanceScore === null || current.dataQuality.confidence === "insufficient") return "unknown";
  const delta = current.overview.averageScore - previous.performanceScore;
  if (delta >= INTELLIGENCE_THRESHOLDS.momentumChangeDelta * 2) return "accelerating";
  if (delta >= INTELLIGENCE_THRESHOLDS.momentumChangeDelta) return "improving";
  if (delta <= -INTELLIGENCE_THRESHOLDS.momentumChangeDelta * 2) return "declining";
  if (delta <= -INTELLIGENCE_THRESHOLDS.momentumChangeDelta) return "slowing";
  return "stable";
}

function previousSnapshotFor(input: { workspaceId: string; campaignId: string }): Promise<CampaignIntelligenceSnapshot | null> {
  return db.select().from(campaignIntelligenceSnapshots).where(and(eq(campaignIntelligenceSnapshots.workspaceId, input.workspaceId), eq(campaignIntelligenceSnapshots.campaignId, input.campaignId))).orderBy(desc(campaignIntelligenceSnapshots.createdAt), desc(campaignIntelligenceSnapshots.id)).limit(1).then((rows) => rows[0] ?? null);
}

export async function getLatestCampaignIntelligenceSnapshotForWorkspace(workspaceId: string, campaignId: string): Promise<CampaignIntelligenceSnapshotSummary | null> {
  const row = await previousSnapshotFor({ workspaceId, campaignId });
  return row ? toSummary(row) : null;
}

export async function persistCampaignIntelligenceEvaluation(input: {
  workspaceId: string;
  campaignId: string;
  report: CampaignIntelligenceReport;
  mode: CampaignIntelligenceEvaluationMode;
  reason: CampaignIntelligenceSnapshotReason;
  healthStatus?: string | null;
}): Promise<PersistedCampaignIntelligence> {
  const previousRow = await previousSnapshotFor(input);
  const previous = previousRow ? toSummary(previousRow) : null;
  const historical = historicalTrend(input.report.overview.averageScore, previous?.performanceScore ?? null);
  const currentMomentum = momentum(input.report, previous);
  const report = {
    ...input.report,
    historicalTrend: historical,
    momentum: currentMomentum,
    opportunities: buildOptimizationOpportunities(input.report.recommendations, input.report.generatedAt),
  } satisfies CampaignIntelligenceReport;
  if (input.mode === "incremental" && previous?.inputFingerprint === report.inputFingerprint) {
    return { created: false, snapshot: previous, report };
  }
  const [created] = await db.insert(campaignIntelligenceSnapshots).values({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    evaluationVersion: CAMPAIGN_INTELLIGENCE_EVALUATION_VERSION,
    inputFingerprint: report.inputFingerprint,
    evaluationMode: input.mode,
    snapshotReason: input.reason,
    performanceScore: report.overview.averageScore,
    healthStatus: input.healthStatus ?? null,
    momentum: report.momentum,
    historicalTrend: report.historicalTrend,
    freshness: report.dataQuality.freshness,
    confidence: report.dataQuality.confidence,
    coverage: Math.round(report.dataQuality.analyticsCoverage * 100),
    postCount: report.overview.totalPosts,
    evaluatedPostCount: report.overview.comparablePosts,
    topPerformerCount: report.rankings.topPerformers.length,
    underperformingCount: report.rankings.underperformers.length,
    risingCount: report.rankings.rising.length,
    decliningCount: report.rankings.declining.length,
    goalProgress: report.goal.targetValue && report.goal.currentValue !== null ? Math.round(Math.min(100, (report.goal.currentValue / report.goal.targetValue) * 100)) : null,
    insights: report.insights as unknown as Array<Record<string, unknown>>,
    recommendations: report.recommendations as unknown as Array<Record<string, unknown>>,
    opportunities: report.opportunities as unknown as Array<Record<string, unknown>>,
  }).onConflictDoNothing({ target: [campaignIntelligenceSnapshots.workspaceId, campaignIntelligenceSnapshots.campaignId, campaignIntelligenceSnapshots.inputFingerprint] }).returning();
  const row = created ?? await previousSnapshotFor(input);
  if (!row) throw new AppError("server_error", "We couldn't save campaign intelligence history.");
  return { created: Boolean(created), snapshot: toSummary(row), report };
}

export function compareCampaignIntelligenceSnapshots(current: CampaignIntelligenceSnapshotSummary, previous: CampaignIntelligenceSnapshotSummary | null): { trend: CampaignIntelligenceHistoricalTrend; scoreDelta: number | null; momentumChanged: boolean } {
  return {
    trend: historicalTrend(current.performanceScore, previous?.performanceScore ?? null),
    scoreDelta: previous && current.performanceScore !== null && previous.performanceScore !== null ? current.performanceScore - previous.performanceScore : null,
    momentumChanged: Boolean(previous && previous.momentum !== current.momentum),
  };
}

export async function listCampaignIntelligenceHistory(userId: string, campaignId: string, query: CampaignIntelligenceHistoryQuery = {}): Promise<CampaignIntelligenceHistory> {
  const context = await requireWorkspacePermission(userId, "campaigns:view");
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, context.workspaceId))).limit(1);
  if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");
  const limit = Math.min(CAMPAIGN_INTELLIGENCE_HISTORY_LIMIT, Math.max(1, Math.floor(query.limit ?? 20)));
  if (query.from && query.to && query.from > query.to) throw new AppError("validation_failed", "The intelligence history range is invalid.");
  if (query.from && query.to && query.to.getTime() - query.from.getTime() > MAX_HISTORY_RANGE_MS) throw new AppError("validation_failed", "Intelligence history is limited to a 90-day range.");
  const conditions = [eq(campaignIntelligenceSnapshots.workspaceId, context.workspaceId), eq(campaignIntelligenceSnapshots.campaignId, campaignId)];
  if (query.from) conditions.push(gte(campaignIntelligenceSnapshots.createdAt, query.from));
  if (query.to) conditions.push(lte(campaignIntelligenceSnapshots.createdAt, query.to));
  if (query.cursor) {
    const cursor = decodeSnapshotCursor(query.cursor);
    conditions.push(or(lt(campaignIntelligenceSnapshots.createdAt, cursor.createdAt), and(eq(campaignIntelligenceSnapshots.createdAt, cursor.createdAt), lt(campaignIntelligenceSnapshots.id, cursor.id)))!);
  }
  const rows = await db.select().from(campaignIntelligenceSnapshots).where(and(...conditions)).orderBy(desc(campaignIntelligenceSnapshots.createdAt), desc(campaignIntelligenceSnapshots.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { items: page.map(toSummary), nextCursor: rows.length > limit ? encodeSnapshotCursor(page[page.length - 1].createdAt, page[page.length - 1].id) : null, limit };
}

export async function getCampaignOptimizationOpportunities(userId: string, campaignId: string): Promise<{ items: CampaignOptimizationOpportunity[]; snapshotId: string | null; generatedAt: Date | null }> {
  const context = await requireWorkspacePermission(userId, "campaigns:view");
  const latest = await getLatestCampaignIntelligenceSnapshotForWorkspace(context.workspaceId, campaignId);
  if (latest) return { items: latest.opportunities.filter((opportunity) => opportunity.status === "active"), snapshotId: latest.id, generatedAt: latest.createdAt };
  const report = await getCampaignIntelligenceForWorkspace(context.workspaceId, campaignId);
  if (!report) throw new AppError("not_found", "We couldn't find that campaign.");
  return { items: buildOptimizationOpportunities(report.recommendations, report.generatedAt), snapshotId: null, generatedAt: report.generatedAt };
}

export function recommendationHistory(current: CampaignIntelligenceSnapshotSummary, previous: CampaignIntelligenceSnapshotSummary | null): Array<Record<string, unknown>> {
  const currentRecommendations = safeArray(current.recommendations);
  const previousRecommendations = previous ? safeArray(previous.recommendations) : [];
  const currentFingerprints = new Set(currentRecommendations.map((item) => typeof item.fingerprint === "string" ? item.fingerprint : "").filter(Boolean));
  const items = currentRecommendations.map((item) => ({ ...item, status: previousRecommendations.some((previousItem) => previousItem.fingerprint === item.fingerprint) ? "persisted" : "appeared" }));
  for (const item of previousRecommendations) {
    if (typeof item.fingerprint !== "string" || currentFingerprints.has(item.fingerprint)) continue;
    items.push({ ...item, status: "historical" });
  }
  return items;
}
