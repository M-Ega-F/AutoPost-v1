import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { transitionExperiment, type ExperimentStatus } from "@/lib/domain/experiments";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const actionMap: Record<string, ExperimentStatus> = { plan: "planned", start: "running", pause: "paused", resume: "running", complete: "completed", cancel: "cancelled" };

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; experimentId: string; action: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId, action } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(experimentId).success || !actionMap[action]) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "That experiment action is invalid." });
  try { assertRateLimit("campaignOptimizationWrite", userId, "Too many experiment changes. Try again shortly."); return apiSuccess({ experiment: await transitionExperiment(userId, id, experimentId, actionMap[action]) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't update that experiment."); }
}
