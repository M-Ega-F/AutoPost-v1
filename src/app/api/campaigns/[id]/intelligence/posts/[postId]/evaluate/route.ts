import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { evaluateAndPersistPostIntelligence } from "@/lib/domain/post-intelligence";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; postId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id: campaignId, postId } = await params;
  if (!z.string().uuid().safeParse(campaignId).success || !z.string().uuid().safeParse(postId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose valid campaign and post IDs." });
  try {
    assertRateLimit("postIntelligenceEvaluate", userId, "Too many post evaluations. Try again shortly.");
    const summary = await evaluateAndPersistPostIntelligence({ userId, campaignId, postId });
    if (!summary) return apiError({ status: 404, code: "NOT_FOUND", message: "That post is not in this campaign." });
    return apiSuccess({ summary });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't evaluate that post.");
  }
}
