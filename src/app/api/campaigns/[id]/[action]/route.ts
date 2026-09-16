import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { transitionCampaign, type CampaignStatus } from "@/lib/domain/campaigns";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actions = { activate: "active", complete: "completed", archive: "archived", restore: "active" } as const;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, action } = await params;
  const target = actions[action as keyof typeof actions] as CampaignStatus | undefined;
  if (!target) return apiError({ status: 404, code: "NOT_FOUND", message: "Campaign action not found." });
  try {
    assertRateLimit("campaignUpdate", userId, "Too many campaign actions. Try again later.");
    return apiSuccess({ campaign: await transitionCampaign(userId, id, target) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update that campaign.");
  }
}
