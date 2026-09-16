"use client";

import { MessageSquare, Pencil, Reply, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewComment, ReviewDetail } from "@/lib/domain/reviews";
import { formatDateTime } from "@/lib/time";

type Member = { userId: string; displayName: string; role: "owner" | "admin" | "editor" | "viewer" };

function localDateTimeValue(value: Date | null): string { return value ? value.toISOString().slice(0, 16) : ""; }

function commentLabel(comment: ReviewComment, review: ReviewDetail): string {
  if (comment.authorId === review.viewerId) return "You";
  if (comment.authorId === review.requesterId) return "Post author";
  return "Team member";
}

export function ReviewManagement({ review, onComplete }: { review: ReviewDetail; onComplete: () => Promise<void> }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(localDateTimeValue(review.reviewDueAt));
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    if (!review.capabilities.canAssignReviewer) return;
    void fetch("/api/workspace/members", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { members?: Member[] };
      setMembers((data.members ?? []).filter((member) => member.role === "owner" || member.role === "admin"));
    }).catch(() => undefined);
  }, [review.capabilities.canAssignReviewer]);

  const comments = useMemo(() => {
    const roots = review.comments.filter((item) => !item.parentCommentId);
    const replies = new Map<string, ReviewComment[]>();
    for (const item of review.comments) if (item.parentCommentId) replies.set(item.parentCommentId, [...(replies.get(item.parentCommentId) ?? []), item]);
    return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
  }, [review.comments]);

  async function update(path: string, options: RequestInit, label: string, success = "Review updated.") {
    setBusy(label);
    try {
      const response = await fetch(path, options);
      const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "The review update failed.");
      toast.success(success);
      await onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The review update failed.");
    } finally { setBusy(null); }
  }

  async function addComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    await update(`/api/posts/${review.postId}/review/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: comment, parentCommentId: replyTo }) }, "comment", replyTo ? "Reply added." : "Comment added.");
    setComment(""); setReplyTo(null);
  }

  async function saveEdit(item: ReviewComment) {
    if (!editBody.trim()) return;
    await update(`/api/posts/${review.postId}/review/comments/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: editBody }) }, `edit:${item.id}`, "Comment updated.");
    setEditingId(null); setEditBody("");
  }

  function renderComment(item: ReviewComment, isReply = false) {
    const own = item.authorId === review.viewerId && !item.deletedAt;
    const editing = editingId === item.id;
    return <div className={isReply ? "border-l border-border pl-3" : "rounded-md border border-border bg-muted/40 p-3"}>
      {editing ? <div className="flex flex-col gap-2"><Textarea value={editBody} maxLength={2000} onChange={(event) => setEditBody(event.target.value)} /><div className="flex gap-2"><Button type="button" size="sm" disabled={busy !== null} onClick={() => void saveEdit(item)}>Save</Button><Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button></div></div> : <>
        <p className={item.deletedAt ? "text-sm italic text-muted-foreground" : "whitespace-pre-wrap break-words text-sm"}>{item.deletedAt ? "This comment was deleted." : item.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">{commentLabel(item, review)} · {formatDateTime(item.createdAt, review.timezone)}{item.editedAt ? " · Edited" : ""}{item.resolvedAt ? " · Resolved" : ""}</p>
        {!item.deletedAt ? <div className="mt-2 flex flex-wrap gap-1">
          {!isReply && review.capabilities.canComment ? <Button type="button" variant="ghost" size="sm" onClick={() => setReplyTo(item.id)}><Reply data-icon="inline-start" />Reply</Button> : null}
          {own ? <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(item.id); setEditBody(item.body); }}><Pencil data-icon="inline-start" />Edit</Button> : null}
          {own ? <Button type="button" variant="ghost" size="sm" onClick={() => { if (window.confirm("Delete this comment?")) void update(`/api/posts/${review.postId}/review/comments/${item.id}`, { method: "DELETE" }, `delete:${item.id}`, "Comment deleted."); }}><Trash2 data-icon="inline-start" />Delete</Button> : null}
          {!isReply && review.capabilities.canResolveComments ? <Button type="button" variant="ghost" size="sm" onClick={() => void update(`/api/posts/${review.postId}/review/comments/${item.id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved: !item.resolvedAt }) }, `resolve:${item.id}`, item.resolvedAt ? "Discussion reopened." : "Discussion resolved.")}>{item.resolvedAt ? "Reopen" : "Resolve"}</Button> : null}
        </div> : null}
      </>}
    </div>;
  }

  return <div className="flex flex-col gap-4 border-t border-border pt-4">
    {review.capabilities.canAssignReviewer ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="reviewer-select"><span className="flex items-center gap-2"><UserRound aria-hidden="true" />Reviewer</span><select id="reviewer-select" value={review.assignedReviewerId ?? ""} onChange={(event) => void update(`/api/posts/${review.postId}/reviewer`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerId: event.target.value || null }) }, "reviewer")} disabled={busy !== null} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><option value="">Any reviewer</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} ({member.role})</option>)}</select></label></div> : null}
    {review.capabilities.canEditDeadline ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="review-deadline"><span>Review deadline <span className="font-normal text-muted-foreground">(UTC)</span></span><Input id="review-deadline" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><div className="flex gap-2"><Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => void update(`/api/posts/${review.postId}/review/deadline`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewDueAt: deadline ? new Date(deadline).toISOString() : null }) }, "deadline")}>Save deadline</Button>{review.reviewDueAt ? <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setDeadline(""); void update(`/api/posts/${review.postId}/review/deadline`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewDueAt: null }) }, "deadline"); }}>Clear</Button> : null}</div></div> : review.reviewDueAt ? <p className="text-sm text-muted-foreground">Deadline: {formatDateTime(review.reviewDueAt, review.timezone)}</p> : null}
    {review.capabilities.canWithdraw ? <Button type="button" variant="danger" size="sm" disabled={busy !== null} onClick={() => { if (window.confirm("Withdraw this post from review? It will return to draft.")) void update(`/api/posts/${review.postId}/withdraw-review`, { method: "POST" }, "withdraw"); }}>Withdraw review</Button> : null}
    {review.capabilities.canComment ? <form onSubmit={(event) => void addComment(event)} className="flex flex-col gap-2"><label className="flex items-center gap-2 text-sm font-medium" htmlFor="review-comment"><MessageSquare aria-hidden="true" />{replyTo ? "Reply to discussion" : "Discussion"}</label>{replyTo ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setReplyTo(null)}>Cancel reply</Button> : null}<Textarea id="review-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Add context or mention a teammate with @DisplayName." /><Button type="submit" size="sm" disabled={!comment.trim() || busy !== null}>Add {replyTo ? "reply" : "comment"}</Button></form> : null}
    {comments.length > 0 ? <ol className="flex flex-col gap-3" aria-label="Review discussion">{comments.map(({ root, replies }) => <li key={root.id} className="flex flex-col gap-2">{renderComment(root)}{replies.length > 0 ? <div className="flex flex-col gap-2">{replies.map((reply) => <div key={reply.id}>{renderComment(reply, true)}</div>)}</div> : null}</li>)}</ol> : null}
  </div>;
}
