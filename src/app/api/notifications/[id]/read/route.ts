import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { markAsRead } from "@/lib/domain/notifications";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiValidationError("Invalid notification id.");
  try {
    assertRateLimit("notificationMarkRead", userId, "Too many notification updates. Try again shortly.");
    return apiSuccess({ notification: await markAsRead(userId, id) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't mark the notification as read.");
  }
}
