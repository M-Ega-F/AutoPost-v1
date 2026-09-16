import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { createOptimizationAction, listOptimizationActions, OPTIMIZATION_ACTION_TYPES } from "@/lib/domain/campaign-optimization";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const createSchema = z.object({ title: z.string().min(1).max(160), description: z.string().max(2000).nullable().optional(), actionType: z.enum(OPTIMIZATION_ACTION_TYPES), sourceSnapshotId: uuidSchema.nullable().optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const campaignId = (await params).id;
  if (!uuidSchema.safeParse(campaignId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a valid campaign." });
  try { assertRateLimit("campaignOptimization", userId, "Too many optimization requests. Try again shortly."); return apiSuccess({ actions: await listOptimizationActions(userId, campaignId) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load optimization actions."); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignOptimizationWrite", userId, "Too many optimization changes. Try again shortly.");
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Optimization action is invalid." });
    return apiSuccess({ action: await createOptimizationAction(userId, (await params).id, parsed.data) }, 201);
  } catch (error) { return apiErrorFromUnknown(error, "We couldn't create that optimization action."); }
}
