"use client";

import { BriefcaseBusiness, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignListQuery, CampaignSummary, PaginatedCampaigns } from "@/lib/domain/campaigns";

const statusLabels = { draft: "Draft", active: "Active", completed: "Completed", archived: "Archived" } as const;
const objectiveLabels = { brand_awareness: "Brand awareness", engagement: "Engagement", traffic: "Traffic", promotion: "Promotion", education: "Education", community: "Community", other: "Other" } as const;
const metricLabels = { views: "Views", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", reach: "Reach", impressions: "Impressions" } as const;

function statusVariant(status: CampaignSummary["status"]): "neutral" | "success" | "info" | "warning" {
  return status === "active" ? "success" : status === "completed" ? "info" : status === "archived" ? "warning" : "neutral";
}

function dateRange(campaign: CampaignSummary): string {
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  if (!campaign.startAt && !campaign.endAt) return "No date range";
  return `${campaign.startAt ? formatter.format(new Date(campaign.startAt)) : "Open"} – ${campaign.endAt ? formatter.format(new Date(campaign.endAt)) : "Open"}`;
}

function queryHref(query: CampaignListQuery, overrides: Partial<CampaignListQuery>): string {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (next.page > 1) params.set("page", String(next.page));
  if (next.status) params.set("status", next.status);
  if (next.search) params.set("search", next.search);
  return `/campaigns${params.toString() ? `?${params.toString()}` : ""}`;
}

function CreateCampaignForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", objective: "", customObjective: "", targetMetric: "", targetValue: "", startAt: "", endAt: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.name, description: form.description || null, objective: form.objective || null, customObjective: form.customObjective || null, targetMetric: form.targetMetric || null, targetValue: form.targetValue ? Number(form.targetValue) : null, startAt: form.startAt ? `${form.startAt}T00:00:00.000Z` : null, endAt: form.endAt ? `${form.endAt}T00:00:00.000Z` : null }) });
      const result = await response.json().catch(() => null) as { campaign?: CampaignSummary; error?: { message?: string } } | null;
      if (!response.ok || !result?.campaign) throw new Error(result?.error?.message ?? "We couldn't create that campaign.");
      router.push(`/campaigns/${result.campaign.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't create that campaign.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">Start a campaign</CardTitle>
        <CardDescription>Give a group of posts a shared objective and a visible progress lane.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="campaign-name">Name</Label>
              <Input id="campaign-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="September product launch" required maxLength={160} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="campaign-objective">Objective</Label>
              <select id="campaign-objective" className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })}>
                <option value="">Choose an objective</option>
                {Object.entries(objectiveLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          {form.objective === "other" ? <div className="flex flex-col gap-2"><Label htmlFor="campaign-custom-objective">Custom objective</Label><Input id="campaign-custom-objective" value={form.customObjective} onChange={(event) => setForm({ ...form, customObjective: event.target.value })} placeholder="Describe the outcome" maxLength={160} /></div> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="flex flex-col gap-2"><Label htmlFor="campaign-target-metric">Target metric</Label><select id="campaign-target-metric" className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={form.targetMetric} onChange={(event) => setForm({ ...form, targetMetric: event.target.value })}><option value="">No target</option>{Object.entries(metricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="flex flex-col gap-2"><Label htmlFor="campaign-target-value">Target value</Label><Input id="campaign-target-value" type="number" min="1" step="1" value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} placeholder="100000" /></div><div className="flex flex-col gap-2"><Label htmlFor="campaign-start-date">Start date</Label><Input id="campaign-start-date" type="date" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></div><div className="flex flex-col gap-2"><Label htmlFor="campaign-end-date">End date</Label><Input id="campaign-end-date" type="date" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></div></div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-description">Description</Label>
            <Textarea id="campaign-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What should this group of posts accomplish?" maxLength={2000} />
          </div>
          {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}><Plus data-icon="inline-start" />{saving ? "Creating…" : "Create campaign"}</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function CampaignsList({ result, query, canCreate }: { result: PaginatedCampaigns; query: CampaignListQuery; canCreate: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Campaigns" subtitle="Organize posts without changing their publishing or approval lifecycle." action={canCreate ? <Button onClick={() => setCreating((value) => !value)}><Plus data-icon="inline-start" />Create campaign</Button> : null} />
      {creating ? <CreateCampaignForm onCancel={() => setCreating(false)} /> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form className="flex flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("search"); router.push(queryHref(query, { page: 1, search: typeof value === "string" ? value.trim() || undefined : undefined })); }}>
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input name="search" defaultValue={query.search ?? ""} className="pl-9" placeholder="Search campaigns" aria-label="Search campaigns" /></div>
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <select aria-label="Filter campaign status" className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={query.status ?? ""} onChange={(event) => router.push(queryHref(query, { page: 1, status: (event.target.value || undefined) as CampaignListQuery["status"] }))}>
          <option value="">All statuses</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {result.items.length === 0 ? (
        <Card><EmptyState icon={BriefcaseBusiness} title={query.search || query.status ? "No campaigns found" : "No campaigns yet"} body={query.search || query.status ? "Try another filter or search term." : "Create your first campaign to give related posts a shared context."} action={canCreate && !query.search && !query.status ? <Button onClick={() => setCreating(true)}><Plus data-icon="inline-start" />Create your first campaign</Button> : null} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {result.items.map((campaign) => <Card key={campaign.id} className="transition-colors hover:border-primary/50">
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate"><Link href={`/campaigns/${campaign.id}`} className="hover:text-primary">{campaign.name}</Link></CardTitle><CardDescription className="mt-2">{dateRange(campaign)}</CardDescription></div><Badge variant={statusVariant(campaign.status)}>{statusLabels[campaign.status]}</Badge></div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4"><p className="min-h-10 line-clamp-2 text-sm text-muted-foreground">{campaign.description || "No description yet."}</p><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{campaign.postCount} {campaign.postCount === 1 ? "post" : "posts"}</span><span className="text-muted-foreground">{campaign.objective ? objectiveLabels[campaign.objective] : "No objective"}</span></div><Button asChild variant="outline" className="w-full"><Link href={`/campaigns/${campaign.id}`}>Open campaign</Link></Button></CardContent>
          </Card>)}
        </div>
      )}
      {result.totalPages > 1 ? <div className="flex items-center justify-between border-t border-border/60 pt-4 text-sm text-muted-foreground"><span>Page {result.page} of {result.totalPages}</span><div className="flex gap-2"><Button asChild variant="outline" size="sm" disabled={result.page <= 1}><Link href={queryHref(query, { page: result.page - 1 })}>Previous</Link></Button><Button asChild variant="outline" size="sm" disabled={result.page >= result.totalPages}><Link href={queryHref(query, { page: result.page + 1 })}>Next</Link></Button></div></div> : null}
    </div>
  );
}
