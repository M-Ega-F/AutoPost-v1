"use client";

import { useCallback, useEffect, useState } from "react";

import { ReviewActions } from "@/components/posts/review/review-actions";
import { ReviewManagement } from "@/components/posts/review/review-management";
import { ReviewStatusBadge } from "@/components/posts/review/review-status-badge";
import { ReviewTimeline } from "@/components/posts/review/review-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReviewDetail } from "@/lib/domain/reviews";

export function ReviewPanel({ postId }: { postId: string }) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/posts/${postId}/review`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { review?: ReviewDetail & { requestedAt?: string | null; reviewDueAt?: string | null; approvedAt?: string | null; comments?: Array<{ createdAt: string; updatedAt: string }> }; error?: { message?: string } } | null;
    if (!response.ok || !data?.review) { setError(data?.error?.message ?? "Approval details are unavailable."); return; }
    setReview({ ...data.review, requestedAt: data.review.requestedAt ? new Date(data.review.requestedAt) : null, reviewDueAt: data.review.reviewDueAt ? new Date(data.review.reviewDueAt) : null, approvedAt: data.review.approvedAt ? new Date(data.review.approvedAt) : null, history: data.review.history.map((event) => ({ ...event, createdAt: new Date(event.createdAt) })), comments: (data.review.comments ?? []).map((comment) => ({ ...comment, createdAt: new Date(comment.createdAt), updatedAt: new Date(comment.updatedAt) })) });
  }, [postId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (error) return null;
  if (!review) return <Card><CardContent className="py-5 text-sm text-muted-foreground">Loading approval status…</CardContent></Card>;
  return <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2">Content approval <ReviewStatusBadge status={review.status} /></CardTitle><CardDescription>{review.approvalRequired ? "Publishing requires an owner or admin approval." : "Approval is optional in this workspace."}</CardDescription></CardHeader><CardContent className="space-y-4"><ReviewActions postId={postId} status={review.status} onComplete={load} /><ReviewTimeline history={review.history} /><ReviewManagement review={review} onComplete={load} /></CardContent></Card>;
}
