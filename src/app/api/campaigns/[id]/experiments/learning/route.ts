import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getExperimentLearning } from "@/lib/domain/experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a valid campaign ID." });
  const url = new URL(request.url);
  const page = z.coerce.number().int().min(1).max(10_000).catch(1).parse(url.searchParams.get("page"));
  const pageSize = z.coerce.number().int().min(1).max(50).catch(20).parse(url.searchParams.get("pageSize"));
  try { return apiSuccess(await getExperimentLearning(userId, id, page, pageSize)); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load historical experiment learning."); }
}
