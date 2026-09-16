import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getOptimizationAction, updateOptimizationAction } from "@/lib/domain/campaign-optimization";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; actionId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, actionId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(actionId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose valid campaign and action IDs." });
  try { return apiSuccess({ action: await getOptimizationAction(userId, id, actionId) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load that optimization action."); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; actionId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, actionId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(actionId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose valid campaign and action IDs." });
  try { assertRateLimit("campaignOptimizationWrite", userId, "Too many optimization changes. Try again shortly."); const payload = await request.json() as { title?: unknown; description?: unknown }; const input = { title: typeof payload.title === "string" ? payload.title : undefined, description: payload.description === null || typeof payload.description === "string" ? payload.description : undefined }; return apiSuccess({ action: await updateOptimizationAction(userId, id, actionId, input) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't update that optimization action."); }
}
