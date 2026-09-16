import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { transitionOptimizationAction, type OptimizationActionStatus } from "@/lib/domain/campaign-optimization";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const actionMap: Record<string, OptimizationActionStatus> = { accept: "accepted", start: "in_progress", complete: "completed", dismiss: "dismissed", cancel: "cancelled", fail: "failed", retry: "in_progress" };

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; actionId: string; action: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, actionId, action } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(actionId).success || !actionMap[action]) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "That optimization action is invalid." });
  try { assertRateLimit("campaignOptimizationWrite", userId, "Too many optimization changes. Try again shortly."); return apiSuccess({ action: await transitionOptimizationAction(userId, id, actionId, actionMap[action]) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't update that optimization action."); }
}
