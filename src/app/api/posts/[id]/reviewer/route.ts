import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { assignReviewer } from "@/lib/domain/reviews";
import { assertRateLimit } from "@/lib/rate-limit";
import { reviewerUpdateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewManagement", userId, "Too many reviewer changes. Try again later.");
    const parsed = reviewerUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Choose a valid reviewer." });
    const { id } = await params;
    return apiSuccess({ review: await assignReviewer(userId, id, parsed.data.reviewerId) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update the reviewer.");
  }
}
