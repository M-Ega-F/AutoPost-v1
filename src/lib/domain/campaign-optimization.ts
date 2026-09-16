import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { recordCampaignActivity } from "@/lib/domain/campaign-activity";
import { notifyCampaignOptimizationEvent } from "@/lib/domain/notifications";
import { db } from "@/lib/db";
import { campaignIntelligenceSnapshots, campaignOptimizationActions, campaigns, type CampaignOptimizationAction } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

export const OPTIMIZATION_ACTION_TYPES = ["create_variant", "change_format", "change_platform", "change_posting_time", "test_hook", "test_caption"] as const;
export type OptimizationActionType = (typeof OPTIMIZATION_ACTION_TYPES)[number];
export const OPTIMIZATION_ACTION_STATUSES = ["proposed", "accepted", "in_progress", "completed", "dismissed", "cancelled", "failed"] as const;
export type OptimizationActionStatus = (typeof OPTIMIZATION_ACTION_STATUSES)[number];

export type OptimizationActionView = Omit<CampaignOptimizationAction, "sourceSnapshotId" | "createdBy" | "assignedTo"> & {
  sourceSnapshotId: string | null;
  createdBy: string;
  assignedTo: string | null;
};

const transitions: Record<OptimizationActionStatus, readonly OptimizationActionStatus[]> = {
  proposed: ["accepted", "dismissed", "cancelled"],
  accepted: ["in_progress", "dismissed", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: [],
  dismissed: [],
  cancelled: [],
  failed: ["in_progress", "cancelled"],
};

export function canTransitionOptimizationAction(from: OptimizationActionStatus, to: OptimizationActionStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

function toView(row: CampaignOptimizationAction): OptimizationActionView {
  return { ...row, sourceSnapshotId: row.sourceSnapshotId, createdBy: row.createdBy, assignedTo: row.assignedTo };
}

async function campaignForUser(userId: string, campaignId: string, permission: "campaigns:view" | "campaigns:update") {
  const context = await requireWorkspacePermission(userId, permission);
  const [campaign] = await db.select({ id: campaigns.id, workspaceId: campaigns.workspaceId }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, context.workspaceId))).limit(1);
  if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");
  return { context, campaign };
}

export async function listOptimizationActions(userId: string, campaignId: string): Promise<OptimizationActionView[]> {
  const { campaign } = await campaignForUser(userId, campaignId, "campaigns:view");
  const rows = await db.select().from(campaignOptimizationActions).where(and(eq(campaignOptimizationActions.workspaceId, campaign.workspaceId), eq(campaignOptimizationActions.campaignId, campaign.id))).orderBy(desc(campaignOptimizationActions.createdAt), desc(campaignOptimizationActions.id));
  return rows.map(toView);
}

export async function getOptimizationAction(userId: string, campaignId: string, actionId: string): Promise<OptimizationActionView> {
  const { campaign } = await campaignForUser(userId, campaignId, "campaigns:view");
  const [row] = await db.select().from(campaignOptimizationActions).where(and(eq(campaignOptimizationActions.id, actionId), eq(campaignOptimizationActions.workspaceId, campaign.workspaceId), eq(campaignOptimizationActions.campaignId, campaign.id))).limit(1);
  if (!row) throw new AppError("not_found", "We couldn't find that optimization action.");
  return toView(row);
}

export async function createOptimizationAction(userId: string, campaignId: string, input: { title: string; description?: string | null; actionType: OptimizationActionType; sourceSnapshotId?: string | null }): Promise<OptimizationActionView> {
  const { context, campaign } = await campaignForUser(userId, campaignId, "campaigns:update");
  const title = input.title.trim();
  if (!title || title.length > 160) throw new AppError("validation_failed", "Action title must be between 1 and 160 characters.");
  if (!OPTIMIZATION_ACTION_TYPES.includes(input.actionType)) throw new AppError("validation_failed", "That optimization action type is not supported.");
  let sourceFingerprint: string | null = null;
  if (input.sourceSnapshotId) {
    const [snapshot] = await db.select({ id: campaignIntelligenceSnapshots.id, inputFingerprint: campaignIntelligenceSnapshots.inputFingerprint }).from(campaignIntelligenceSnapshots).where(and(eq(campaignIntelligenceSnapshots.id, input.sourceSnapshotId), eq(campaignIntelligenceSnapshots.workspaceId, campaign.workspaceId), eq(campaignIntelligenceSnapshots.campaignId, campaign.id))).limit(1);
    if (!snapshot) throw new AppError("not_found", "That intelligence snapshot is not part of this campaign.");
    sourceFingerprint = createHash("sha256").update(`${snapshot.inputFingerprint}:${input.actionType}`).digest("hex");
  }
  const existing = await db.select({ id: campaignOptimizationActions.id }).from(campaignOptimizationActions).where(and(eq(campaignOptimizationActions.workspaceId, campaign.workspaceId), eq(campaignOptimizationActions.campaignId, campaign.id), eq(campaignOptimizationActions.title, title), inArray(campaignOptimizationActions.status, ["proposed", "accepted", "in_progress"] as const))).limit(1);
  if (existing.length > 0) throw new AppError("conflict", "An active optimization action with that title already exists.");
  const [created] = await db.insert(campaignOptimizationActions).values({ workspaceId: context.workspaceId, campaignId: campaign.id, sourceSnapshotId: input.sourceSnapshotId ?? null, sourceFingerprint, title, description: input.description?.trim().slice(0, 2000) ?? null, actionType: input.actionType, status: "proposed", createdBy: userId }).onConflictDoNothing({ target: [campaignOptimizationActions.workspaceId, campaignOptimizationActions.campaignId, campaignOptimizationActions.sourceFingerprint] }).returning();
  const row = created ?? (sourceFingerprint ? (await db.select().from(campaignOptimizationActions).where(and(eq(campaignOptimizationActions.workspaceId, campaign.workspaceId), eq(campaignOptimizationActions.campaignId, campaign.id), eq(campaignOptimizationActions.sourceFingerprint, sourceFingerprint))).limit(1))[0] : undefined);
  if (!row) throw new AppError("server_error", "We couldn't create that optimization action.");
  await recordCampaignActivity({ workspaceId: row.workspaceId, campaignId: row.campaignId, type: "updated", actorId: userId, metadata: { kind: "optimization_action", optimizationActionId: row.id, actionType: row.actionType, status: row.status }, dedupeKey: `optimization-action-created:${row.id}` });
  void notifyCampaignOptimizationEvent({ workspaceId: row.workspaceId, campaignId: row.campaignId, event: "action_created", eventKey: `optimization-action-created:${row.id}`, optimizationActionId: row.id });
  return toView(row);
}

export async function updateOptimizationAction(userId: string, campaignId: string, actionId: string, input: { title?: string; description?: string | null }): Promise<OptimizationActionView> {
  const { campaign } = await campaignForUser(userId, campaignId, "campaigns:update");
  const [existing] = await db.select().from(campaignOptimizationActions).where(and(eq(campaignOptimizationActions.id, actionId), eq(campaignOptimizationActions.workspaceId, campaign.workspaceId), eq(campaignOptimizationActions.campaignId, campaign.id))).limit(1);
  if (!existing) throw new AppError("not_found", "We couldn't find that optimization action.");
  if (!["proposed", "accepted"].includes(existing.status)) throw new AppError("conflict", "That optimization action can no longer be edited.");
  const title = input.title === undefined ? existing.title : input.title.trim();
  if (!title || title.length > 160) throw new AppError("validation_failed", "Action title must be between 1 and 160 characters.");
  const [row] = await db.update(campaignOptimizationActions).set({ title, description: input.description === undefined ? existing.description : input.description?.trim().slice(0, 2000) ?? null, updatedAt: new Date() }).where(and(eq(campaignOptimizationActions.id, actionId), eq(campaignOptimizationActions.status, existing.status))).returning();
  if (!row) throw new AppError("conflict", "That optimization action changed before the update completed.");
  await recordCampaignActivity({ workspaceId: row.workspaceId, campaignId: row.campaignId, type: "updated", actorId: userId, metadata: { kind: "optimization_action", optimizationActionId: row.id, actionType: row.actionType, status: row.status }, dedupeKey: `optimization-action-updated:${row.id}:${row.updatedAt.toISOString()}` });
  return toView(row);
}

export async function transitionOptimizationAction(userId: string, campaignId: string, actionId: string, status: OptimizationActionStatus): Promise<OptimizationActionView> {
  const { campaign } = await campaignForUser(userId, campaignId, "campaigns:update");
  if (!OPTIMIZATION_ACTION_STATUSES.includes(status)) throw new AppError("validation_failed", "That action status is not supported.");
  const [existing] = await db.select().from(campaignOptimizationActions).where(and(eq(campaignOptimizationActions.id, actionId), eq(campaignOptimizationActions.workspaceId, campaign.workspaceId), eq(campaignOptimizationActions.campaignId, campaign.id))).limit(1);
  if (!existing) throw new AppError("not_found", "We couldn't find that optimization action.");
  if (existing.status === status) return toView(existing);
  if (!canTransitionOptimizationAction(existing.status as OptimizationActionStatus, status)) throw new AppError("conflict", `An action cannot move from ${existing.status} to ${status}.`);
  const now = new Date();
  const [row] = await db.update(campaignOptimizationActions).set({ status, startedAt: status === "in_progress" ? now : existing.startedAt, completedAt: status === "completed" ? now : existing.completedAt, updatedAt: now }).where(and(eq(campaignOptimizationActions.id, actionId), eq(campaignOptimizationActions.status, existing.status))).returning();
  if (!row) throw new AppError("conflict", "That optimization action changed before the transition completed.");
  await recordCampaignActivity({ workspaceId: row.workspaceId, campaignId: row.campaignId, type: "updated", actorId: userId, metadata: { kind: "optimization_action", optimizationActionId: row.id, actionType: row.actionType, status: row.status }, dedupeKey: `optimization-action-status:${row.id}:${row.status}` });
  if (row.status === "completed") void notifyCampaignOptimizationEvent({ workspaceId: row.workspaceId, campaignId: row.campaignId, event: "action_completed", eventKey: `optimization-action-completed:${row.id}`, optimizationActionId: row.id });
  return toView(row);
}
