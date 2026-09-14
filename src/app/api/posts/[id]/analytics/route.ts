import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getPostAnalyticsForUser } from "@/lib/services/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  try {
    const analytics = await getPostAnalyticsForUser(userId, id);
    if (!analytics) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "We couldn't find that post." });
    }
    return apiSuccess({ analytics });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load post analytics. Try again.");
  }
}
