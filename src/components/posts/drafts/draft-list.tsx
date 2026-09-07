"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/time";
import { PLATFORM_META } from "@/lib/status";
import type { DraftSummary } from "@/lib/domain/types";

export function DraftList({ drafts }: { drafts: DraftSummary[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function removeDraft(id: string) {
    setDeleting(id);
    try {
      const response = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "We couldn't delete this draft.");
      }
      toast.success("Draft deleted.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't delete this draft.");
    } finally {
      setDeleting(null);
    }
  }

  if (drafts.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">No drafts yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Save a post while you are creating it and it will stay here.</p>
        <Button asChild className="mt-5"><Link href="/create-post">Create a draft</Link></Button>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {drafts.map((draft) => (
        <Card key={draft.id} className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="line-clamp-3 whitespace-pre-wrap text-sm">
                {draft.contentText.trim() || "Untitled draft"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {formatDateTime(draft.updatedAt, draft.timezone)}
              </p>
            </div>
            <Badge variant="neutral">Draft</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {draft.hasMedia ? <span className="inline-flex items-center gap-1"><ImageIcon className="size-3" /> Media attached</span> : null}
            {draft.platforms.map((target) => <span key={target.id}>{PLATFORM_META[target.platform].label}</span>)}
            {draft.platforms.length === 0 ? <span>No platforms selected</span> : null}
          </div>

          <div className="mt-auto flex justify-end gap-2">
            <Button asChild variant="outline"><Link href={`/drafts/${draft.id}`}>Continue editing</Link></Button>
            <Button variant="ghost" size="icon" aria-label="Delete draft" disabled={deleting === draft.id} onClick={() => void removeDraft(draft.id)}>
              {deleting === draft.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
