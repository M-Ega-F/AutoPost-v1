import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { requestPostChanges } from "@/lib/domain/post-approvals";
import { assertRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestChangesSchema = z.object({ comment: z.string().trim().min(1, "Add a comment explaining the requested changes.").max(1000, "The review comment is too long.") }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewAction", userId, "Too many approval actions. Try again later.");
    const parsed = requestChangesSchema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Add a review comment." });
    const { id } = await params;
    return apiSuccess({ review: await requestPostChanges(userId, id, parsed.data.comment) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't request changes to this post.");
  }
}
