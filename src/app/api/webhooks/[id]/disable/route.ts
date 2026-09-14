import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { setWebhookActive } from "@/lib/webhooks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const userId = await getUserId(); const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try { return apiSuccess({ webhook: await setWebhookActive(userId, id, false) }); } catch (error) { return apiErrorFromUnknown(error, "We couldn't disable this webhook. Try again."); }
}
