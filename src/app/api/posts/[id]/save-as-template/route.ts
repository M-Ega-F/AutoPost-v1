import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { savePostAsTemplateForUser } from "@/lib/domain/reuse";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { saveAsTemplateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("reuse", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many attempts. Wait a moment and try again." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }
  const parsed = saveAsTemplateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Invalid template.");

  try {
    return apiSuccess({ template: await savePostAsTemplateForUser(userId, id, parsed.data.name) }, 201);
  } catch (error) {
    logger.error("save post as template failed", { postId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't save this template. Try again.");
  }
}
