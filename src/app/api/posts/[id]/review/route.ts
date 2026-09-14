import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getPostReviewForUser } from "@/lib/domain/post-approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });
  try {
    const { id } = await params;
    return apiSuccess({ review: await getPostReviewForUser(userId, id) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load the approval history.");
  }
}
