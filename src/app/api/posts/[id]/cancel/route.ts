import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { cancelPostForUser, getPostForUser } from "@/lib/services/posts";
import { consumeRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;

  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  const limited = consumeRateLimit("cancel", userId);
  if (!limited.ok) {
    return apiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many attempts. Wait a moment and try again.",
      headers: { "Retry-After": String(limited.retryAfterSeconds) },
    });
  }

  try {
    await cancelPostForUser(userId, id);
    const post = await getPostForUser(userId, id);
    return apiSuccess({ post });
  } catch (error) {
    logger.error("internal api post cancel failed", {
      postId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "Couldn't cancel this post. Try again.");
  }
}
