import { getUserId } from "@/lib/auth/server";
import {
  apiError,
  apiErrorFromUnknown,
  apiMethodNotAllowed,
  apiNoContent,
  apiSuccess,
  apiValidationError,
} from "@/lib/api/response";
import {
  deleteTemplateForUser,
  getTemplateForUser,
  updateTemplateForUser,
} from "@/lib/domain/reuse";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { templateUpdateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  try {
    return apiSuccess({ template: await getTemplateForUser(userId, id) });
  } catch (error) {
    logger.error("template fetch failed", { templateId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't load this template. Try again.");
  }
}

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
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
  const parsed = templateUpdateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Invalid template.");

  try {
    return apiSuccess({ template: await updateTemplateForUser(userId, id, parsed.data) });
  } catch (error) {
    logger.error("template update failed", { templateId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't update this template. Try again.");
  }
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  try {
    await deleteTemplateForUser(userId, id);
    return apiNoContent();
  } catch (error) {
    logger.error("template delete failed", { templateId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't delete this template. Try again.");
  }
}

export async function PUT(): Promise<Response> {
  return apiMethodNotAllowed("GET, PATCH, DELETE");
}
