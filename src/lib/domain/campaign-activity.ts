import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { campaignActivity, campaigns, type CampaignActivity } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type CampaignActivityType =
  | "created"
  | "updated"
  | "goal_updated"
  | "activated"
  | "completed"
  | "archived"
  | "restored"
  | "post_added"
  | "post_removed"
  | "post_approved"
  | "post_published"
  | "post_failed"
  | "goal_milestone"
  | "goal_completed"
  | "health_changed"
  | "deadline_warning"
  | "deadline_overdue"
  | "publishing_issue"
  | "approval_bottleneck"
  | "intelligence_updated"
  | "content_underperforming"
  | "recommendation_created";

export type CampaignActivityItem = CampaignActivity;

export type CampaignActivityQuery = {
  page: number;
  pageSize: number;
};

export type PaginatedCampaignActivity = {
  items: CampaignActivityItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function recordCampaignActivity(input: {
  workspaceId: string;
  campaignId: string;
  type: CampaignActivityType;
  actorId?: string | null;
  postId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
}): Promise<CampaignActivity | null> {
  const [row] = await db
    .insert(campaignActivity)
    .values({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      type: input.type,
      actorId: input.actorId ?? null,
      postId: input.postId ?? null,
      metadata: input.metadata ?? {},
      dedupeKey: input.dedupeKey ?? null,
    })
    // The dedupe index is partial because null dedupe keys must remain repeatable;
    // omit a conflict target so PostgreSQL can match the partial unique index.
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function listCampaignActivity(
  userId: string,
  campaignId: string,
  query: CampaignActivityQuery,
): Promise<PaginatedCampaignActivity> {
  const authorization = await requireWorkspacePermission(userId, "campaigns:view");
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, authorization.workspaceId)))
    .limit(1);
  if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");

  const where = eq(campaignActivity.campaignId, campaignId);
  const [countRows, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(campaignActivity).where(where),
    db
      .select()
      .from(campaignActivity)
      .where(where)
      .orderBy(desc(campaignActivity.occurredAt), desc(campaignActivity.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
