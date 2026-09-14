import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent, apiSuccess, apiValidationError } from "@/lib/api/response";
import { consumeRateLimit } from "@/lib/rate-limit";
import { deleteWebhook, getWebhook, updateWebhook } from "@/lib/webhooks/service";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const updateSchema = z.object({ name: z.string().optional(), url: z.string().optional(), events: z.array(z.string()).optional() });

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId(); const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try { return apiSuccess({ webhook: await getWebhook(userId, id) }); }
  catch (error) { return apiErrorFromUnknown(error, "We couldn't load this webhook. Try again."); }
}

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId(); const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("webhookUpdate", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many webhook changes. Try again later." });
  let body: unknown; try { body = await request.json(); } catch { return apiValidationError("Send a valid JSON request."); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError("Enter valid webhook details.");
  try {
    const current = await getWebhook(userId, id);
    return apiSuccess({ webhook: await updateWebhook(userId, id, { name: parsed.data.name ?? current.name, url: parsed.data.url ?? current.url, events: parsed.data.events ?? current.events }) });
  } catch (error) { logger.error("webhook update failed", { webhookId: id, error: error instanceof Error ? error.message : String(error) }); return apiErrorFromUnknown(error, "We couldn't update this webhook. Try again."); }
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId(); const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("webhookDelete", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many webhook changes. Try again later." });
  try { await deleteWebhook(userId, id); return apiNoContent(); }
  catch (error) { logger.error("webhook delete failed", { webhookId: id, error: error instanceof Error ? error.message : String(error) }); return apiErrorFromUnknown(error, "We couldn't delete this webhook. Try again."); }
}
