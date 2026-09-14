import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent, apiValidationError } from "@/lib/api/response";
import { deleteNotification } from "@/lib/domain/notifications";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiValidationError("Invalid notification id.");
  try {
    assertRateLimit("notificationDelete", userId, "Too many notification updates. Try again shortly.");
    await deleteNotification(userId, id);
    return apiNoContent();
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't delete the notification.");
  }
}
