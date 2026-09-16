import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getExperiment, getExperimentStatistics } from "@/lib/domain/experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; experimentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(experimentId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose valid campaign and experiment IDs." });
  try {
    const experiment = await getExperiment(userId, id, experimentId);
    return apiSuccess({ lifecycleStatus: experiment.status, statistics: await getExperimentStatistics(userId, id, experimentId) });
  } catch (error) { return apiErrorFromUnknown(error, "We couldn't load statistical intelligence."); }
}
