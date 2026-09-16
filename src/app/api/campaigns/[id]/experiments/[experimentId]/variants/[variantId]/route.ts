import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent, apiSuccess } from "@/lib/api/response";
import { removeExperimentVariant, updateExperimentVariant, EXPERIMENT_TYPES } from "@/lib/domain/experiments";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; experimentId: string; variantId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId, variantId } = await params;
  if (![id, experimentId, variantId].every((value) => z.string().uuid().safeParse(value).success)) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose valid IDs." });
  try { assertRateLimit("campaignOptimizationWrite", userId, "Too many experiment changes. Try again shortly."); await removeExperimentVariant(userId, id, experimentId, variantId); return apiNoContent(); } catch (error) { return apiErrorFromUnknown(error, "We couldn't remove that variant."); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; experimentId: string; variantId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId, variantId } = await params;
  try { assertRateLimit("campaignOptimizationWrite", userId, "Too many experiment changes. Try again shortly."); const payload = await request.json() as { label?: unknown; variantType?: unknown; postId?: unknown }; const input = { label: typeof payload.label === "string" ? payload.label : undefined, variantType: typeof payload.variantType === "string" && EXPERIMENT_TYPES.includes(payload.variantType as typeof EXPERIMENT_TYPES[number]) ? payload.variantType as typeof EXPERIMENT_TYPES[number] : undefined, postId: payload.postId === null || typeof payload.postId === "string" ? payload.postId : undefined }; return apiSuccess({ variant: await updateExperimentVariant(userId, id, experimentId, variantId, input) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't update that variant."); }
}
