import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { retryPostPlatformForUser } from "@/lib/services/posts";
import { consumeRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const retrySchema = z.object({
  postPlatformId: z.string().trim().min(1).max(128),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;

  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }

  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError("postPlatformId is required.");
  }

  const limited = consumeRateLimit("retry", userId);
  if (!limited.ok) {
    return apiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many attempts. Wait a moment and try again.",
      headers: { "Retry-After": String(limited.retryAfterSeconds) },
    });
  }

  try {
    await retryPostPlatformForUser(userId, parsed.data.postPlatformId, id);
    return apiSuccess({ postId: id, postPlatformId: parsed.data.postPlatformId });
  } catch (error) {
    logger.error("internal api post retry failed", {
      postId: id,
      postPlatformId: parsed.data.postPlatformId,
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't retry this platform. Try again.");
  }
}
