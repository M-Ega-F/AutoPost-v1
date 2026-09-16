import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { CampaignExperimentDetail } from "@/components/campaigns/campaign-experiment-detail";
import { getExperiment } from "@/lib/domain/experiments";
import { listCampaignPosts } from "@/lib/domain/campaigns";
import { campaignPostsQuerySchema } from "@/lib/validation/schemas";
import { requireUser } from "@/lib/auth/server";

export default async function CampaignExperimentPage({ params }: { params: Promise<{ id: string; experimentId: string }> }) {
  const user = await requireUser();
  const { id, experimentId } = await params;
  const experiment = await getExperiment(user.id, id, experimentId).catch((error) => {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "not_found") notFound();
    throw error;
  });
  const posts = await listCampaignPosts(user.id, id, campaignPostsQuerySchema.parse({}));
  return <><PageHeader title={experiment.name} subtitle="Controlled campaign experiment with explicit variants and evidence-based results." /><CampaignExperimentDetail campaignId={id} initialExperiment={experiment} initialPosts={posts.items.map((post) => ({ id: post.id, contentText: post.contentText }))} /></>;
}
