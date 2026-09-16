import { notFound } from "next/navigation";

import { CampaignDetail } from "@/components/campaigns/campaign-detail";
import { listCampaignActivity } from "@/lib/domain/campaign-activity";
import { hasPermission } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/server";
import { getCampaign, listAvailablePostsForCampaign, listCampaignPosts } from "@/lib/domain/campaigns";
import { getCampaignIntelligence } from "@/lib/domain/campaign-intelligence";
import { listCampaignIntelligenceHistory } from "@/lib/domain/campaign-intelligence-history";
import { listOptimizationActions } from "@/lib/domain/campaign-optimization";
import { listExperiments } from "@/lib/domain/experiments";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { campaignPostsQuerySchema } from "@/lib/validation/schemas";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const workspace = await getActiveWorkspaceForUser(user.id);
  const campaign = await getCampaign(user.id, id).catch((error) => {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "not_found") notFound();
    throw error;
  });
  const [posts, activity, intelligence, intelligenceHistory, optimizationActions, experiments] = await Promise.all([
    listCampaignPosts(user.id, id, campaignPostsQuerySchema.parse({})),
    listCampaignActivity(user.id, id, { page: 1, pageSize: 20 }),
    getCampaignIntelligence(user.id, id, { page: 1, pageSize: 50 }),
    listCampaignIntelligenceHistory(user.id, id, { limit: 10 }),
    listOptimizationActions(user.id, id),
    listExperiments(user.id, id),
  ]);
  const canManagePosts = hasPermission(workspace.workspace.role, "campaigns:manage_posts");
  const availablePosts = canManagePosts ? await listAvailablePostsForCampaign(user.id, id, campaignPostsQuerySchema.parse({})) : { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };
  return <CampaignDetail initialCampaign={campaign} initialPosts={posts} initialAvailablePosts={availablePosts} initialActivity={activity} initialIntelligence={intelligence} initialIntelligenceHistory={intelligenceHistory} initialOptimizationActions={optimizationActions} initialExperiments={experiments} canUpdate={hasPermission(workspace.workspace.role, "campaigns:update")} canArchive={hasPermission(workspace.workspace.role, "campaigns:archive")} canDelete={hasPermission(workspace.workspace.role, "campaigns:delete")} canManagePosts={canManagePosts} />;
}
