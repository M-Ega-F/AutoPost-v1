import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { addExperimentVariant, EXPERIMENT_TYPES, getExperiment } from "@/lib/domain/experiments";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuidSchema = z.string().uuid();
const schema = z.object({ label: z.string().min(1).max(80), variantType: z.enum(EXPERIMENT_TYPES), postId: uuidSchema.nullable().optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; experimentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId } = await params;
  try { return apiSuccess({ variants: (await getExperiment(userId, id, experimentId)).variants }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load experiment variants."); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; experimentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignOptimizationWrite", userId, "Too many experiment changes. Try again shortly.");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Variant is invalid." });
    return apiSuccess({ variant: await addExperimentVariant(userId, (await params).id, (await params).experimentId, parsed.data) }, 201);
  } catch (error) { return apiErrorFromUnknown(error, "We couldn't add that variant."); }
}
