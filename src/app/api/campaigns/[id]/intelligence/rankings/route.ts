import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { listPostIntelligenceRankings } from "@/lib/domain/post-intelligence";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const querySchema = z.object({
  type: z.enum(["performance", "engagement", "reach", "views", "goal_contribution"]).default("performance"),
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  platform: z.enum(["instagram", "facebook", "tiktok", "threads", "linkedin", "youtube", "x"]).optional(),
  format: z.enum(["image", "video", "text"]).optional(),
  trend: z.enum(["rising", "stable", "declining", "unknown"]).optional(),
  momentum: z.enum(["accelerating", "improving", "stable", "slowing", "declining", "unknown"]).optional(),
  confidence: z.enum(["high", "medium", "low", "insufficient"]).optional(),
  minimumConfidence: z.enum(["high", "medium", "low", "insufficient"]).optional(),
  underperforming: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const campaignId = (await params).id;
  if (!uuidSchema.safeParse(campaignId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a valid campaign." });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Ranking filters are invalid." });
  try {
    assertRateLimit("campaignIntelligenceRanking", userId, "Too many ranking requests. Try again shortly.");
    const ranking = await listPostIntelligenceRankings(userId, campaignId, parsed.data);
    return apiSuccess(ranking);
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load post intelligence rankings.");
  }
}
