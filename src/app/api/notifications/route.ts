import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiMethodNotAllowed, apiSuccess, apiValidationError } from "@/lib/api/response";
import { getNotifications } from "@/lib/domain/notifications";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readBoolean(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const typeValue = url.searchParams.get("type");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return apiValidationError("Choose a valid notification page and limit.");
  }
  if (typeValue && !(NOTIFICATION_TYPES as readonly string[]).includes(typeValue)) {
    return apiValidationError("Unsupported notification type.");
  }
  try {
    return apiSuccess(await getNotifications(userId, {
      page,
      limit,
      unreadOnly: readBoolean(url.searchParams.get("unreadOnly")),
      type: typeValue as NotificationType | undefined,
    }));
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load notifications. Try again.");
  }
}

export async function POST(): Promise<Response> {
  return apiMethodNotAllowed("GET");
}
