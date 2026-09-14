import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { submitPostForReview } from "@/lib/domain/post-approvals";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    assertRateLimit("reviewSubmit", userId, "Too many review submissions. Try again later.");
    const { id } = await params;
    return apiSuccess({ review: await submitPostForReview(userId, id) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't submit this post for review.");
  }
}
