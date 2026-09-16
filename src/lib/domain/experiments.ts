import "server-only";

import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { recordCampaignActivity } from "@/lib/domain/campaign-activity";
import { notifyCampaignOptimizationEvent } from "@/lib/domain/notifications";
import { db } from "@/lib/db";
import { campaignOptimizationActions, campaigns, experimentLearnings, experimentResultSnapshots, experimentVariants, experiments, postIntelligenceSummaries, postPlatforms, posts, type Experiment, type ExperimentResultSnapshot, type ExperimentVariant } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { INTELLIGENCE_THRESHOLDS, type IntelligenceConfidence } from "@/lib/domain/campaign-intelligence";
import { evaluateExperimentStatistics, normalizePlatformMetrics, STATISTICAL_CONFIG, type StatisticalFreshness } from "@/lib/domain/experiment-statistics";

export const EXPERIMENT_STATUSES = ["draft", "planned", "running", "paused", "completed", "cancelled"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
export const EXPERIMENT_TYPES = ["content", "format", "platform", "posting_time", "hook", "caption"] as const;
export type ExperimentType = (typeof EXPERIMENT_TYPES)[number];
export const EXPERIMENT_METRICS = ["views", "likes", "comments", "shares", "saves", "reach", "impressions"] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

export type ExperimentView = Experiment & { variants: ExperimentVariant[]; latestResult: ExperimentResultSnapshot | null };

const transitions: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  draft: ["planned", "cancelled"], planned: ["running", "cancelled"], running: ["paused", "completed", "cancelled"], paused: ["running", "cancelled"], completed: [], cancelled: [],
};

export function canTransitionExperiment(from: ExperimentStatus, to: ExperimentStatus): boolean { return transitions[from]?.includes(to) ?? false; }

async function campaignForUser(userId: string, campaignId: string, permission: "campaigns:view" | "campaigns:update") {
  const context = await requireWorkspacePermission(userId, permission);
  const [campaign] = await db.select({ id: campaigns.id, workspaceId: campaigns.workspaceId }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, context.workspaceId))).limit(1);
  if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");
  return { context, campaign };
}

async function experimentForUser(userId: string, campaignId: string, experimentId: string, permission: "campaigns:view" | "campaigns:update") {
  const { context, campaign } = await campaignForUser(userId, campaignId, permission);
  const [experiment] = await db.select().from(experiments).where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, campaign.workspaceId), eq(experiments.campaignId, campaign.id))).limit(1);
  if (!experiment) throw new AppError("not_found", "We couldn't find that experiment.");
  return { context, campaign, experiment };
}

async function variantsFor(experimentId: string): Promise<ExperimentVariant[]> { return db.select().from(experimentVariants).where(eq(experimentVariants.experimentId, experimentId)).orderBy(asc(experimentVariants.createdAt), asc(experimentVariants.id)); }

async function latestResultFor(workspaceId: string, experimentId: string): Promise<ExperimentResultSnapshot | null> { const [row] = await db.select().from(experimentResultSnapshots).where(and(eq(experimentResultSnapshots.workspaceId, workspaceId), eq(experimentResultSnapshots.experimentId, experimentId))).orderBy(desc(experimentResultSnapshots.createdAt), desc(experimentResultSnapshots.id)).limit(1); return row ?? null; }

export async function listExperiments(userId: string, campaignId: string): Promise<ExperimentView[]> {
  const { campaign } = await campaignForUser(userId, campaignId, "campaigns:view");
  const rows = await db.select().from(experiments).where(and(eq(experiments.workspaceId, campaign.workspaceId), eq(experiments.campaignId, campaign.id))).orderBy(desc(experiments.createdAt), desc(experiments.id));
  return Promise.all(rows.map(async (row) => ({ ...row, variants: await variantsFor(row.id), latestResult: await latestResultFor(campaign.workspaceId, row.id) })));
}

export async function getExperiment(userId: string, campaignId: string, experimentId: string): Promise<ExperimentView> {
  const { campaign, experiment } = await experimentForUser(userId, campaignId, experimentId, "campaigns:view");
  return { ...experiment, variants: await variantsFor(experiment.id), latestResult: await latestResultFor(campaign.workspaceId, experiment.id) };
}

export async function createExperiment(userId: string, campaignId: string, input: { name: string; description?: string | null; experimentType: ExperimentType; primaryMetric: ExperimentMetric; controlPostId: string; optimizationActionId?: string | null; plannedStartAt?: Date | null; notes?: string | null }): Promise<ExperimentView> {
  const { context, campaign } = await campaignForUser(userId, campaignId, "campaigns:update");
  const name = input.name.trim();
  if (!name || name.length > 160) throw new AppError("validation_failed", "Experiment name must be between 1 and 160 characters.");
  if (!EXPERIMENT_TYPES.includes(input.experimentType) || !EXPERIMENT_METRICS.includes(input.primaryMetric)) throw new AppError("validation_failed", "That experiment configuration is not supported.");
  const [control] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, input.controlPostId), eq(posts.workspaceId, campaign.workspaceId), eq(posts.campaignId, campaign.id))).limit(1);
  if (!control) throw new AppError("validation_failed", "The control post must belong to this campaign.");
  if (input.optimizationActionId) {
    const [action] = await db.select({ id: campaignOptimizationActions.id }).from(campaignOptimizationActions).where(and(eq(campaignOptimizationActions.id, input.optimizationActionId), eq(campaignOptimizationActions.workspaceId, campaign.workspaceId), eq(campaignOptimizationActions.campaignId, campaign.id))).limit(1);
    if (!action) throw new AppError("validation_failed", "The optimization action must belong to this campaign.");
  }
  const [created] = await db.insert(experiments).values({ workspaceId: context.workspaceId, campaignId: campaign.id, optimizationActionId: input.optimizationActionId ?? null, name, description: input.description?.trim().slice(0, 2000) ?? null, experimentType: input.experimentType, primaryMetric: input.primaryMetric, status: "draft", controlPostId: control.id, plannedStartAt: input.plannedStartAt ?? null, notes: input.notes?.trim().slice(0, 2000) ?? null, createdBy: userId }).onConflictDoNothing({ target: [experiments.workspaceId, experiments.campaignId, experiments.name] }).returning();
  const row = created ?? (await db.select().from(experiments).where(and(eq(experiments.workspaceId, context.workspaceId), eq(experiments.campaignId, campaign.id), eq(experiments.name, name))).limit(1))[0];
  if (!row) throw new AppError("server_error", "We couldn't create that experiment.");
  await recordCampaignActivity({ workspaceId: row.workspaceId, campaignId: row.campaignId, type: "updated", actorId: userId, metadata: { kind: "experiment", experimentId: row.id, status: row.status, experimentType: row.experimentType }, dedupeKey: `experiment-created:${row.id}` });
  void notifyCampaignOptimizationEvent({ workspaceId: row.workspaceId, campaignId: row.campaignId, event: "experiment_created", eventKey: `experiment-created:${row.id}`, experimentId: row.id });
  return { ...row, variants: [], latestResult: null };
}

export async function updateExperiment(userId: string, campaignId: string, experimentId: string, input: { name?: string; description?: string | null; plannedStartAt?: Date | null; notes?: string | null }): Promise<ExperimentView> {
  const { campaign, experiment } = await experimentForUser(userId, campaignId, experimentId, "campaigns:update");
  if (experiment.status !== "draft" && experiment.status !== "planned") throw new AppError("conflict", "That experiment can no longer be edited.");
  const name = input.name === undefined ? experiment.name : input.name.trim();
  if (!name || name.length > 160) throw new AppError("validation_failed", "Experiment name must be between 1 and 160 characters.");
  const [row] = await db.update(experiments).set({ name, description: input.description === undefined ? experiment.description : input.description?.trim().slice(0, 2000) ?? null, plannedStartAt: input.plannedStartAt === undefined ? experiment.plannedStartAt : input.plannedStartAt, notes: input.notes === undefined ? experiment.notes : input.notes?.trim().slice(0, 2000) ?? null, updatedAt: new Date() }).where(and(eq(experiments.id, experiment.id), eq(experiments.status, experiment.status))).returning();
  if (!row) throw new AppError("conflict", "That experiment changed before the update completed.");
  await recordCampaignActivity({ workspaceId: row.workspaceId, campaignId: row.campaignId, type: "updated", actorId: userId, metadata: { kind: "experiment", experimentId: row.id, status: row.status }, dedupeKey: `experiment-updated:${row.id}:${row.updatedAt.toISOString()}` });
  return { ...row, variants: await variantsFor(row.id), latestResult: await latestResultFor(campaign.workspaceId, row.id) };
}

export async function addExperimentVariant(userId: string, campaignId: string, experimentId: string, input: { label: string; variantType: ExperimentType; postId?: string | null }): Promise<ExperimentVariant> {
  const { campaign, experiment } = await experimentForUser(userId, campaignId, experimentId, "campaigns:update");
  if (experiment.status !== "draft" && experiment.status !== "planned") throw new AppError("conflict", "Variants cannot be changed after an experiment starts.");
  const current = await variantsFor(experiment.id);
  if (current.length >= 3) throw new AppError("validation_failed", "An experiment can have at most three variants.");
  const label = input.label.trim();
  if (!label || label.length > 80 || !EXPERIMENT_TYPES.includes(input.variantType)) throw new AppError("validation_failed", "Variant label or type is invalid.");
  if (current.some((variant) => variant.label.toLowerCase() === label.toLowerCase())) throw new AppError("conflict", "Variant labels must be unique within an experiment.");
  if (input.postId) {
    const [post] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.workspaceId, campaign.workspaceId), eq(posts.campaignId, campaign.id))).limit(1);
    if (!post) throw new AppError("validation_failed", "The variant post must belong to this campaign.");
    if (post.id === experiment.controlPostId) throw new AppError("validation_failed", "The control post cannot also be a variant.");
    if (current.some((variant) => variant.postId === post.id)) throw new AppError("conflict", "A post cannot be used twice in one experiment.");
  }
  const [row] = await db.insert(experimentVariants).values({ experimentId: experiment.id, workspaceId: campaign.workspaceId, postId: input.postId ?? null, label, variantType: input.variantType }).returning();
  if (!row) throw new AppError("server_error", "We couldn't add that variant.");
  await recordCampaignActivity({ workspaceId: campaign.workspaceId, campaignId: campaign.id, type: "updated", actorId: userId, metadata: { kind: "experiment_variant", experimentId: experiment.id, variantId: row.id }, dedupeKey: `experiment-variant-created:${row.id}` });
  return row;
}

export async function removeExperimentVariant(userId: string, campaignId: string, experimentId: string, variantId: string): Promise<void> {
  const { experiment } = await experimentForUser(userId, campaignId, experimentId, "campaigns:update");
  if (experiment.status !== "draft" && experiment.status !== "planned") throw new AppError("conflict", "Variants cannot be changed after an experiment starts.");
  const result = await db.delete(experimentVariants).where(and(eq(experimentVariants.id, variantId), eq(experimentVariants.experimentId, experiment.id))).returning({ id: experimentVariants.id });
  if (!result[0]) throw new AppError("not_found", "We couldn't find that variant.");
  await recordCampaignActivity({ workspaceId: experiment.workspaceId, campaignId: experiment.campaignId, type: "updated", actorId: userId, metadata: { kind: "experiment_variant_removed", experimentId: experiment.id, variantId }, dedupeKey: `experiment-variant-removed:${variantId}` });
}

export async function updateExperimentVariant(userId: string, campaignId: string, experimentId: string, variantId: string, input: { label?: string; variantType?: ExperimentType; postId?: string | null }): Promise<ExperimentVariant> {
  const { campaign, experiment } = await experimentForUser(userId, campaignId, experimentId, "campaigns:update");
  if (experiment.status !== "draft" && experiment.status !== "planned") throw new AppError("conflict", "Variants cannot be changed after an experiment starts.");
  const [current] = await db.select().from(experimentVariants).where(and(eq(experimentVariants.id, variantId), eq(experimentVariants.experimentId, experiment.id))).limit(1);
  if (!current) throw new AppError("not_found", "We couldn't find that variant.");
  const label = input.label === undefined ? current.label : input.label.trim();
  const variantType = input.variantType ?? (current.variantType as ExperimentType);
  const postId = input.postId === undefined ? current.postId : input.postId;
  const siblings = await variantsFor(experiment.id);
  if (!label || label.length > 80 || !EXPERIMENT_TYPES.includes(variantType) || siblings.some((variant) => variant.id !== current.id && variant.label.toLowerCase() === label.toLowerCase())) throw new AppError("validation_failed", "Variant label or type is invalid.");
  if (postId) {
    const [post] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, campaign.workspaceId), eq(posts.campaignId, campaign.id))).limit(1);
    if (!post || post.id === experiment.controlPostId || siblings.some((variant) => variant.id !== current.id && variant.postId === post.id)) throw new AppError("validation_failed", "That variant post is not available for this experiment.");
  }
  const [row] = await db.update(experimentVariants).set({ label, variantType, postId, updatedAt: new Date() }).where(and(eq(experimentVariants.id, current.id), eq(experimentVariants.experimentId, experiment.id))).returning();
  if (!row) throw new AppError("conflict", "That variant changed before the update completed.");
  await recordCampaignActivity({ workspaceId: campaign.workspaceId, campaignId: campaign.id, type: "updated", actorId: userId, metadata: { kind: "experiment_variant", experimentId: experiment.id, variantId: row.id }, dedupeKey: `experiment-variant-updated:${row.id}:${row.updatedAt.toISOString()}` });
  return row;
}

export async function transitionExperiment(userId: string, campaignId: string, experimentId: string, status: ExperimentStatus): Promise<ExperimentView> {
  const { campaign, experiment } = await experimentForUser(userId, campaignId, experimentId, "campaigns:update");
  if (!EXPERIMENT_STATUSES.includes(status)) throw new AppError("validation_failed", "That experiment status is not supported.");
  if (status === experiment.status) return { ...experiment, variants: await variantsFor(experiment.id), latestResult: await latestResultFor(campaign.workspaceId, experiment.id) };
  if (!canTransitionExperiment(experiment.status as ExperimentStatus, status)) throw new AppError("conflict", `An experiment cannot move from ${experiment.status} to ${status}.`);
  const variants = await variantsFor(experiment.id);
  if (status === "planned" && variants.length === 0) throw new AppError("validation_failed", "Add at least one variant before planning the experiment.");
  if (status === "running" && variants.every((variant) => !variant.postId)) throw new AppError("validation_failed", "Link at least one variant post before starting the experiment.");
  const now = new Date();
  const [row] = await db.update(experiments).set({ status, startedAt: status === "running" && !experiment.startedAt ? now : experiment.startedAt, endedAt: status === "completed" || status === "cancelled" ? now : experiment.endedAt, updatedAt: now }).where(and(eq(experiments.id, experiment.id), eq(experiments.status, experiment.status))).returning();
  if (!row) throw new AppError("conflict", "That experiment changed before the transition completed.");
  await recordCampaignActivity({ workspaceId: row.workspaceId, campaignId: row.campaignId, type: "updated", actorId: userId, metadata: { kind: "experiment", experimentId: row.id, status: row.status }, dedupeKey: `experiment-status:${row.id}:${row.status}` });
  const event = row.status === "running" ? "experiment_started" : row.status === "paused" ? "experiment_paused" : row.status === "completed" ? "experiment_completed" : row.status === "cancelled" ? "experiment_cancelled" : null;
  if (event) void notifyCampaignOptimizationEvent({ workspaceId: row.workspaceId, campaignId: row.campaignId, event, eventKey: `experiment-status:${row.id}:${row.status}`, experimentId: row.id });
  return { ...row, variants, latestResult: await latestResultFor(campaign.workspaceId, row.id) };
}

function metricValue(row: { performanceScore: number | null; engagementScore: number | null; reachScore: number | null; viewsScore: number | null; goalContribution: number | null }, metric: ExperimentMetric): number | null {
  return metric === "views" ? row.viewsScore : metric === "reach" ? row.reachScore : metric === "impressions" ? row.performanceScore : row.engagementScore;
}

export async function evaluateExperiment(userId: string, campaignId: string, experimentId: string): Promise<ExperimentResultSnapshot> {
  const { context } = await experimentForUser(userId, campaignId, experimentId, "campaigns:update");
  return evaluateExperimentForWorkspace(context.workspaceId, campaignId, experimentId, userId);
}

export async function evaluateExperimentForWorkspace(workspaceId: string, campaignId: string, experimentId: string, actorId: string | null = null): Promise<ExperimentResultSnapshot> {
  const [experiment] = await db.select().from(experiments).where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, workspaceId), eq(experiments.campaignId, campaignId))).limit(1);
  if (!experiment) throw new AppError("not_found", "We couldn't find that experiment.");
  const variants = await variantsFor(experiment.id);
  const postIds = [experiment.controlPostId, ...variants.map((variant) => variant.postId).filter((id): id is string => Boolean(id))];
  const summaries = postIds.length === 0 ? [] : await db.select().from(postIntelligenceSummaries).where(and(eq(postIntelligenceSummaries.workspaceId, workspaceId), eq(postIntelligenceSummaries.campaignId, campaignId), inArray(postIntelligenceSummaries.postId, postIds)));
  const byPost = new Map(summaries.map((summary) => [summary.postId, summary]));
  const control = byPost.get(experiment.controlPostId);
  const controlValue = control ? metricValue(control, experiment.primaryMetric as ExperimentMetric) : null;
  const variantValues: Record<string, number | null> = {};
  const variantSampleSizes: Record<string, number> = {};
  for (const variant of variants) {
    const summary = variant.postId ? byPost.get(variant.postId) : undefined;
    variantValues[variant.id] = summary ? metricValue(summary, experiment.primaryMetric as ExperimentMetric) : null;
    variantSampleSizes[variant.id] = summary?.sampleSize ?? 0;
  }
  const values = Object.values(variantValues).filter((value): value is number => value !== null);
  const requiredSummaries = [control, ...variants.map((variant) => variant.postId ? byPost.get(variant.postId) : undefined)];
  const allAvailable = controlValue !== null && variants.length > 0 && values.length === variants.length && requiredSummaries.every((summary) => summary && summary.sampleSize >= INTELLIGENCE_THRESHOLDS.minimumExperimentSample && summary.confidence !== "insufficient" && summary.state === "fresh");
  const best = allAvailable ? variants.reduce<{ variant: ExperimentVariant | null; value: number }>((current, variant) => { const value = variantValues[variant.id] ?? Number.NEGATIVE_INFINITY; return value > current.value ? { variant, value } : current; }, { variant: null, value: controlValue }).variant : null;
  const bestValue = best ? variantValues[best.id] : null;
  const hasWinner = Boolean(best && bestValue !== null && controlValue !== null && bestValue > controlValue);
  const status = !allAvailable ? "insufficient_data" : hasWinner ? "variant_wins" : variants.every((variant) => (variantValues[variant.id] ?? Number.POSITIVE_INFINITY) < controlValue) ? "control_wins" : "inconclusive";
  const confidence: IntelligenceConfidence = !allAvailable ? "insufficient" : summaries.every((summary) => summary.confidence === "high" && summary.state === "fresh") ? "high" : summaries.some((summary) => summary.confidence === "medium") ? "medium" : "low";
  const evaluatedAt = new Date();
  const priorResult = await latestResultFor(workspaceId, experiment.id);
  const freshness: StatisticalFreshness = requiredSummaries.some((summary) => summary?.state === "stale") ? "stale" : requiredSummaries.some((summary) => summary?.freshness === "aging") ? "aging" : requiredSummaries.every((summary) => summary?.freshness === "fresh") ? "fresh" : "unavailable";
  const statistics = evaluateExperimentStatistics({
    metric: experiment.primaryMetric as ExperimentMetric,
    control: { value: controlValue, sampleSize: control?.sampleSize ?? 0, coverage: control?.analyticsCoverage ?? 0, freshness },
    variants: variants.map((variant) => {
      const summary = variant.postId ? byPost.get(variant.postId) : undefined;
      return { id: variant.id, label: variant.label, value: variantValues[variant.id], sampleSize: summary?.sampleSize ?? 0, coverage: summary?.analyticsCoverage ?? 0, freshness: summary?.freshness as StatisticalFreshness | undefined };
    }),
    startedAt: experiment.startedAt,
    evaluatedAt,
    dataQuality: { coverage: Math.min(...requiredSummaries.map((summary) => summary?.analyticsCoverage ?? 0)), freshness },
    complete: experiment.status === "completed",
  });
  const platformRows = await db.select({ postId: postPlatforms.postId, platform: postPlatforms.platform }).from(postPlatforms).where(inArray(postPlatforms.postId, postIds));
  const platformsByPost = new Map<string, string[]>();
  for (const row of platformRows) platformsByPost.set(row.postId, [...(platformsByPost.get(row.postId) ?? []), row.platform]);
  const controlPlatforms = platformsByPost.get(experiment.controlPostId) ?? [];
  const platformNormalization = normalizePlatformMetrics(variants.flatMap((variant) => (variant.postId ? controlPlatforms.filter((platform) => (platformsByPost.get(variant.postId!) ?? []).includes(platform)).map((platform) => ({ platform, control: { value: controlValue, sampleSize: control?.sampleSize ?? 0, coverage: control?.analyticsCoverage ?? 0 }, variant: { value: variantValues[variant.id], sampleSize: variantSampleSizes[variant.id] ?? 0, coverage: byPost.get(variant.postId!)?.analyticsCoverage ?? 0 } })) : [])));
  const fingerprint = createHash("sha256").update(JSON.stringify({ experimentId: experiment.id, metric: experiment.primaryMetric, algorithmVersion: STATISTICAL_CONFIG.algorithmVersion, control: control?.inputFingerprint ?? null, variants: variants.map((variant) => [variant.id, variant.postId ? byPost.get(variant.postId)?.inputFingerprint ?? null : null]) })).digest("hex");
  const [created] = await db.insert(experimentResultSnapshots).values({ workspaceId, experimentId: experiment.id, algorithmVersion: STATISTICAL_CONFIG.algorithmVersion, inputFingerprint: fingerprint, status, controlValue, variantValues, controlSampleSize: control?.sampleSize ?? 0, variantSampleSizes, confidence, winnerVariantId: statistics.winnerVariantId, statisticalStatus: statistics.statisticalStatus, sampleSize: statistics.sampleSize, controlMetric: statistics.control.metric, variantMetrics: Object.fromEntries(statistics.variants.map((variant) => [variant.id, variant.metric])), absoluteUplifts: Object.fromEntries(statistics.variants.map((variant) => [variant.id, variant.absoluteUplift])), relativeUplifts: Object.fromEntries(statistics.variants.map((variant) => [variant.id, variant.relativeUplift])), confidenceLevel: statistics.mde.confidenceLevel, confidenceIntervals: Object.fromEntries(statistics.variants.map((variant) => [variant.id, variant.confidenceInterval])), mdeAbsolute: statistics.mde.absolute, mdeRelative: statistics.mde.relative, powerEstimate: statistics.power.currentPowerEstimate, targetPower: statistics.power.targetPower, winnerConfidence: statistics.winnerConfidence, durationHours: Math.round(statistics.duration.durationHours), dataQuality: statistics.dataQuality.status, recommendation: statistics.recommendation, statisticalDetails: { sampleSufficiency: statistics.sampleSufficiency, powerStatus: statistics.power.status, durationStatus: statistics.duration.status, coverage: statistics.dataQuality.coverage, freshness: statistics.dataQuality.freshness, reasons: statistics.reasons, variants: statistics.variants, platformNormalization: platformNormalization.platforms, platformAggregate: platformNormalization.aggregate, platformDependent: platformNormalization.platformDependent }, evaluatedAt }).onConflictDoNothing({ target: [experimentResultSnapshots.workspaceId, experimentResultSnapshots.experimentId, experimentResultSnapshots.inputFingerprint] }).returning();
  const result = created ?? await latestResultFor(workspaceId, experiment.id);
  if (!result) throw new AppError("server_error", "We couldn't save the experiment result.");
  if (statistics.winnerVariantId && experiment.status === "running") await db.update(experiments).set({ winnerVariantId: statistics.winnerVariantId, confidence: statistics.winnerConfidence >= 0.8 ? "high" : statistics.winnerConfidence >= 0.6 ? "medium" : "low", updatedAt: evaluatedAt }).where(eq(experiments.id, experiment.id));
  const learningVariant = statistics.variants.find((variant) => variant.id === statistics.winnerVariantId) ?? statistics.variants.find((variant) => variant.status === "promising");
  const learningResult = statistics.winnerVariantId ? "winner" : experiment.status === "completed" ? "inconclusive" : null;
  if (learningResult) {
    await db.insert(experimentLearnings).values({ workspaceId, campaignId, experimentId: experiment.id, platform: null, optimizationDimension: experiment.experimentType, metric: experiment.primaryMetric, observedUplift: learningVariant?.relativeUplift ?? null, confidence: statistics.winnerConfidence, sampleSize: statistics.sampleSize, durationDays: statistics.duration.durationDays, result: learningResult, learningStrength: statistics.winnerConfidence >= 0.9 ? "strong" : statistics.winnerConfidence >= 0.7 ? "moderate" : "weak", evidenceCount: 1, consistency: learningResult === "winner" ? 1 : 0, algorithmVersion: STATISTICAL_CONFIG.algorithmVersion }).onConflictDoNothing({ target: [experimentLearnings.workspaceId, experimentLearnings.experimentId, experimentLearnings.platform] });
  }
  if (created && (!priorResult || priorResult.statisticalStatus !== result.statisticalStatus || priorResult.winnerVariantId !== result.winnerVariantId)) {
    await recordCampaignActivity({ workspaceId, campaignId, type: "updated", actorId, metadata: { kind: "experiment_statistical_transition", experimentId: experiment.id, resultId: result.id, statisticalStatus: result.statisticalStatus, winnerVariantId: result.winnerVariantId, sampleSize: result.sampleSize }, dedupeKey: `experiment-statistical:${experiment.id}:${result.statisticalStatus}:${result.winnerVariantId ?? "none"}` });
    void notifyCampaignOptimizationEvent({ workspaceId, campaignId, event: result.statisticalStatus === "winner" || result.statisticalStatus === "statistically_significant" ? "experiment_winner_detected" : result.statisticalStatus === "insufficient_data" ? "experiment_insufficient_data" : "experiment_statistical_milestone", eventKey: `experiment-statistical:${experiment.id}:${result.statisticalStatus}:${result.winnerVariantId ?? "none"}`, experimentId: experiment.id, resultId: result.id, winnerVariantId: result.winnerVariantId, statisticalStatus: result.statisticalStatus, uplift: result.winnerVariantId ? result.relativeUplifts[result.winnerVariantId] ?? null : null, confidence: result.winnerConfidence, sampleSize: result.sampleSize, evaluatedAt: result.evaluatedAt.toISOString() });
  }
  return result;
}

export async function evaluateRunningExperimentsForWorkspace(workspaceId: string, campaignId: string): Promise<{ evaluated: number; failed: number }> {
  const running = await db.select({ id: experiments.id }).from(experiments).where(and(eq(experiments.workspaceId, workspaceId), eq(experiments.campaignId, campaignId), eq(experiments.status, "running")));
  let evaluated = 0;
  let failed = 0;
  for (const experiment of running) {
    try { await evaluateExperimentForWorkspace(workspaceId, campaignId, experiment.id); evaluated += 1; }
    catch (error) { failed += 1; logger.error("experiment evaluation failed", { experimentId: experiment.id, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { evaluated, failed };
}

export async function listExperimentResultHistory(userId: string, campaignId: string, experimentId: string, page = 1, pageSize = 20): Promise<{ items: ExperimentResultSnapshot[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const { context } = await experimentForUser(userId, campaignId, experimentId, "campaigns:view");
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize)));
  const rows = await db.select().from(experimentResultSnapshots).where(and(eq(experimentResultSnapshots.workspaceId, context.workspaceId), eq(experimentResultSnapshots.experimentId, experimentId))).orderBy(desc(experimentResultSnapshots.evaluatedAt), desc(experimentResultSnapshots.id));
  const start = (safePage - 1) * safePageSize;
  return { items: rows.slice(start, start + safePageSize), page: safePage, pageSize: safePageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / safePageSize)) };
}

export async function getExperimentStatistics(userId: string, campaignId: string, experimentId: string): Promise<ExperimentResultSnapshot | null> {
  const { context } = await experimentForUser(userId, campaignId, experimentId, "campaigns:view");
  return latestResultFor(context.workspaceId, experimentId);
}

export async function getExperimentLearning(userId: string, campaignId: string, page = 1, pageSize = 20): Promise<{ items: typeof experimentLearnings.$inferSelect[]; summary: { totalExperiments: number; winners: number; inconclusive: number; averageUplift: number | null; averageDurationDays: number | null; strongestOptimization: string | null; evidenceCount: number }; page: number; pageSize: number; total: number; totalPages: number }> {
  const { context } = await campaignForUser(userId, campaignId, "campaigns:view");
  const rows = await db.select().from(experimentLearnings).where(and(eq(experimentLearnings.workspaceId, context.workspaceId), eq(experimentLearnings.campaignId, campaignId))).orderBy(desc(experimentLearnings.createdAt), desc(experimentLearnings.id));
  const safePage = Math.max(1, Math.floor(page)); const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize)));
  const winners = rows.filter((row) => row.result === "winner");
  const upliftRows = rows.map((row) => row.observedUplift).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const durations = rows.map((row) => row.durationDays).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const byDimension = new Map<string, number>(); for (const row of rows) byDimension.set(row.optimizationDimension, (byDimension.get(row.optimizationDimension) ?? 0) + 1);
  const strongestOptimization = [...byDimension.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const start = (safePage - 1) * safePageSize;
  return { items: rows.slice(start, start + safePageSize), summary: { totalExperiments: rows.length, winners: winners.length, inconclusive: rows.filter((row) => row.result === "inconclusive").length, averageUplift: upliftRows.length ? upliftRows.reduce((sum, value) => sum + value, 0) / upliftRows.length : null, averageDurationDays: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null, strongestOptimization, evidenceCount: rows.reduce((sum, row) => sum + row.evidenceCount, 0) }, page: safePage, pageSize: safePageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / safePageSize)) };
}
