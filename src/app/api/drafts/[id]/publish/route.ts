import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { publishDraftForUser } from "@/lib/services/posts";
import { createPostSchema } from "@/lib/validation/schemas";
import { createPublishTraceId, logPublishTrace } from "@/lib/publishing/trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const publishTraceId = createPublishTraceId();
  const userId = await getUserId();
  const { id } = await params;
  logPublishTrace(publishTraceId, "PUBLISH_REQUEST", {
    operation: "api-publish-draft",
    postId: id,
  });
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  let body: unknown;
  try { body = await request.json(); } catch { return apiValidationError("Send a valid JSON request."); }
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Invalid post.");

  try {
    return apiSuccess(await publishDraftForUser(userId, id, parsed.data, publishTraceId));
  } catch (error) {
    logger.error("draft publish failed", { postId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't publish this draft. Try again.");
  }
}
