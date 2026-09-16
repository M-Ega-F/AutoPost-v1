import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { listCampaignIntelligenceHistory } from "@/lib/domain/campaign-intelligence-history";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

function dateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const campaignId = (await params).id;
  if (!uuidSchema.safeParse(campaignId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a valid campaign." });
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 20 : /^\d+$/.test(rawLimit) ? Number(rawLimit) : 0;
  const from = dateParam(url.searchParams.get("from"));
  const to = dateParam(url.searchParams.get("to"));
  if (limit < 1 || limit > 50 || (url.searchParams.has("from") && !from) || (url.searchParams.has("to") && !to)) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "History filters are invalid." });
  try {
    assertRateLimit("campaignIntelligenceHistory", userId, "Too many intelligence history requests. Try again shortly.");
    const history = await listCampaignIntelligenceHistory(userId, campaignId, { limit, cursor: url.searchParams.get("cursor") ?? undefined, from, to });
    return apiSuccess({ history });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load intelligence history.");
  }
}
