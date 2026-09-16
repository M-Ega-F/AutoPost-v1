"use client";

import { Beaker, Check, FlaskConical, Lightbulb, Loader2, Play, Plus, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CampaignIntelligenceReport } from "@/lib/domain/campaign-intelligence";

type PostOption = { id: string; contentText: string | null };
type Action = { id: string; title: string; description: string | null; actionType: string; status: string };
type Variant = { id: string; label: string; variantType: string; postId: string | null };
type Experiment = { id: string; name: string; experimentType: string; primaryMetric: string; status: string; controlPostId: string; variants: Variant[]; latestResult: { status: string; confidence: string; winnerVariantId: string | null } | null };
type LearningSummary = { totalExperiments: number; winners: number; inconclusive: number; averageUplift: number | null; averageDurationDays: number | null; strongestOptimization: string | null; evidenceCount: number };
const actionTypes = ["create_variant", "change_format", "change_platform", "change_posting_time", "test_hook", "test_caption"] as const;
const experimentTypes = ["content", "format", "platform", "posting_time", "hook", "caption"] as const;
const metrics = ["views", "likes", "comments", "shares", "saves", "reach", "impressions"] as const;

async function message(response: Response): Promise<string> { const body = await response.json().catch(() => null) as { error?: { message?: string } } | null; return body?.error?.message ?? "Something went wrong. Try again."; }
function label(value: string): string { return value.replaceAll("_", " "); }
function variantFor(status: string): "success" | "warning" | "danger" | "neutral" { return status === "completed" || status === "accepted" || status === "running" ? "success" : status === "failed" || status === "cancelled" ? "danger" : status === "paused" || status === "planned" ? "warning" : "neutral"; }

export function CampaignOptimizationPanel({ campaignId, posts, report, initialActions, initialExperiments, canUpdate }: { campaignId: string; posts: PostOption[]; report: CampaignIntelligenceReport; initialActions: Action[]; initialExperiments: Experiment[]; canUpdate: boolean }) {
  const [actions, setActions] = useState<Action[]>(initialActions);
  const [experiments, setExperiments] = useState<Experiment[]>(initialExperiments);
  const [learningSummary, setLearningSummary] = useState<LearningSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageText, setMessageText] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({ title: "", actionType: "create_variant" as typeof actionTypes[number] });
  const [experimentForm, setExperimentForm] = useState({ name: "", experimentType: "content" as typeof experimentTypes[number], primaryMetric: "views" as typeof metrics[number], controlPostId: posts[0]?.id ?? "" });

  const load = useCallback(async () => {
    setBusy(true); setMessageText(null);
    try {
      const [actionsResponse, experimentsResponse, learningResponse] = await Promise.all([fetch(`/api/campaigns/${campaignId}/optimization-actions`, { cache: "no-store" }), fetch(`/api/campaigns/${campaignId}/experiments`, { cache: "no-store" }), fetch(`/api/campaigns/${campaignId}/experiments/learning?pageSize=1`, { cache: "no-store" })]);
      if (!actionsResponse.ok) throw new Error(await message(actionsResponse));
      if (!experimentsResponse.ok) throw new Error(await message(experimentsResponse));
      setActions((await actionsResponse.json() as { actions: Action[] }).actions);
      setExperiments((await experimentsResponse.json() as { experiments: Experiment[] }).experiments);
      if (learningResponse.ok) setLearningSummary((await learningResponse.json() as { summary: LearningSummary }).summary);
    } catch (error) { setMessageText(error instanceof Error ? error.message : "Couldn't load optimization work."); } finally { setBusy(false); }
  }, [campaignId]);

  async function post(path: string, body?: unknown) {
    setBusy(true); setMessageText(null);
    try { const response = await fetch(path, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); if (!response.ok) throw new Error(await message(response)); await load(); }
    catch (error) { setMessageText(error instanceof Error ? error.message : "Couldn't save this change."); setBusy(false); }
  }
  async function createAction(event: FormEvent) { event.preventDefault(); if (!actionForm.title.trim()) return; await post(`/api/campaigns/${campaignId}/optimization-actions`, actionForm); setActionForm({ ...actionForm, title: "" }); }
  async function createExperiment(event: FormEvent) { event.preventDefault(); if (!experimentForm.name.trim() || !experimentForm.controlPostId) return; await post(`/api/campaigns/${campaignId}/experiments`, experimentForm); setExperimentForm({ ...experimentForm, name: "" }); }
  const recommendationCount = report.recommendations.length + report.opportunities.length;
  return (
    <section aria-labelledby="campaign-optimization-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="campaign-optimization-title" className="text-lg font-semibold">Optimization lab</h2><p className="text-sm text-muted-foreground">Turn existing intelligence into reviewable actions and controlled experiments.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}><RefreshCw data-icon="inline-start" className={busy ? "animate-spin" : undefined} />Refresh lab</Button></div>
      {messageText ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{messageText}</p> : null}
      <Card className="border-primary/30 bg-primary/5"><CardContent className="flex flex-wrap items-center gap-3 p-4"><Lightbulb className="size-4 text-primary" /><p className="text-sm"><span className="font-medium">{recommendationCount} intelligence signal{recommendationCount === 1 ? "" : "s"}</span> ready for a deliberate follow-up. Nothing publishes automatically.</p><Badge variant="neutral">Approval workflow preserved</Badge></CardContent></Card>
      {learningSummary && learningSummary.totalExperiments > 0 ? <Card><CardHeader><CardTitle className="text-base">Historical experiment insights</CardTitle><CardDescription>Observed evidence across this campaign; not a universal causal claim.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div><p className="text-xs text-muted-foreground">Experiments</p><p className="text-lg font-semibold">{learningSummary.totalExperiments}</p></div><div><p className="text-xs text-muted-foreground">Winners</p><p className="text-lg font-semibold">{learningSummary.winners}</p></div><div><p className="text-xs text-muted-foreground">Inconclusive</p><p className="text-lg font-semibold">{learningSummary.inconclusive}</p></div><div><p className="text-xs text-muted-foreground">Observed uplift</p><p className="text-lg font-semibold">{learningSummary.averageUplift === null ? "—" : `${(learningSummary.averageUplift * 100).toFixed(1)}%`}</p></div><div><p className="text-xs text-muted-foreground">Evidence</p><p className="text-lg font-semibold">{learningSummary.evidenceCount} · {learningSummary.strongestOptimization ? label(learningSummary.strongestOptimization) : "mixed"}</p></div></CardContent></Card> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Check className="size-4 text-primary" />Optimization actions</CardTitle><CardDescription>Track a proposed change through acceptance and completion.</CardDescription></CardHeader><CardContent className="space-y-4">
          {canUpdate ? <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void createAction(event)}><div className="flex flex-col gap-2"><Label htmlFor="optimization-action-title">New action</Label><Input id="optimization-action-title" placeholder="Test a shorter hook" value={actionForm.title} onChange={(event) => setActionForm({ ...actionForm, title: event.target.value })} maxLength={160} /></div><div className="flex items-end gap-2"><select aria-label="Action type" className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={actionForm.actionType} onChange={(event) => setActionForm({ ...actionForm, actionType: event.target.value as typeof actionTypes[number] })}>{actionTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select><Button type="submit" disabled={busy || !actionForm.title.trim()}><Plus data-icon="inline-start" />Add</Button></div></form> : null}
          {actions.length === 0 ? <p className="text-sm text-muted-foreground">No optimization actions yet.</p> : <div className="space-y-3">{actions.map((action) => <div key={action.id} className="rounded-md border border-border/70 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{action.title}</p><p className="text-xs capitalize text-muted-foreground">{label(action.actionType)}</p></div><Badge variant={variantFor(action.status)}>{label(action.status)}</Badge></div>{canUpdate && action.status === "proposed" ? <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void post(`/api/campaigns/${campaignId}/optimization-actions/${action.id}/accept`)} disabled={busy}>Accept</Button><Button size="sm" variant="outline" onClick={() => void post(`/api/campaigns/${campaignId}/optimization-actions/${action.id}/dismiss`)} disabled={busy}><X data-icon="inline-start" />Dismiss</Button></div> : null}{canUpdate && action.status === "accepted" ? <Button className="mt-3" size="sm" onClick={() => void post(`/api/campaigns/${campaignId}/optimization-actions/${action.id}/start`)} disabled={busy}><Play data-icon="inline-start" />Start work</Button> : null}</div>)}</div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Beaker className="size-4 text-primary" />Experiments</CardTitle><CardDescription>One control post plus up to three linked variants. Results are derived, not fabricated.</CardDescription></CardHeader><CardContent className="space-y-4">
          {canUpdate && posts.length > 0 ? <form className="grid gap-2" onSubmit={(event) => void createExperiment(event)}><Label htmlFor="experiment-name">New experiment</Label><Input id="experiment-name" placeholder="Hook test — weekday launch" value={experimentForm.name} onChange={(event) => setExperimentForm({ ...experimentForm, name: event.target.value })} maxLength={160} /><div className="grid gap-2 sm:grid-cols-3"><select aria-label="Experiment type" className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={experimentForm.experimentType} onChange={(event) => setExperimentForm({ ...experimentForm, experimentType: event.target.value as typeof experimentTypes[number] })}>{experimentTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select><select aria-label="Primary metric" className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={experimentForm.primaryMetric} onChange={(event) => setExperimentForm({ ...experimentForm, primaryMetric: event.target.value as typeof metrics[number] })}>{metrics.map((metric) => <option key={metric} value={metric}>{label(metric)}</option>)}</select><select aria-label="Control post" className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={experimentForm.controlPostId} onChange={(event) => setExperimentForm({ ...experimentForm, controlPostId: event.target.value })}>{posts.map((post) => <option key={post.id} value={post.id}>{post.contentText?.slice(0, 36) || `Post ${post.id.slice(0, 8)}`}</option>)}</select></div><Button type="submit" disabled={busy || !experimentForm.name.trim()}><FlaskConical data-icon="inline-start" />Create experiment</Button></form> : null}
          {experiments.length === 0 ? <p className="text-sm text-muted-foreground">No experiments yet. Start with a hypothesis and a control post.</p> : <div className="space-y-3">{experiments.map((experiment) => <div key={experiment.id} className="rounded-md border border-border/70 p-3"><div className="flex items-start justify-between gap-3"><div><Link href={`/campaigns/${campaignId}/experiments/${experiment.id}`} className="font-medium hover:text-primary">{experiment.name}</Link><p className="text-xs capitalize text-muted-foreground">{label(experiment.experimentType)} · primary metric: {label(experiment.primaryMetric)}</p></div><Badge variant={variantFor(experiment.status)}>{label(experiment.status)}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{experiment.variants.length}/3 variants · {experiment.latestResult ? `${label(experiment.latestResult.status)} result` : "Not evaluated"}</p>{canUpdate && experiment.status === "draft" && experiment.variants.length > 0 ? <Button className="mt-3" size="sm" onClick={() => void post(`/api/campaigns/${campaignId}/experiments/${experiment.id}/plan`)} disabled={busy}>Plan experiment</Button> : null}</div>)}</div>}
        </CardContent></Card>
      </div>
      {busy ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Saving optimization state…</p> : null}
    </section>
  );
}
