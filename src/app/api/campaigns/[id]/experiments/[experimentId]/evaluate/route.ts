import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { evaluateExperiment } from "@/lib/domain/experiments";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; experimentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(experimentId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose valid campaign and experiment IDs." });
  try { assertRateLimit("experimentEvaluate", userId, "Too many experiment evaluations. Try again shortly."); return apiSuccess({ result: await evaluateExperiment(userId, id, experimentId) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't evaluate that experiment."); }
}
