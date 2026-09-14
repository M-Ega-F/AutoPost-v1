import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { deleteAllRead } from "@/lib/domain/notifications";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try {
    assertRateLimit("notificationDelete", userId, "Too many notification updates. Try again shortly.");
    return apiSuccess({ deleted: await deleteAllRead(userId) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't delete read notifications.");
  }
}
