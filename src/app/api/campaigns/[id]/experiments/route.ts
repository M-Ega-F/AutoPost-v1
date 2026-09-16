import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { createExperiment, EXPERIMENT_METRICS, EXPERIMENT_TYPES, listExperiments } from "@/lib/domain/experiments";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuidSchema = z.string().uuid();
const schema = z.object({ name: z.string().min(1).max(160), description: z.string().max(2000).nullable().optional(), experimentType: z.enum(EXPERIMENT_TYPES), primaryMetric: z.enum(EXPERIMENT_METRICS), controlPostId: uuidSchema, optimizationActionId: uuidSchema.nullable().optional(), plannedStartAt: z.coerce.date().nullable().optional(), notes: z.string().max(2000).nullable().optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const campaignId = (await params).id;
  if (!uuidSchema.safeParse(campaignId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a valid campaign." });
  try { assertRateLimit("campaignOptimization", userId, "Too many experiment requests. Try again shortly."); return apiSuccess({ experiments: await listExperiments(userId, campaignId) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load experiments."); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("campaignOptimizationWrite", userId, "Too many experiment changes. Try again shortly.");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Experiment is invalid." });
    return apiSuccess({ experiment: await createExperiment(userId, (await params).id, parsed.data) }, 201);
  } catch (error) { return apiErrorFromUnknown(error, "We couldn't create that experiment."); }
}
