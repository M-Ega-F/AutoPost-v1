import "server-only";

import { and, eq, isNotNull, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { postReviewAutomationEvents, postReviewEvents, posts, workspaceMembers, workspaces } from "@/lib/db/schema";
import { notifyReviewAutomationEvent, type ReviewAutomationEvent } from "@/lib/domain/notifications";
import { logger } from "@/lib/logger";

export const REVIEW_AUTOMATION_POLICY = {
  firstReminderMs: 24 * 60 * 60_000,
  secondReminderMs: 6 * 60 * 60_000,
  escalationAfterMs: 24 * 60 * 60_000,
  maxCandidates: 500,
} as const;

export type ReviewAutomationCandidate = {
  postId: string;
  workspaceId: string;
  reviewerId: string;
  reviewDueAt: Date;
};

export type ReviewAutomationRun = {
  candidates: number;
  claimed: number;
  skipped: number;
  failed: number;
};

export function automationEventKey(candidate: ReviewAutomationCandidate, event: ReviewAutomationEvent): string {
  return `${candidate.postId}:${candidate.reviewerId}:${candidate.reviewDueAt.toISOString()}:${event}`;
}

export function eventsDueForReview(candidate: ReviewAutomationCandidate, now = Date.now()): ReviewAutomationEvent[] {
  const remaining = candidate.reviewDueAt.getTime() - now;
  const events: ReviewAutomationEvent[] = [];
  if (remaining > 0 && remaining <= REVIEW_AUTOMATION_POLICY.firstReminderMs) events.push("deadline_approaching_24h");
  if (remaining > 0 && remaining <= REVIEW_AUTOMATION_POLICY.secondReminderMs) events.push("deadline_approaching_6h");
  if (remaining <= 0) events.push("overdue");
  if (remaining <= -REVIEW_AUTOMATION_POLICY.escalationAfterMs) events.push("escalated");
  return events;
}

async function activeCandidates(now: Date): Promise<ReviewAutomationCandidate[]> {
  const rows = await db.select({ postId: posts.id, workspaceId: posts.workspaceId, reviewerId: posts.assignedReviewerId, reviewDueAt: posts.reviewDueAt }).from(posts).innerJoin(workspaces, eq(workspaces.id, posts.workspaceId)).innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, posts.workspaceId), eq(workspaceMembers.userId, posts.assignedReviewerId))).where(and(eq(workspaces.approvalRequired, true), eq(posts.approvalStatus, "in_review"), isNotNull(posts.assignedReviewerId), isNotNull(posts.reviewDueAt), lte(posts.reviewDueAt, new Date(now.getTime() + REVIEW_AUTOMATION_POLICY.firstReminderMs)))).orderBy(posts.reviewDueAt).limit(REVIEW_AUTOMATION_POLICY.maxCandidates);
  return rows.flatMap((row) => row.reviewerId && row.reviewDueAt ? [{ postId: row.postId, workspaceId: row.workspaceId, reviewerId: row.reviewerId, reviewDueAt: row.reviewDueAt }] : []);
}

function auditAction(event: ReviewAutomationEvent): "deadline_approaching" | "reminder_sent" | "overdue" | "escalated" {
  return event === "deadline_approaching_24h" ? "deadline_approaching" : event === "deadline_approaching_6h" ? "reminder_sent" : event;
}

async function claimEvent(candidate: ReviewAutomationCandidate, event: ReviewAutomationEvent): Promise<string | null> {
  const eventKey = automationEventKey(candidate, event);
  const result = await db.transaction(async (tx) => {
    const [claim] = await tx.insert(postReviewAutomationEvents).values({ workspaceId: candidate.workspaceId, postId: candidate.postId, reviewerId: candidate.reviewerId, eventType: event, eventKey, reviewDueAt: candidate.reviewDueAt }).onConflictDoNothing({ target: [postReviewAutomationEvents.workspaceId, postReviewAutomationEvents.eventKey] }).returning({ id: postReviewAutomationEvents.id });
    if (!claim) return null;
    const [audit] = await tx.insert(postReviewEvents).values({ postId: candidate.postId, workspaceId: candidate.workspaceId, action: auditAction(event), actorId: null, comment: "System automation" }).returning({ id: postReviewEvents.id });
    return audit?.id ?? claim.id;
  });
  return result;
}

export async function processReviewAutomationBatch(now = new Date()): Promise<ReviewAutomationRun> {
  const candidates = await activeCandidates(now);
  const result: ReviewAutomationRun = { candidates: candidates.length, claimed: 0, skipped: 0, failed: 0 };
  for (const candidate of candidates) {
    for (const event of eventsDueForReview(candidate, now.getTime())) {
      try {
        const eventId = await claimEvent(candidate, event);
        if (!eventId) {
          result.skipped += 1;
          continue;
        }
        result.claimed += 1;
        await notifyReviewAutomationEvent({ postId: candidate.postId, workspaceId: candidate.workspaceId, reviewerId: candidate.reviewerId, eventId, event, reviewDueAt: candidate.reviewDueAt });
      } catch (error) {
        result.failed += 1;
        logger.error("review automation event failed", { postId: candidate.postId, event, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return result;
}
