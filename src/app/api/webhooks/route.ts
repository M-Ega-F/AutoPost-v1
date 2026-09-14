import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { createWebhook, listWebhooks } from "@/lib/webhooks/service";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({ name: z.string(), url: z.string(), events: z.array(z.string()), workspaceId: z.string().uuid().optional() });

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try { return apiSuccess({ webhooks: await listWebhooks(userId) }); }
  catch (error) { logger.error("webhook list failed", { error: error instanceof Error ? error.message : String(error) }); return apiErrorFromUnknown(error, "We couldn't load webhooks. Try again."); }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("webhookCreate", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many webhook changes. Try again later." });
  let body: unknown;
  try { body = await request.json(); } catch { return apiValidationError("Send a valid JSON request."); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Enter valid webhook details.");
  try { return apiSuccess(await createWebhook(userId, parsed.data), 201); }
  catch (error) { logger.error("webhook create failed", { error: error instanceof Error ? error.message : String(error) }); return apiErrorFromUnknown(error, "We couldn't create this webhook. Try again."); }
}
