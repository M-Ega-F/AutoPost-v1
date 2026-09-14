import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { getWebhookDelivery } from "@/lib/webhooks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; deliveryId: string }> }): Promise<Response> {
  const userId = await getUserId(); const { id, deliveryId } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try { return apiSuccess({ delivery: await getWebhookDelivery(userId, id, deliveryId) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load this delivery. Try again."); }
}
