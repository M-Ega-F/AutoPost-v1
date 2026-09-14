"use client";

import { Copy, FilePlus2, Image as ImageIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ContentTemplateSummary } from "@/lib/domain/types";
import { PLATFORM_META } from "@/lib/status";
import { formatDateTime } from "@/lib/time";
import { useWorkspacePermission } from "@/components/auth/workspace-permissions";

export function TemplateList({ templates }: { templates: ContentTemplateSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const canUse = useWorkspacePermission("templates:use");
  const canEdit = useWorkspacePermission("templates:update");
  const canDelete = useWorkspacePermission("templates:delete");
  const canCreate = useWorkspacePermission("templates:create");

  async function handleUseTemplate(id: string) {
    setBusy(`use:${id}`);
    try {
      const response = await fetch(`/api/templates/${id}/use`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { postId?: string; error?: { message?: string } } | null;
      if (!response.ok || !payload?.postId) throw new Error(payload?.error?.message ?? "We couldn't use this template.");
      toast.success("Draft created from template.");
      router.push(`/drafts/${payload.postId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't use this template.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteTemplate(id: string) {
    setBusy(`delete:${id}`);
    try {
      const response = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "We couldn't delete this template.");
      toast.success("Template deleted.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't delete this template.");
    } finally {
      setBusy(null);
    }
  }

  if (templates.length === 0) {
    return (
      <Card className="border-dashed p-10">
        <EmptyState icon={FilePlus2} title="No templates yet" body="Save a post as a template or create reusable content from scratch." action={canCreate ? <Button asChild><Link href="/templates/new">Create template</Link></Button> : undefined} />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {templates.map((template) => {
        const using = busy === `use:${template.id}`;
        const deleting = busy === `delete:${template.id}`;
        return (
          <Card key={template.id} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="truncate font-medium">{template.name}</h2><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{template.contentText || "No caption"}</p></div>
              <Badge variant="neutral">Template</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {template.media ? <span className="inline-flex items-center gap-1"><ImageIcon className="size-3" aria-hidden="true" />{template.media.previewUrl ? "Media attached" : "Media unavailable"}</span> : null}
              {template.platforms.map((platform) => <span key={platform}>{PLATFORM_META[platform].label}</span>)}
              {template.platforms.length === 0 ? <span>Any platform</span> : null}
              <span>Updated {formatDateTime(template.updatedAt, "UTC")}</span>
            </div>
            <div className="mt-auto flex flex-wrap justify-end gap-2">
              {canUse ? <Button variant="outline" size="sm" onClick={() => void handleUseTemplate(template.id)} disabled={busy !== null}><Copy aria-hidden="true" />{using ? "Creating…" : "Use template"}</Button> : null}
              {canEdit ? <Button variant="ghost" size="icon" asChild aria-label={`Edit ${template.name}`}><Link href={`/templates/${template.id}`}><Pencil className="size-4" aria-hidden="true" /></Link></Button> : null}
              {canDelete ? <Button variant="ghost" size="icon" aria-label={`Delete ${template.name}`} onClick={() => void deleteTemplate(template.id)} disabled={busy !== null}>{deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button> : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
