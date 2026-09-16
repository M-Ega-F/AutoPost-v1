import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { setReviewDeadline } from "@/lib/domain/reviews";
import { assertRateLimit } from "@/lib/rate-limit";
import { reviewDeadlineSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewManagement", userId, "Too many deadline changes. Try again later.");
    const parsed = reviewDeadlineSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Choose a valid deadline." });
    const { id } = await params;
    return apiSuccess({ review: await setReviewDeadline(userId, id, parsed.data.reviewDueAt ? new Date(parsed.data.reviewDueAt) : null) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update the review deadline.");
  }
}
