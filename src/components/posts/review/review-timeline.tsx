import type { PostReview } from "@/lib/domain/post-approvals";

const labels = { submitted: "Submitted for review", approved: "Approved", changes_requested: "Changes requested", resubmitted: "Resubmitted", invalidated: "Approval invalidated" } as const;

export function ReviewTimeline({ history }: { history: PostReview["history"] }) {
  if (history.length === 0) return <p className="text-sm text-muted-foreground">No review activity yet.</p>;
  return <ol className="space-y-3" aria-label="Review history">{history.map((event) => <li key={event.id} className="border-l-2 border-border pl-3"><p className="text-sm font-medium">{labels[event.action]}</p><p className="text-xs text-muted-foreground">{event.createdAt.toLocaleString()}</p>{event.comment ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.comment}</p> : null}</li>)}</ol>;
}
