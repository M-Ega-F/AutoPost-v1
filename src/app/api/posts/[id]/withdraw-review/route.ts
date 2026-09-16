import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { withdrawReview } from "@/lib/domain/reviews";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewManagement", userId, "Too many review actions. Try again later.");
    const { id } = await params;
    return apiSuccess({ review: await withdrawReview(userId, id) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't withdraw this review.");
  }
}
