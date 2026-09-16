import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { addReviewComment, getReviewDetail } from "@/lib/domain/reviews";
import { assertRateLimit } from "@/lib/rate-limit";
import { reviewCommentSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    const { id } = await params;
    const review = await getReviewDetail(userId, id);
    return apiSuccess({ comments: review.comments });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load the review comments.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewManagement", userId, "Too many comments. Try again later.");
    const parsed = reviewCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Write a valid comment." });
    const { id } = await params;
    return apiSuccess({ comment: await addReviewComment(userId, id, parsed.data.body, parsed.data.parentCommentId ?? null) }, 201);
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't add the review comment.");
  }
}
