"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/status";
import type { ContentTemplateDetail } from "@/lib/domain/types";

export function TemplateForm({ template }: { template?: ContentTemplateDetail }) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [caption, setCaption] = useState(template?.contentText ?? "");
  const [platforms, setPlatforms] = useState<Platform[]>(template?.platforms ?? []);
  const [saving, setSaving] = useState(false);

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => current.includes(platform)
      ? current.filter((value) => value !== platform)
      : [...current, platform]);
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Enter a template name.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(template ? `/api/templates/${template.id}` : "/api/templates", {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, caption, platforms }),
      });
      const payload = await response.json().catch(() => null) as { template?: { id: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.template) throw new Error(payload?.error?.message ?? "We couldn't save this template.");
      toast.success(template ? "Template updated." : "Template created.");
      router.push("/templates");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't save this template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader><p className="text-base font-medium">Template details</p><p className="text-sm text-muted-foreground">Templates save reusable content only. They never publish or schedule a post.</p></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="template-name" className="text-sm font-medium">Name</label>
          <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Product launch" />
        </div>
        <div className="space-y-2">
          <label htmlFor="template-caption" className="text-sm font-medium">Caption</label>
          <Textarea id="template-caption" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={5000} rows={7} placeholder="Write reusable caption text" />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Platforms <span className="font-normal text-muted-foreground">(optional)</span></legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLATFORMS.map((platform) => {
              const selected = platforms.includes(platform);
              const Icon = PLATFORM_META[platform].icon;
              return (
                <label key={platform} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:border-primary/50">
                  <input type="checkbox" checked={selected} onChange={() => togglePlatform(platform)} className="size-4 accent-primary" />
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {PLATFORM_META[platform].label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/templates")} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {saving ? "Saving…" : "Save template"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
