import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { consumeRateLimit } from "@/lib/rate-limit";
import { testWebhook } from "@/lib/webhooks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId(); const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const limited = consumeRateLimit("webhookTest", userId);
  if (!limited.ok) return apiError({ status: 429, code: "RATE_LIMITED", message: "Too many test deliveries. Try again later." });
  try { return apiSuccess(await testWebhook(userId, id), 202); }
  catch (error) { return apiErrorFromUnknown(error, "We couldn't send the test. Try again."); }
}
