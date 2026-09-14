import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { markAllAsRead } from "@/lib/domain/notifications";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try {
    assertRateLimit("notificationMarkAll", userId, "Too many notification updates. Try again shortly.");
    return apiSuccess({ marked: await markAllAsRead(userId) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't mark notifications as read.");
  }
}
