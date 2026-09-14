import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { consumeRateLimit } from "@/lib/rate-limit";
import { rotateWebhookSecret } from "@/lib/webhooks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId(); const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("webhookRotateSecret", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many secret changes. Try again later." });
  try { return apiSuccess({ secret: await rotateWebhookSecret(userId, id) }); }
  catch (error) { return apiErrorFromUnknown(error, "We couldn't rotate this secret. Try again."); }
}
