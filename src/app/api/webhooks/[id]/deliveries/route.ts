import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { listWebhookDeliveries } from "@/lib/webhooks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId(); const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try { return apiSuccess({ deliveries: await listWebhookDeliveries(userId, id) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't load delivery history. Try again."); }
}
