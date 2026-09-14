"use client";

import { Copy, FilePlus2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspacePermission } from "@/components/auth/workspace-permissions";

export function ReuseActions({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"duplicate" | "template" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const canDuplicate = useWorkspacePermission("posts:duplicate");
  const canSaveTemplate = useWorkspacePermission("templates:create");

  async function duplicate() {
    setBusy("duplicate");
    try {
      const response = await fetch(`/api/posts/${postId}/duplicate`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { postId?: string; error?: { message?: string } } | null;
      if (!response.ok || !payload?.postId) throw new Error(payload?.error?.message ?? "We couldn't duplicate this post.");
      toast.success("Draft created from this post.");
      router.push(`/drafts/${payload.postId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't duplicate this post.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAsTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy("template");
    try {
      const response = await fetch(`/api/posts/${postId}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "We couldn't save this template.");
      setDialogOpen(false);
      setName("");
      toast.success("Template saved.");
      router.push("/templates");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't save this template.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canDuplicate ? <Button variant="outline" size="sm" onClick={() => void duplicate()} disabled={busy !== null}>
        {busy === "duplicate" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {busy === "duplicate" ? "Duplicating…" : "Duplicate"}
      </Button> : null}
      {canSaveTemplate ? <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)} disabled={busy !== null}>
        <FilePlus2 aria-hidden="true" />
        Save as template
      </Button> : null}

      {canSaveTemplate ? <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>Keep this caption, media and platform choices ready for another draft.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveAsTemplate}>
            <div className="space-y-2">
              <label htmlFor="template-name" className="text-sm font-medium">Template name</label>
              <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus placeholder="Weekend launch" required />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={busy === "template"}>Cancel</Button>
              <Button type="submit" disabled={busy === "template" || !name.trim()}>
                {busy === "template" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Save template
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog> : null}
    </div>
  );
}
