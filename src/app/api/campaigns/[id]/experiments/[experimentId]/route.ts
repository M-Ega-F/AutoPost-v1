import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getExperiment, updateExperiment } from "@/lib/domain/experiments";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; experimentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(experimentId).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose valid campaign and experiment IDs." });
  try { return apiSuccess({ experiment: await getExperiment(userId, id, experimentId) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load that experiment."); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; experimentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id, experimentId } = await params;
  try { assertRateLimit("campaignOptimizationWrite", userId, "Too many experiment changes. Try again shortly."); const payload = await request.json() as { name?: unknown; description?: unknown; plannedStartAt?: unknown; notes?: unknown }; const input = { name: typeof payload.name === "string" ? payload.name : undefined, description: payload.description === null || typeof payload.description === "string" ? payload.description : undefined, plannedStartAt: payload.plannedStartAt === null || typeof payload.plannedStartAt === "string" ? payload.plannedStartAt === null ? null : new Date(payload.plannedStartAt) : undefined, notes: payload.notes === null || typeof payload.notes === "string" ? payload.notes : undefined }; if (input.plannedStartAt instanceof Date && Number.isNaN(input.plannedStartAt.getTime())) return apiError({ status: 422, code: "VALIDATION_ERROR", message: "Planned start time is invalid." }); return apiSuccess({ experiment: await updateExperiment(userId, id, experimentId, input) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't update that experiment."); }
}
