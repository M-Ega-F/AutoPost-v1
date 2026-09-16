import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getCampaignIntelligence } from "@/lib/domain/campaign-intelligence";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const sortSchema = z.enum(["score", "views", "engagement", "published"]);

function positiveInteger(value: string | null, fallback: number, max: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= max ? parsed : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const campaignId = (await params).id;
  if (!uuidSchema.safeParse(campaignId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a valid campaign." });
  const url = new URL(request.url);
  const page = positiveInteger(url.searchParams.get("page"), 1, 500);
  const pageSize = positiveInteger(url.searchParams.get("pageSize"), 20, 50);
  const sort = url.searchParams.get("sort");
  const comparisonIds = url.searchParams.getAll("postId").flatMap((value) => value.split(",").filter(Boolean));
  if (page === null || pageSize === null) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Pagination values are invalid." });
  if (sort !== null && !sortSchema.safeParse(sort).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Unsupported intelligence sort." });
  if (comparisonIds.length > 3 || new Set(comparisonIds).size !== comparisonIds.length || comparisonIds.some((id) => !uuidSchema.safeParse(id).success)) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Compare between two and three unique campaign post IDs." });
  if (comparisonIds.length === 1) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Compare at least two campaign posts." });
  try {
    assertRateLimit("campaignIntelligence", userId, "Too many intelligence requests. Try again shortly.");
    const intelligence = await getCampaignIntelligence(userId, campaignId, { page, pageSize, sort: sortSchema.safeParse(sort).success ? sortSchema.parse(sort) : undefined, comparisonIds: comparisonIds.length > 0 ? comparisonIds : undefined });
    return apiSuccess({ intelligence });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load campaign intelligence.");
  }
}
