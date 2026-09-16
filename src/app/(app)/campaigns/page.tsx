import { requireUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { listCampaigns } from "@/lib/domain/campaigns";
import { CampaignsList } from "@/components/campaigns/campaigns-list";
import { campaignListQuerySchema } from "@/lib/validation/schemas";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const workspace = await getActiveWorkspaceForUser(user.id);
  const params = await searchParams;
  const raw = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = campaignListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : campaignListQuerySchema.parse({});
  const result = await listCampaigns(user.id, query);
  return <CampaignsList result={result} query={query} canCreate={hasPermission(workspace.workspace.role, "campaigns:create")} />;
}
