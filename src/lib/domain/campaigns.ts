import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { hasPermission, type WorkspaceRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { campaigns, postAnalyticsSnapshots, postIntelligenceSummaries, posts, postPlatforms, workspaces, type Campaign } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { notifyCampaignEvent, type CampaignNotificationEvent } from "@/lib/domain/notifications";
import { recordCampaignActivity } from "@/lib/domain/campaign-activity";
import { ANALYTICS_METRICS } from "@/lib/domain/analytics";
import {
  aggregateCampaignPerformance,
  evaluateCampaignGoal,
  evaluateCampaignHealth,
  type CampaignGoalEvaluation,
  type CampaignPerformanceSummary,
} from "@/lib/domain/campaign-performance";
import type { Platform, PostStatus } from "@/lib/status";
import { enqueueCampaignEvaluation } from "@/lib/queue/campaign-automation";

export type CampaignStatus = "draft" | "active" | "completed" | "archived";
export type CampaignObjective =
  | "brand_awareness"
  | "engagement"
  | "traffic"
  | "promotion"
  | "education"
  | "community"
  | "other";
export type CampaignTargetMetric = (typeof ANALYTICS_METRICS)[number];
export type PostApprovalStatus = "not_required" | "draft" | "in_review" | "changes_requested" | "approved";
export type CampaignHealthStatus = "healthy" | "warning" | "attention" | "at_risk" | "critical" | "completed";
export type CampaignTimelinePhase = "planning" | "content_creation" | "review" | "scheduling" | "publishing" | "completed";

export type CampaignInput = {
  name: string;
  description?: string | null;
  objective?: CampaignObjective | null;
  customObjective?: string | null;
  targetMetric?: CampaignTargetMetric | null;
  targetValue?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
};

export type CampaignUpdateInput = Partial<CampaignInput>;

export type CampaignSummary = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  objective: CampaignObjective | null;
  customObjective: string | null;
  targetMetric: CampaignTargetMetric | null;
  targetValue: number | null;
  startAt: Date | null;
  endAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  postCount: number;
};

export type CampaignPost = {
  id: string;
  contentText: string;
  status: PostStatus;
  approvalStatus: PostApprovalStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  platforms: Platform[];
};

export type CampaignPostStats = {
  total: number;
  byStatus: Record<PostStatus, number>;
  byApproval: Record<PostApprovalStatus, number>;
};

export type CampaignProgress = {
  totalPosts: number;
  relevantPosts: number;
  publishedPosts: number;
  scheduledPosts: number;
  processingPosts: number;
  inReviewPosts: number;
  draftPosts: number;
  failedPosts: number;
  partialFailurePosts: number;
  completionPercent: number;
};

export type CampaignHealth = {
  status: CampaignHealthStatus;
  reasons: string[];
  overdueReviews: number;
  unfinishedPosts: number;
};

export type CampaignTimeline = {
  current: CampaignTimelinePhase;
  steps: Array<{ id: CampaignTimelinePhase; label: string; complete: boolean; current: boolean }>;
};

export type CampaignAnalyticsSummary = CampaignPerformanceSummary;
export type CampaignGoalSummary = CampaignGoalEvaluation;
export type CampaignAlert = {
  type: "publishing" | "approval" | "deadline" | "goal" | "analytics";
  severity: "warning" | "critical";
  title: string;
  href: string;
};

export type CampaignApprovalSummary = CampaignPostStats["byApproval"];
export type CampaignPublishingSummary = Pick<CampaignProgress, "scheduledPosts" | "processingPosts" | "publishedPosts" | "failedPosts" | "partialFailurePosts">;

export type CampaignDetail = CampaignSummary & {
  postStats: CampaignPostStats;
  progress: CampaignProgress;
  health: CampaignHealth;
  timeline: CampaignTimeline;
  approvalRequired: boolean;
  approvalSummary: CampaignApprovalSummary;
  publishingSummary: CampaignPublishingSummary;
  analytics: CampaignAnalyticsSummary;
  goal: CampaignGoalSummary;
  alerts: CampaignAlert[];
};

export type PaginatedCampaigns = {
  items: CampaignSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedCampaignPosts = {
  items: CampaignPost[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CampaignListQuery = {
  page: number;
  pageSize: number;
  status?: CampaignStatus;
  search?: string;
  sort: "updated" | "created" | "name";
  order: "asc" | "desc";
};

export type CampaignPostsQuery = {
  page: number;
  pageSize: number;
  status?: PostStatus;
  approvalStatus?: PostApprovalStatus;
  platform?: Platform;
  from?: Date;
  to?: Date;
  search?: string;
};

export type CampaignAvailablePostsQuery = CampaignPostsQuery;

const POST_STATUSES: readonly PostStatus[] = ["draft", "scheduled", "processing", "published", "partial_failure", "failed", "cancelled"];
const APPROVAL_STATUSES: readonly PostApprovalStatus[] = ["not_required", "draft", "in_review", "changes_requested", "approved"];

const transitions: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["active", "archived"],
  active: ["completed", "archived"],
  completed: ["archived"],
  archived: ["active"],
};

function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new AppError("validation_failed", "Campaign name is required.");
  const name = value.trim();
  if (name.length < 1 || name.length > 160) throw new AppError("validation_failed", "Campaign name must be between 1 and 160 characters.");
  return name;
}

function cleanDescription(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new AppError("validation_failed", "Campaign description is invalid.");
  const description = value.trim();
  if (description.length > 2000) throw new AppError("validation_failed", "Campaign description is too long.");
  return description || null;
}

function cleanGoal(input: Pick<CampaignInput, "objective" | "customObjective" | "targetMetric" | "targetValue">): {
  objective: CampaignObjective | null;
  customObjective: string | null;
  targetMetric: CampaignTargetMetric | null;
  targetValue: number | null;
} {
  const objective = input.objective ?? null;
  const customObjective = input.customObjective?.trim() || null;
  const targetMetric = input.targetMetric ?? null;
  const targetValue = input.targetValue ?? null;
  if (objective === "other" && !customObjective) throw new AppError("validation_failed", "Describe the custom objective.");
  if (objective !== "other" && customObjective) throw new AppError("validation_failed", "Custom objective is only available for Other.");
  if ((targetMetric === null) !== (targetValue === null)) throw new AppError("validation_failed", "Choose both a target metric and target value.");
  if (targetValue !== null && (!Number.isSafeInteger(targetValue) || targetValue <= 0)) throw new AppError("validation_failed", "Target value must be a positive whole number.");
  return { objective, customObjective: objective === "other" ? customObjective : null, targetMetric, targetValue };
}

function cleanDates(startAt: Date | null | undefined, endAt: Date | null | undefined) {
  if (startAt && Number.isNaN(startAt.getTime())) throw new AppError("validation_failed", "Choose a valid start date.");
  if (endAt && Number.isNaN(endAt.getTime())) throw new AppError("validation_failed", "Choose a valid end date.");
  if (startAt && endAt && startAt.getTime() > endAt.getTime()) throw new AppError("validation_failed", "Start date must be before end date.");
}

function toSummary(row: Campaign, postCount = 0): CampaignSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    status: row.status,
    objective: row.objective,
    customObjective: row.customObjective,
    targetMetric: row.targetMetric,
    targetValue: row.targetValue,
    startAt: row.startAt,
    endAt: row.endAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    postCount,
  };
}

function assertEditorOwns(role: WorkspaceRole, actorId: string, row: Campaign): void {
  if (role === "editor" && row.createdBy !== actorId) {
    throw new AppError("forbidden", "Editors can only change campaigns they created.");
  }
}

async function getCampaignRow(userId: string, campaignId: string): Promise<{ row: Campaign; role: WorkspaceRole }> {
  const authorization = await requireWorkspacePermission(userId, "campaigns:view");
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, authorization.workspaceId)))
    .limit(1);
  if (!row) throw new AppError("not_found", "We couldn't find that campaign.");
  return { row, role: authorization.role };
}

function summaryCounts(rows: Array<{ status: PostStatus; approvalStatus: PostApprovalStatus; count: number }>): CampaignPostStats {
  const byStatus = Object.fromEntries(POST_STATUSES.map((status) => [status, 0])) as Record<PostStatus, number>;
  const byApproval = Object.fromEntries(APPROVAL_STATUSES.map((status) => [status, 0])) as Record<PostApprovalStatus, number>;
  for (const row of rows) {
    byStatus[row.status] += row.count;
    byApproval[row.approvalStatus] += row.count;
  }
  return { total: rows.reduce((total, row) => total + row.count, 0), byStatus, byApproval };
}

function progressFromStats(stats: CampaignPostStats): CampaignProgress {
  const publishedPosts = stats.byStatus.published;
  const scheduledPosts = stats.byStatus.scheduled;
  const processingPosts = stats.byStatus.processing;
  const failedPosts = stats.byStatus.failed;
  const partialFailurePosts = stats.byStatus.partial_failure;
  const relevantPosts = Math.max(0, stats.total - stats.byStatus.cancelled);
  return {
    totalPosts: stats.total,
    relevantPosts,
    publishedPosts,
    scheduledPosts,
    processingPosts,
    inReviewPosts: stats.byApproval.in_review,
    draftPosts: stats.byStatus.draft,
    failedPosts,
    partialFailurePosts,
    completionPercent: relevantPosts === 0 ? 0 : Math.round((publishedPosts / relevantPosts) * 100),
  };
}

function timelineFromProgress(status: CampaignStatus, progress: CampaignProgress): CampaignTimeline {
  const current: CampaignTimelinePhase = status === "completed" || status === "archived"
    ? "completed"
    : progress.processingPosts > 0 || progress.publishedPosts > 0
      ? "publishing"
      : progress.scheduledPosts > 0
        ? "scheduling"
        : progress.inReviewPosts > 0 || progress.failedPosts > 0
          ? "review"
          : progress.draftPosts > 0
            ? "content_creation"
            : "planning";
  const phases: Array<[CampaignTimelinePhase, string]> = [
    ["planning", "Planning"],
    ["content_creation", "Content creation"],
    ["review", "Review"],
    ["scheduling", "Scheduling"],
    ["publishing", "Publishing"],
    ["completed", "Completed"],
  ];
  const currentIndex = phases.findIndex(([id]) => id === current);
  return {
    current,
    steps: phases.map(([id, label], index) => ({ id, label, complete: index < currentIndex, current: id === current })),
  };
}

function publishingFromProgress(progress: CampaignProgress): CampaignPublishingSummary {
  return {
    scheduledPosts: progress.scheduledPosts,
    processingPosts: progress.processingPosts,
    publishedPosts: progress.publishedPosts,
    failedPosts: progress.failedPosts,
    partialFailurePosts: progress.partialFailurePosts,
  };

}

async function analyticsForCampaign(
  campaignId: string,
  workspaceId: string,
  stats: CampaignPostStats,
): Promise<CampaignAnalyticsSummary> {
  const [targets, rows] = await Promise.all([
    db
      .select({ postId: posts.id, postPlatformId: postPlatforms.id, platform: postPlatforms.platform })
      .from(postPlatforms)
      .innerJoin(posts, eq(posts.id, postPlatforms.postId))
      .where(and(eq(posts.campaignId, campaignId), eq(posts.workspaceId, workspaceId))),
    db
      .select({ snapshot: postAnalyticsSnapshots })
      .from(postAnalyticsSnapshots)
      .innerJoin(posts, eq(posts.id, postAnalyticsSnapshots.postId))
      .where(and(eq(posts.campaignId, campaignId), eq(posts.workspaceId, workspaceId)))
      .orderBy(desc(postAnalyticsSnapshots.collectedAt), desc(postAnalyticsSnapshots.createdAt)),
  ]);
  return aggregateCampaignPerformance({
    targets,
    snapshots: rows.map(({ snapshot }) => ({
      postId: snapshot.postId,
      postPlatformId: snapshot.postPlatformId,
      platform: snapshot.platform,
      status: snapshot.status,
      metrics: snapshot,
      collectedAt: snapshot.collectedAt,
    })),
    totalPosts: stats.total,
    publishedPosts: stats.byStatus.published,
    failedPosts: stats.byStatus.failed,
    partialFailurePosts: stats.byStatus.partial_failure,
  });
}

async function postCountForCampaign(campaignId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .where(eq(posts.campaignId, campaignId));
  return Number(row?.count ?? 0);
}

export async function createCampaign(userId: string, input: CampaignInput): Promise<CampaignSummary> {
  const authorization = await requireWorkspacePermission(userId, "campaigns:create");
  const name = cleanName(input.name);
  const description = cleanDescription(input.description) ?? null;
  cleanDates(input.startAt, input.endAt);
  const goal = cleanGoal(input);
  const [created] = await db
    .insert(campaigns)
    .values({
      workspaceId: authorization.workspaceId,
      name,
      description,
      objective: goal.objective,
      customObjective: goal.customObjective,
      targetMetric: goal.targetMetric,
      targetValue: goal.targetValue,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      createdBy: userId,
    })
    .returning();
  if (!created) throw new AppError("server_error", "We couldn't create that campaign.");
  void notifyCampaignEvent({ workspaceId: created.workspaceId, campaignId: created.id, actorId: userId, event: "created" }).catch(() => undefined);
  void recordCampaignActivity({ workspaceId: created.workspaceId, campaignId: created.id, actorId: userId, type: "created" }).catch(() => undefined);
  void enqueueCampaignEvaluation({ campaignId: created.id, workspaceId: created.workspaceId, trigger: "campaign_updated", reason: "campaign_changed", evaluationMode: "incremental" }).catch(() => undefined);
  return toSummary(created);
}

export async function listCampaigns(userId: string, query: CampaignListQuery): Promise<PaginatedCampaigns> {
  const authorization = await requireWorkspacePermission(userId, "campaigns:view");
  const conditions = [eq(campaigns.workspaceId, authorization.workspaceId)];
  if (query.status) conditions.push(eq(campaigns.status, query.status));
  if (query.search) conditions.push(ilike(campaigns.name, `%${query.search}%`));
  const where = and(...conditions);
  const sortColumn = query.sort === "name" ? campaigns.name : query.sort === "created" ? campaigns.createdAt : campaigns.updatedAt;
  const order = query.order === "asc" ? asc(sortColumn) : desc(sortColumn);
  const [countRows, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(campaigns).where(where),
    db
      .select({ campaign: campaigns, postCount: sql<number>`count(${posts.id})` })
      .from(campaigns)
      .leftJoin(posts, eq(posts.campaignId, campaigns.id))
      .where(where)
      .groupBy(campaigns.id)
      .orderBy(order, desc(campaigns.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map((row) => toSummary(row.campaign, Number(row.postCount ?? 0))),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getCampaignForWorkspace(workspaceId: string, campaignId: string): Promise<CampaignDetail | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  const [postCount, grouped, workspace] = await Promise.all([
    postCountForCampaign(row.id),
    db
      .select({ status: posts.status, approvalStatus: posts.approvalStatus, count: sql<number>`count(*)` })
      .from(posts)
      .where(eq(posts.campaignId, row.id))
      .groupBy(posts.status, posts.approvalStatus),
    db.select({ approvalRequired: workspaces.approvalRequired }).from(workspaces).where(eq(workspaces.id, row.workspaceId)).limit(1).then((items) => items[0] ?? { approvalRequired: false }),
  ]);
  const postStats = summaryCounts(grouped.map((item) => ({ ...item, count: Number(item.count) })));
  const progress = progressFromStats(postStats);
  const [overdueRows, analytics] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.campaignId, row.id), eq(posts.approvalStatus, "in_review"), lt(posts.reviewDueAt, new Date()))),
    analyticsForCampaign(row.id, row.workspaceId, postStats),
  ]);
  const analyticsCoverage = postStats.total === 0 ? 0 : analytics.postsWithAnalytics / postStats.total;
  const goal = evaluateCampaignGoal({ metric: row.targetMetric, targetValue: row.targetValue, currentValue: row.targetMetric ? analytics.metrics[row.targetMetric] : null, startAt: row.startAt, endAt: row.endAt });
  const healthEvaluation = evaluateCampaignHealth({ status: row.status, progress, overdueReviews: Number(overdueRows[0]?.count ?? 0), approvalRequired: workspace.approvalRequired, goal, analyticsCoverage, endAt: row.endAt });
  return {
    ...toSummary(row, postCount),
    postStats,
    progress,
    health: {
      status: healthEvaluation.status,
      reasons: healthEvaluation.reasons,
      overdueReviews: Number(overdueRows[0]?.count ?? 0),
      unfinishedPosts: Math.max(0, progress.relevantPosts - progress.publishedPosts),
    },
    timeline: timelineFromProgress(row.status, progress),
    approvalRequired: workspace.approvalRequired,
    approvalSummary: postStats.byApproval,
    publishingSummary: publishingFromProgress(progress),
    analytics,
    goal,
    alerts: healthEvaluation.alerts,
  };
}

export async function getCampaign(userId: string, campaignId: string): Promise<CampaignDetail> {
  const authorization = await requireWorkspacePermission(userId, "campaigns:view");
  const campaign = await getCampaignForWorkspace(authorization.workspaceId, campaignId);
  if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");
  return campaign;
}

export async function updateCampaign(userId: string, campaignId: string, input: CampaignUpdateInput): Promise<CampaignSummary> {
  const authorization = await requireWorkspacePermission(userId, "campaigns:update");
  const [existing] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, authorization.workspaceId))).limit(1);
  if (!existing) throw new AppError("not_found", "We couldn't find that campaign.");
  assertEditorOwns(authorization.role, userId, existing);
  if (existing.status === "archived") throw new AppError("conflict", "Restore the campaign before editing it.");
  const startAt = input.startAt === undefined ? existing.startAt : input.startAt;
  const endAt = input.endAt === undefined ? existing.endAt : input.endAt;
  cleanDates(startAt, endAt);
  const objective = input.objective === undefined ? existing.objective : input.objective;
  const goal = cleanGoal({
    objective,
    customObjective: objective === "other" ? input.customObjective === undefined ? existing.customObjective : input.customObjective : null,
    targetMetric: input.targetMetric === undefined ? existing.targetMetric : input.targetMetric,
    targetValue: input.targetValue === undefined ? existing.targetValue : input.targetValue,
  });
  const values: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = cleanName(input.name);
  if (input.description !== undefined) values.description = cleanDescription(input.description) ?? null;
  if (input.objective !== undefined || input.customObjective !== undefined) {
    values.objective = goal.objective;
    values.customObjective = goal.customObjective;
  }
  if (input.targetMetric !== undefined || input.targetValue !== undefined) {
    values.targetMetric = goal.targetMetric;
    values.targetValue = goal.targetValue;
  }
  if (input.startAt !== undefined) values.startAt = input.startAt;
  if (input.endAt !== undefined) values.endAt = input.endAt;
  const [updated] = await db.update(campaigns).set(values).where(eq(campaigns.id, existing.id)).returning();
  if (!updated) throw new AppError("not_found", "We couldn't update that campaign.");
  const event = input.objective !== undefined || input.customObjective !== undefined || input.targetMetric !== undefined || input.targetValue !== undefined ? "goal_updated" : "updated";
  void notifyCampaignEvent({ workspaceId: updated.workspaceId, campaignId: updated.id, actorId: userId, event }).catch(() => undefined);
  void recordCampaignActivity({ workspaceId: updated.workspaceId, campaignId: updated.id, actorId: userId, type: event }).catch(() => undefined);
  void enqueueCampaignEvaluation({ campaignId: updated.id, workspaceId: updated.workspaceId, trigger: "campaign_updated", reason: "campaign_changed", evaluationMode: "incremental" }).catch(() => undefined);
  return toSummary(updated, await postCountForCampaign(updated.id));
}

export async function transitionCampaign(userId: string, campaignId: string, target: CampaignStatus): Promise<CampaignSummary> {
  const permission = target === "archived" ? "campaigns:archive" : "campaigns:update";
  const authorization = await requireWorkspacePermission(userId, permission);
  const [existing] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, authorization.workspaceId))).limit(1);
  if (!existing) throw new AppError("not_found", "We couldn't find that campaign.");
  assertEditorOwns(authorization.role, userId, existing);
  if (!transitions[existing.status].includes(target)) throw new AppError("conflict", `Campaigns cannot move from ${existing.status} to ${target}.`);
  if (target === "completed") {
    const [inFlight] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.campaignId, existing.id), inArray(posts.status, ["processing", "scheduled"])));
    if (Number(inFlight?.count ?? 0) > 0) throw new AppError("conflict", "Finish or unschedule processing and scheduled content before completing the campaign.");
  }
  const [updated] = await db.update(campaigns).set({ status: target, updatedAt: new Date() }).where(and(eq(campaigns.id, existing.id), eq(campaigns.status, existing.status))).returning();
  if (!updated) throw new AppError("conflict", "The campaign changed before this action completed.");
  const event = target === "active" ? "activated" : target === "completed" ? "completed" : "archived";
  void notifyCampaignEvent({ workspaceId: updated.workspaceId, campaignId: updated.id, actorId: userId, event }).catch(() => undefined);
  void recordCampaignActivity({ workspaceId: updated.workspaceId, campaignId: updated.id, actorId: userId, type: event === "activated" ? "activated" : event === "completed" ? "completed" : "archived" }).catch(() => undefined);
  void enqueueCampaignEvaluation({ campaignId: updated.id, workspaceId: updated.workspaceId, trigger: "campaign_updated", reason: "campaign_changed", evaluationMode: "incremental" }).catch(() => undefined);
  return toSummary(updated, await postCountForCampaign(updated.id));
}

export async function archiveCampaign(userId: string, campaignId: string) { return transitionCampaign(userId, campaignId, "archived"); }
export async function restoreCampaign(userId: string, campaignId: string) { return transitionCampaign(userId, campaignId, "active"); }

export async function deleteCampaign(userId: string, campaignId: string): Promise<void> {
  const authorization = await requireWorkspacePermission(userId, "campaigns:delete");
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, authorization.workspaceId))).limit(1);
    if (!existing) throw new AppError("not_found", "We couldn't find that campaign.");
    await tx.update(posts).set({ campaignId: null, updatedAt: new Date() }).where(eq(posts.campaignId, existing.id));
    const [deleted] = await tx.delete(campaigns).where(eq(campaigns.id, existing.id)).returning({ id: campaigns.id, workspaceId: campaigns.workspaceId });
    if (!deleted) throw new AppError("conflict", "The campaign changed before deletion completed.");
  });
  void notifyCampaignEvent({ workspaceId: authorization.workspaceId, campaignId, actorId: userId, event: "deleted" }).catch(() => undefined);
}

async function getManageableCampaign(userId: string, campaignId: string) {
  const authorization = await requireWorkspacePermission(userId, "campaigns:manage_posts");
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, authorization.workspaceId))).limit(1);
  if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");
  if (campaign.status === "archived" || campaign.status === "completed") throw new AppError("conflict", "Only draft or active campaigns can receive posts.");
  return { authorization, campaign };
}

export async function attachPostToCampaign(userId: string, campaignId: string, postId: string): Promise<void> {
  const { authorization, campaign } = await getManageableCampaign(userId, campaignId);
  await db.transaction(async (tx) => {
    const [post] = await tx.select({ id: posts.id, workspaceId: posts.workspaceId }).from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post) throw new AppError("not_found", "We couldn't find that post.");
    if (post.workspaceId !== authorization.workspaceId || campaign.workspaceId !== post.workspaceId) throw new AppError("forbidden", "Campaign and post must belong to the same workspace.");
    const [updated] = await tx.update(posts).set({ campaignId: campaign.id, updatedAt: new Date() }).where(and(eq(posts.id, post.id), eq(posts.workspaceId, authorization.workspaceId))).returning({ id: posts.id });
    if (!updated) throw new AppError("conflict", "The post changed before it could be added.");
  });
  void notifyCampaignEvent({ workspaceId: campaign.workspaceId, campaignId: campaign.id, actorId: userId, event: "post_added", postId }).catch(() => undefined);
  void recordCampaignActivity({ workspaceId: campaign.workspaceId, campaignId: campaign.id, actorId: userId, postId, type: "post_added", dedupeKey: `post_added:${postId}:${Date.now()}` }).catch(() => undefined);
  void db.update(postIntelligenceSummaries).set({ state: "stale", updatedAt: new Date() }).where(and(eq(postIntelligenceSummaries.workspaceId, campaign.workspaceId), eq(postIntelligenceSummaries.campaignId, campaign.id), eq(postIntelligenceSummaries.postId, postId))).catch(() => undefined);
  void enqueueCampaignEvaluation({ campaignId: campaign.id, workspaceId: campaign.workspaceId, trigger: "campaign_updated", reason: "post_changed", evaluationMode: "incremental" }).catch(() => undefined);
}

export async function detachPostFromCampaign(userId: string, campaignId: string, postId: string): Promise<void> {
  const { authorization, campaign } = await getManageableCampaign(userId, campaignId);
  const [updated] = await db.update(posts).set({ campaignId: null, updatedAt: new Date() }).where(and(eq(posts.id, postId), eq(posts.campaignId, campaign.id), eq(posts.workspaceId, authorization.workspaceId))).returning({ id: posts.id });
  if (!updated) throw new AppError("not_found", "That post is not in this campaign.");
  await db.delete(postIntelligenceSummaries).where(and(eq(postIntelligenceSummaries.workspaceId, campaign.workspaceId), eq(postIntelligenceSummaries.campaignId, campaign.id), eq(postIntelligenceSummaries.postId, postId)));
  void notifyCampaignEvent({ workspaceId: campaign.workspaceId, campaignId: campaign.id, actorId: userId, event: "post_removed", postId }).catch(() => undefined);
  void recordCampaignActivity({ workspaceId: campaign.workspaceId, campaignId: campaign.id, actorId: userId, postId, type: "post_removed", dedupeKey: `post_removed:${postId}:${Date.now()}` }).catch(() => undefined);
  void enqueueCampaignEvaluation({ campaignId: campaign.id, workspaceId: campaign.workspaceId, trigger: "campaign_updated", reason: "post_changed", evaluationMode: "incremental" }).catch(() => undefined);
}

export async function listCampaignPosts(userId: string, campaignId: string, query: CampaignPostsQuery): Promise<PaginatedCampaignPosts> {
  const { row } = await getCampaignRow(userId, campaignId);
  const conditions = [eq(posts.campaignId, row.id), eq(posts.workspaceId, row.workspaceId)];
  if (query.status) conditions.push(eq(posts.status, query.status));
  if (query.approvalStatus) conditions.push(eq(posts.approvalStatus, query.approvalStatus));
  if (query.platform) conditions.push(sql`exists (select 1 from ${postPlatforms} pp where pp.post_id = ${posts.id} and pp.platform = ${query.platform})`);
  if (query.from) conditions.push(gte(sql`coalesce(${posts.scheduledAt}, ${posts.createdAt})`, query.from));
  if (query.to) conditions.push(lt(sql`coalesce(${posts.scheduledAt}, ${posts.createdAt})`, query.to));
  if (query.search) conditions.push(ilike(posts.contentText, `%${query.search}%`));
  const where = and(...conditions);
  const [countRows, postRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(posts).where(where),
    db.select().from(posts).where(where).orderBy(desc(posts.updatedAt), desc(posts.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  const platformRows = postRows.length === 0 ? [] : await db.select({ postId: postPlatforms.postId, platform: postPlatforms.platform }).from(postPlatforms).where(sql`${postPlatforms.postId} in (${sql.join(postRows.map((post) => sql`${post.id}`), sql`, `)})`);
  const platformMap = new Map<string, Platform[]>();
  for (const item of platformRows) platformMap.set(item.postId, [...(platformMap.get(item.postId) ?? []), item.platform]);
  return {
    items: postRows.map((post) => ({ id: post.id, contentText: post.contentText, status: post.status, approvalStatus: post.approvalStatus, scheduledAt: post.scheduledAt, publishedAt: post.publishedAt, createdAt: post.createdAt, updatedAt: post.updatedAt, platforms: platformMap.get(post.id) ?? [] })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listAvailablePostsForCampaign(userId: string, campaignId: string, query: CampaignAvailablePostsQuery): Promise<PaginatedCampaignPosts> {
  const { row } = await getCampaignRow(userId, campaignId);
  const conditions = [eq(posts.workspaceId, row.workspaceId), isNull(posts.campaignId)];
  if (query.status) conditions.push(eq(posts.status, query.status));
  if (query.approvalStatus) conditions.push(eq(posts.approvalStatus, query.approvalStatus));
  if (query.platform) conditions.push(sql`exists (select 1 from ${postPlatforms} pp where pp.post_id = ${posts.id} and pp.platform = ${query.platform})`);
  if (query.from) conditions.push(gte(sql`coalesce(${posts.scheduledAt}, ${posts.createdAt})`, query.from));
  if (query.to) conditions.push(lt(sql`coalesce(${posts.scheduledAt}, ${posts.createdAt})`, query.to));
  if (query.search) conditions.push(ilike(posts.contentText, `%${query.search}%`));
  const where = and(...conditions);
  const [countRows, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(posts).where(where),
    db.select().from(posts).where(where).orderBy(desc(posts.updatedAt), desc(posts.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  if (rows.length === 0) return { items: [], page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
  const platformRows = await db.select({ postId: postPlatforms.postId, platform: postPlatforms.platform }).from(postPlatforms).where(sql`${postPlatforms.postId} in (${sql.join(rows.map((post) => sql`${post.id}`), sql`, `)})`);
  const platformMap = new Map<string, Platform[]>();
  for (const item of platformRows) platformMap.set(item.postId, [...(platformMap.get(item.postId) ?? []), item.platform]);
  return {
    items: rows.map((post) => ({ id: post.id, contentText: post.contentText, status: post.status, approvalStatus: post.approvalStatus, scheduledAt: post.scheduledAt, publishedAt: post.publishedAt, createdAt: post.createdAt, updatedAt: post.updatedAt, platforms: platformMap.get(post.id) ?? [] })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export function canManageCampaign(role: WorkspaceRole, permission: "campaigns:update" | "campaigns:archive" | "campaigns:delete" | "campaigns:manage_posts"): boolean {
  return hasPermission(role, permission);
}

export function campaignEventForStatus(status: CampaignStatus): CampaignNotificationEvent | null {
  return status === "active" ? "activated" : status === "completed" ? "completed" : status === "archived" ? "archived" : null;
}
