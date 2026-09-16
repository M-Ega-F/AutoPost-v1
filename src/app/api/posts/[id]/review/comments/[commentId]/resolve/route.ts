import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { setReviewCommentResolved } from "@/lib/domain/reviews";
import { assertRateLimit } from "@/lib/rate-limit";
import { reviewCommentResolveSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewManagement", userId, "Too many discussion updates. Try again later.");
    const parsed = reviewCommentResolveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Choose a valid discussion state." });
    const { id, commentId } = await params;
    return apiSuccess({ comment: await setReviewCommentResolved(userId, id, commentId, parsed.data.resolved) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update the discussion.");
  }
}
