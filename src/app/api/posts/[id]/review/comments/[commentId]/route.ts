import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { deleteReviewComment, editReviewComment } from "@/lib/domain/reviews";
import { assertRateLimit } from "@/lib/rate-limit";
import { reviewCommentEditSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewManagement", userId, "Too many comment updates. Try again later.");
    const parsed = reviewCommentEditSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Write a valid comment." });
    const { id, commentId } = await params;
    return apiSuccess({ comment: await editReviewComment(userId, id, commentId, parsed.data.body) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update the review comment.");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewManagement", userId, "Too many comment updates. Try again later.");
    const { id, commentId } = await params;
    return apiSuccess({ comment: await deleteReviewComment(userId, id, commentId) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't delete the review comment.");
  }
}
