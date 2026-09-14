"use client";

import { useCallback, useEffect, useState } from "react";

import { ReviewActions } from "@/components/posts/review/review-actions";
import { ReviewStatusBadge } from "@/components/posts/review/review-status-badge";
import { ReviewTimeline } from "@/components/posts/review/review-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostReview } from "@/lib/domain/post-approvals";

export function ReviewPanel({ postId }: { postId: string }) {
  const [review, setReview] = useState<PostReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/posts/${postId}/review`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { review?: PostReview; error?: { message?: string } } | null;
    if (!response.ok || !data?.review) { setError(data?.error?.message ?? "Approval details are unavailable."); return; }
    setReview({ ...data.review, history: data.review.history.map((event) => ({ ...event, createdAt: new Date(event.createdAt) })) });
  }, [postId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (error) return null;
  if (!review) return <Card><CardContent className="py-5 text-sm text-muted-foreground">Loading approval status…</CardContent></Card>;
  return <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2">Content approval <ReviewStatusBadge status={review.status} /></CardTitle><CardDescription>{review.approvalRequired ? "Publishing requires an owner or admin approval." : "Approval is optional in this workspace."}</CardDescription></CardHeader><CardContent className="space-y-4"><ReviewActions postId={postId} status={review.status} onComplete={load} /><ReviewTimeline history={review.history} /></CardContent></Card>;
}
