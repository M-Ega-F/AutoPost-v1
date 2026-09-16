import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getCampaignOptimizationOpportunities } from "@/lib/domain/campaign-intelligence-history";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const campaignId = (await params).id;
  if (!uuidSchema.safeParse(campaignId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a valid campaign." });
  try {
    assertRateLimit("campaignIntelligenceHistory", userId, "Too many intelligence opportunity requests. Try again shortly.");
    const opportunities = await getCampaignOptimizationOpportunities(userId, campaignId);
    return apiSuccess({ opportunities });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load optimization opportunities.");
  }
}
