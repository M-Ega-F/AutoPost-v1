import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { listDraftsForUser, saveDraftForUser } from "@/lib/services/posts";
import { saveDraftSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  try {
    return apiSuccess({ drafts: await listDraftsForUser(userId) });
  } catch (error) {
    logger.error("draft list failed", { error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't load drafts. Try again.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }

  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Invalid draft.");

  try {
    const result = await saveDraftForUser(userId, parsed.data);
    return apiSuccess(result, 201);
  } catch (error) {
    logger.error("draft create failed", { error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't save this draft. Try again.");
  }
}
