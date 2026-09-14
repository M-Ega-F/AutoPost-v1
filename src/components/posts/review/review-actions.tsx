"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalStatus } from "@/lib/domain/post-approvals";

export function ReviewActions({ postId, status, onComplete }: { postId: string; status: ApprovalStatus; onComplete: () => Promise<void>; }) {
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [comment, setComment] = useState("");
  async function call(path: string, body?: object) {
    setBusy(true);
    try {
      const response = await fetch(`/api/posts/${postId}/${path}`, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "The review action failed.");
      toast.success("Review updated.");
      setDialogOpen(false);
      setComment("");
      await onComplete();
    } catch (error) { toast.error(error instanceof Error ? error.message : "The review action failed."); } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap gap-2">{(status === "draft" || status === "changes_requested") ? <Button size="sm" onClick={() => void call("submit-review")} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null}{status === "changes_requested" ? "Resubmit for review" : "Submit for review"}</Button> : null}{status === "in_review" ? <><Button size="sm" onClick={() => void call("approve")} disabled={busy}>Approve</Button><Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} disabled={busy}>Request changes</Button></> : null}<Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>Request changes</DialogTitle></DialogHeader><Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="Explain what should be updated before publishing." autoFocus /><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>Cancel</Button><Button onClick={() => void call("request-changes", { comment })} disabled={busy || !comment.trim()}>{busy ? "Sending…" : "Request changes"}</Button></DialogFooter></DialogContent></Dialog></div>;
}
