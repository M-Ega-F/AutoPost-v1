import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { duplicatePostForUser } from "@/lib/domain/reuse";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("reuse", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many attempts. Wait a moment and try again." });

  try {
    return apiSuccess(await duplicatePostForUser(userId, id), 201);
  } catch (error) {
    logger.error("post duplicate failed", { postId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't duplicate this post. Try again.");
  }
}
