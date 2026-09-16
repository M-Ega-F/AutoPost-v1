import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { campaignAutomationEvents, campaignIntelligenceSnapshots, campaigns } from "@/lib/db/schema";
import { getCampaignForWorkspace } from "@/lib/domain/campaigns";
import { recordCampaignActivity } from "@/lib/domain/campaign-activity";
import { getCampaignIntelligenceForWorkspace, type CampaignIntelligenceEvaluationMode, type CampaignIntelligenceSnapshotReason } from "@/lib/domain/campaign-intelligence";
import { persistCampaignIntelligenceEvaluation, scoreCampaignEvaluationPriority } from "@/lib/domain/campaign-intelligence-history";
import { notifyCampaignAutomationEvent, notifyCampaignIntelligenceEvent } from "@/lib/domain/notifications";
import { logger } from "@/lib/logger";
import { persistPostIntelligenceSummaries } from "@/lib/domain/post-intelligence";
import { evaluateRunningExperimentsForWorkspace } from "@/lib/domain/experiments";
import type { CampaignAutomationTrigger } from "@/lib/queue/campaign-automation";

const GOAL_MILESTONES = [25, 50, 75] as const;
const DAY_MS = 86_400_000;

export type CampaignAutomationRun = {
  campaignId: string;
  trigger?: CampaignAutomationTrigger;
  evaluated: boolean;
  claimedEvents: number;
  skippedEvents: number;
  failedEvents: number;
};

async function claimOneTimeEvent(input: {
  workspaceId: string;
  campaignId: string;
  eventType: "goal_milestone" | "goal_completed" | "deadline_warning" | "deadline_overdue";
  eventKey: string;
  state: string;
  milestone?: number;
  metadata: Record<string, unknown>;
}): Promise<{ id: string } | null> {
  const [event] = await db
    .insert(campaignAutomationEvents)
    .values(input)
    .onConflictDoNothing({ target: [campaignAutomationEvents.workspaceId, campaignAutomationEvents.eventKey] })
    .returning({ id: campaignAutomationEvents.id });
  return event ?? null;
}

async function claimStateEvent(input: {
  workspaceId: string;
  campaignId: string;
  eventType: "health_changed" | "publishing_issue" | "approval_bottleneck" | "intelligence_updated" | "content_underperforming" | "recommendation_created";
  eventKey: string;
  state: string;
  metadata: Record<string, unknown>;
}): Promise<{ id: string; previousState: string | null } | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: campaignAutomationEvents.id, state: campaignAutomationEvents.state })
      .from(campaignAutomationEvents)
      .where(and(eq(campaignAutomationEvents.workspaceId, input.workspaceId), eq(campaignAutomationEvents.eventKey, input.eventKey)))
      .limit(1);
    if (existing?.state === input.state) return null;
    if (existing) {
      const [updated] = await tx
        .update(campaignAutomationEvents)
        .set({ state: input.state, metadata: input.metadata, updatedAt: new Date() })
        .where(and(eq(campaignAutomationEvents.id, existing.id), eq(campaignAutomationEvents.state, existing.state)))
        .returning({ id: campaignAutomationEvents.id });
      return updated ? { id: updated.id, previousState: existing.state } : null;
    }
    const [created] = await tx
      .insert(campaignAutomationEvents)
      .values(input)
      .onConflictDoNothing({ target: [campaignAutomationEvents.workspaceId, campaignAutomationEvents.eventKey] })
      .returning({ id: campaignAutomationEvents.id });
    return created ? { id: created.id, previousState: null } : null;
  });
}

function daysRemaining(endAt: Date | null, now: Date): number | null {
  return endAt ? Math.ceil((endAt.getTime() - now.getTime()) / DAY_MS) : null;
}

async function emitClaimedEvent(input: {
  workspaceId: string;
  campaignId: string;
  eventId: string;
  eventKey: string;
  activityType: "goal_milestone" | "goal_completed" | "health_changed" | "deadline_warning" | "deadline_overdue" | "publishing_issue" | "approval_bottleneck" | "intelligence_updated" | "content_underperforming" | "recommendation_created";
  notification?: Parameters<typeof notifyCampaignAutomationEvent>[0] | Parameters<typeof notifyCampaignIntelligenceEvent>[0];
  metadata: Record<string, unknown>;
}): Promise<void> {
  await recordCampaignActivity({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    type: input.activityType,
    metadata: input.metadata,
    dedupeKey: input.eventKey,
  });
  if (input.notification) {
    if (input.notification.event === "intelligence_updated" || input.notification.event === "content_underperforming" || input.notification.event === "recommendation_created") await notifyCampaignIntelligenceEvent({ ...input.notification, eventKey: input.eventKey } as Parameters<typeof notifyCampaignIntelligenceEvent>[0]);
    else await notifyCampaignAutomationEvent({ ...input.notification, eventKey: input.eventKey } as Parameters<typeof notifyCampaignAutomationEvent>[0]);
  }
  void input.eventId;
}

export async function evaluateCampaignAutomation(input: {
  workspaceId: string;
  campaignId: string;
  trigger?: CampaignAutomationTrigger;
  evaluationMode?: CampaignIntelligenceEvaluationMode;
  reason?: CampaignIntelligenceSnapshotReason;
  now?: Date;
}): Promise<CampaignAutomationRun> {
  const now = input.now ?? new Date();
  const detail = await getCampaignForWorkspace(input.workspaceId, input.campaignId);
  const result: CampaignAutomationRun = { campaignId: input.campaignId, trigger: input.trigger, evaluated: Boolean(detail), claimedEvents: 0, skippedEvents: 0, failedEvents: 0 };
  if (!detail || detail.status === "archived") return result;

  const claims: Array<() => Promise<void>> = [];
  const metadataBase = { campaignId: detail.id, metric: detail.goal.metric, targetValue: detail.goal.targetValue, currentValue: detail.goal.currentValue, progressPercent: detail.goal.progressPercent };
  for (const milestone of GOAL_MILESTONES) {
    if (!detail.goal.reachedMilestones.includes(milestone)) continue;
    claims.push(async () => {
      const eventKey = `campaign:${detail.id}:goal:${milestone}`;
      const event = await claimOneTimeEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "goal_milestone", eventKey, state: "reached", milestone, metadata: metadataBase });
      if (!event) { result.skippedEvents += 1; return; }
      result.claimedEvents += 1;
      await emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: event.id, eventKey, activityType: "goal_milestone", metadata: { ...metadataBase, milestone }, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "goal_milestone", state: "reached", metric: detail.goal.metric, targetValue: detail.goal.targetValue, currentValue: detail.goal.currentValue, progressPercent: detail.goal.progressPercent, milestone } });
    });
  }
  if (detail.goal.status === "completed") {
    claims.push(async () => {
      const eventKey = `campaign:${detail.id}:goal:completed`;
      const event = await claimOneTimeEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "goal_completed", eventKey, state: "completed", milestone: 100, metadata: metadataBase });
      if (!event) { result.skippedEvents += 1; return; }
      result.claimedEvents += 1;
      await emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: event.id, eventKey, activityType: "goal_completed", metadata: metadataBase, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "goal_completed", state: "completed", metric: detail.goal.metric, targetValue: detail.goal.targetValue, currentValue: detail.goal.currentValue, progressPercent: detail.goal.progressPercent, milestone: 100 } });
    });
  }

  const remainingDays = daysRemaining(detail.endAt, now);
  if (detail.status !== "completed" && detail.progress.relevantPosts - detail.progress.publishedPosts > 0 && remainingDays !== null) {
    const warning = remainingDays <= 1 ? 1 : remainingDays <= 3 ? 3 : remainingDays <= 7 ? 7 : null;
    if (warning !== null && remainingDays >= 0) claims.push(async () => {
      const eventKey = `campaign:${detail.id}:deadline:${warning}d`;
      const event = await claimOneTimeEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "deadline_warning", eventKey, state: `${warning}d`, metadata: { campaignId: detail.id, daysRemaining: remainingDays } });
      if (!event) { result.skippedEvents += 1; return; }
      result.claimedEvents += 1;
      await emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: event.id, eventKey, activityType: "deadline_warning", metadata: { daysRemaining: remainingDays }, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "deadline_warning", state: `${warning}d`, daysRemaining: remainingDays } });
    });
    if (remainingDays < 0) claims.push(async () => {
      const eventKey = `campaign:${detail.id}:deadline:overdue`;
      const event = await claimOneTimeEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "deadline_overdue", eventKey, state: "overdue", metadata: { campaignId: detail.id, daysRemaining: remainingDays } });
      if (!event) { result.skippedEvents += 1; return; }
      result.claimedEvents += 1;
      await emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: event.id, eventKey, activityType: "deadline_overdue", metadata: { daysRemaining: remainingDays }, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "deadline_overdue", state: "overdue", daysRemaining: remainingDays } });
    });
  }

  const healthState = await claimStateEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "health_changed", eventKey: `campaign:${detail.id}:health`, state: detail.health.status, metadata: { campaignId: detail.id, state: detail.health.status } });
  if (healthState) {
    result.claimedEvents += 1;
    claims.push(async () => emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: healthState.id, eventKey: `campaign:${detail.id}:health:${detail.health.status}`, activityType: "health_changed", metadata: { state: detail.health.status }, notification: detail.health.status === "healthy" || detail.health.status === "completed" ? undefined : { workspaceId: detail.workspaceId, campaignId: detail.id, event: "health_changed", state: detail.health.status } }));
  }

  if (detail.progress.failedPosts + detail.progress.partialFailurePosts > 0) {
    const state = `${detail.progress.failedPosts}:${detail.progress.partialFailurePosts}`;
    claims.push(async () => {
      const eventKey = `campaign:${detail.id}:publishing-issue`;
      const event = await claimStateEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "publishing_issue", eventKey, state, metadata: { failedPosts: detail.progress.failedPosts, partialFailurePosts: detail.progress.partialFailurePosts } });
      if (!event) { result.skippedEvents += 1; return; }
      result.claimedEvents += 1;
      await emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: event.id, eventKey: `${eventKey}:${state}`, activityType: "publishing_issue", metadata: { failedPosts: detail.progress.failedPosts, partialFailurePosts: detail.progress.partialFailurePosts } });
    });
  }
  if (detail.approvalRequired && detail.progress.inReviewPosts > 0) {
    const state = `${detail.progress.inReviewPosts}:${detail.health.overdueReviews}`;
    claims.push(async () => {
      const eventKey = `campaign:${detail.id}:approval-bottleneck`;
      const event = await claimStateEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "approval_bottleneck", eventKey, state, metadata: { inReviewPosts: detail.progress.inReviewPosts, overdueReviews: detail.health.overdueReviews } });
      if (!event) { result.skippedEvents += 1; return; }
      result.claimedEvents += 1;
      await emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: event.id, eventKey: `${eventKey}:${state}`, activityType: "approval_bottleneck", metadata: { inReviewPosts: detail.progress.inReviewPosts, overdueReviews: detail.health.overdueReviews }, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "approval_bottleneck", state } });
    });
  }
  try {
    const report = await getCampaignIntelligenceForWorkspace(detail.workspaceId, detail.id);
    const intelligenceResult = report ? await persistCampaignIntelligenceEvaluation({
      workspaceId: detail.workspaceId,
      campaignId: detail.id,
      report,
      mode: input.evaluationMode ?? "incremental",
      reason: input.reason ?? (input.trigger === "analytics_updated" ? "analytics_changed" : input.trigger === "campaign_updated" ? "campaign_changed" : input.trigger === "manual" ? "manual" : "automation"),
      healthStatus: detail.health.status,
    }) : null;
    if (report) {
      await persistPostIntelligenceSummaries({
        workspaceId: detail.workspaceId,
        campaignId: detail.id,
        posts: report.posts.items,
        evaluatedAt: report.generatedAt,
      });
      const experimentRun = await evaluateRunningExperimentsForWorkspace(detail.workspaceId, detail.id);
      if (experimentRun.failed > 0) result.failedEvents += experimentRun.failed;
    }
    const intelligence = intelligenceResult?.report ?? report;
    if (intelligence) {
      const intelligenceState = await claimStateEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "intelligence_updated", eventKey: `campaign:${detail.id}:intelligence`, state: intelligence.fingerprint, metadata: { dataQuality: intelligence.dataQuality.status, confidence: intelligence.dataQuality.confidence, topPerformerId: intelligence.overview.topPerformer?.postId ?? null, underperformingCount: intelligence.overview.underperformerCount } });
      if (intelligenceState) {
        result.claimedEvents += 1;
        claims.push(async () => emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: intelligenceState.id, eventKey: `campaign:${detail.id}:intelligence:${intelligence.fingerprint}`, activityType: "intelligence_updated", metadata: { dataQuality: intelligence.dataQuality.status, confidence: intelligence.dataQuality.confidence, topPerformerId: intelligence.overview.topPerformer?.postId ?? null, underperformingCount: intelligence.overview.underperformerCount }, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "intelligence_updated", eventKey: `campaign:${detail.id}:intelligence:${intelligence.fingerprint}`, state: intelligence.fingerprint, dataQuality: intelligence.dataQuality.status, confidence: intelligence.dataQuality.confidence, topPerformerId: intelligence.overview.topPerformer?.postId ?? null, underperformingCount: intelligence.overview.underperformerCount } }));
      }
      const underperformerState = await claimStateEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "content_underperforming", eventKey: `campaign:${detail.id}:underperformers`, state: intelligence.rankings.underperformers.map((post) => post.postId).join(",") || "none", metadata: { underperformingCount: intelligence.rankings.underperformers.length } });
      if (underperformerState && intelligence.rankings.underperformers.length > 0) {
        result.claimedEvents += 1;
        claims.push(async () => emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: underperformerState.id, eventKey: `campaign:${detail.id}:underperformers:${intelligence.rankings.underperformers.map((post) => post.postId).join(",")}`, activityType: "content_underperforming", metadata: { underperformingCount: intelligence.rankings.underperformers.length }, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "content_underperforming", eventKey: `campaign:${detail.id}:underperformers:${intelligence.rankings.underperformers.map((post) => post.postId).join(",")}`, state: "underperforming", dataQuality: intelligence.dataQuality.status, confidence: intelligence.dataQuality.confidence, underperformingCount: intelligence.rankings.underperformers.length } }));
      }
      const recommendationState = await claimStateEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventType: "recommendation_created", eventKey: `campaign:${detail.id}:recommendations`, state: intelligence.recommendations.map((recommendation) => recommendation.fingerprint).join("|") || "none", metadata: { recommendationType: intelligence.recommendations[0]?.type ?? null } });
      if (recommendationState && intelligence.recommendations.length > 0) {
        result.claimedEvents += 1;
        claims.push(async () => emitClaimedEvent({ workspaceId: detail.workspaceId, campaignId: detail.id, eventId: recommendationState.id, eventKey: `campaign:${detail.id}:recommendations:${intelligence.recommendations.map((recommendation) => recommendation.fingerprint).join("|")}`, activityType: "recommendation_created", metadata: { recommendationType: intelligence.recommendations[0]?.type ?? null }, notification: { workspaceId: detail.workspaceId, campaignId: detail.id, event: "recommendation_created", eventKey: `campaign:${detail.id}:recommendations:${intelligence.recommendations.map((recommendation) => recommendation.fingerprint).join("|")}`, state: "available", dataQuality: intelligence.dataQuality.status, confidence: intelligence.dataQuality.confidence, recommendationType: intelligence.recommendations[0]?.type ?? null } }));
      }
    }
  } catch (error) {
    result.failedEvents += 1;
    logger.error("campaign intelligence evaluation failed", { campaignId: input.campaignId, error: error instanceof Error ? error.message : String(error) });
  }
  for (const claim of claims) {
    try { await claim(); } catch (error) { result.failedEvents += 1; logger.error("campaign automation event failed", { campaignId: input.campaignId, error: error instanceof Error ? error.message : String(error) }); }
  }
  return result;
}

export async function listCampaignIdsForEvaluation(workspaceId?: string, limit = 100): Promise<Array<{ campaignId: string; workspaceId: string; priority: number; evaluationMode: "incremental"; reason: "scheduled" }>> {
  const conditions = [inArray(campaigns.status, ["draft", "active"] as const)];
  if (workspaceId) conditions.push(eq(campaigns.workspaceId, workspaceId));
  const candidates = await db.select({ id: campaigns.id, workspaceId: campaigns.workspaceId, status: campaigns.status, endAt: campaigns.endAt, updatedAt: campaigns.updatedAt }).from(campaigns).where(and(...conditions)).orderBy(campaigns.updatedAt).limit(Math.min(500, Math.max(1, limit * 5)));
  if (candidates.length === 0) return [];
  const latest = await db.select({ campaignId: campaignIntelligenceSnapshots.campaignId, createdAt: campaignIntelligenceSnapshots.createdAt, freshness: campaignIntelligenceSnapshots.freshness }).from(campaignIntelligenceSnapshots).where(inArray(campaignIntelligenceSnapshots.campaignId, candidates.map((candidate) => candidate.id))).orderBy(desc(campaignIntelligenceSnapshots.createdAt), desc(campaignIntelligenceSnapshots.id));
  const latestByCampaign = new Map<string, typeof latest[number]>();
  for (const row of latest) if (!latestByCampaign.has(row.campaignId)) latestByCampaign.set(row.campaignId, row);
  return candidates.map((candidate) => {
    const snapshot = latestByCampaign.get(candidate.id);
    const scored = scoreCampaignEvaluationPriority({ status: candidate.status as "draft" | "active", endAt: candidate.endAt, lastEvaluatedAt: snapshot?.createdAt ?? null, freshness: snapshot?.freshness ?? null });
    return { campaignId: candidate.id, workspaceId: candidate.workspaceId, priority: scored.score, evaluationMode: "incremental" as const, reason: "scheduled" as const, sortPriority: scored.score, lastEvaluatedAt: snapshot?.createdAt?.getTime() ?? 0, updatedAt: candidate.updatedAt.getTime() };
  }).sort((a, b) => b.sortPriority - a.sortPriority || a.lastEvaluatedAt - b.lastEvaluatedAt || a.updatedAt - b.updatedAt || a.campaignId.localeCompare(b.campaignId)).slice(0, Math.min(100, Math.max(1, limit))).map(({ sortPriority: _sortPriority, lastEvaluatedAt: _lastEvaluatedAt, updatedAt: _updatedAt, ...candidate }) => candidate);
}
