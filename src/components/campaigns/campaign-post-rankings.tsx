"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostIntelligenceRanking, PostIntelligenceRankingType, PostIntelligenceSummaryView } from "@/lib/domain/post-intelligence";

const rankingTypes: Array<{ value: PostIntelligenceRankingType; label: string }> = [
  { value: "performance", label: "Performance" },
  { value: "engagement", label: "Engagement" },
  { value: "reach", label: "Reach" },
  { value: "views", label: "Views" },
  { value: "goal_contribution", label: "Goal contribution" },
];

function score(item: PostIntelligenceSummaryView, type: PostIntelligenceRankingType): number | null {
  return type === "performance" ? item.performanceScore : type === "engagement" ? item.engagementScore : type === "reach" ? item.reachScore : type === "views" ? item.viewsScore : item.goalContribution;
}

async function readRanking(campaignId: string, type: PostIntelligenceRankingType, cursor?: string): Promise<PostIntelligenceRanking> {
  const params = new URLSearchParams({ type, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/campaigns/${campaignId}/intelligence/rankings?${params}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } & Partial<PostIntelligenceRanking>;
  if (!response.ok) throw new Error(body.error?.message ?? "Couldn't load post rankings.");
  return body as PostIntelligenceRanking;
}

export function CampaignPostRankings({ campaignId }: { campaignId: string }) {
  const [type, setType] = useState<PostIntelligenceRankingType>("performance");
  const [ranking, setRanking] = useState<PostIntelligenceRanking | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load(nextType = type, cursor?: string) {
    setBusy(true); setMessage(null);
    try {
      const next = await readRanking(campaignId, nextType, cursor);
      setType(nextType);
      setRanking((current) => cursor && current && nextType === type ? { ...next, items: [...current.items, ...next.items] } : next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't load post rankings.");
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scalable post rankings</CardTitle>
        <CardDescription>Database-ranked summaries with stable keyset pagination. Raw analytics stay out of this view.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ranking metric">
          {rankingTypes.map((item) => <Button key={item.value} type="button" variant={type === item.value ? "default" : "outline"} size="sm" onClick={() => void load(item.value)} disabled={busy}>{item.label}</Button>)}
        </div>
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
        {!ranking ? <p className="text-sm text-muted-foreground">Choose a metric to load persisted post summaries.</p> : ranking.items.length === 0 ? <p className="text-sm text-muted-foreground">No persisted summaries yet. Run campaign evaluation to populate rankings.</p> : <>
          <div className="divide-y divide-border rounded-md border border-border">
            {ranking.items.map((item, index) => <div key={item.postId} className="flex items-center justify-between gap-3 p-3 text-sm"><div className="min-w-0"><Link href={`/history?post=${item.postId}`} className="font-medium hover:text-primary">#{index + 1} · Post {item.postId.slice(0, 8)}</Link><p className="text-xs capitalize text-muted-foreground">{item.format} · {item.trend} · {item.confidence} confidence{item.state === "stale" ? " · stale" : ""}</p></div><div className="flex items-center gap-2"><Badge variant={item.isUnderperforming ? "danger" : "neutral"}>{item.classification.replaceAll("_", " ")}</Badge><span className="font-semibold tabular-nums">{score(item, type) ?? "—"}</span></div></div>)}
          </div>
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{ranking.dataFreshness} data · algorithm {ranking.algorithmVersion}</p>{ranking.hasMore && ranking.nextCursor ? <Button type="button" variant="outline" size="sm" onClick={() => void load(type, ranking.nextCursor!)} disabled={busy}>Load more</Button> : null}</div>
        </>}
      </CardContent>
    </Card>
  );
}
