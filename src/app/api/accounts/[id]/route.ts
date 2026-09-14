import { getUserId } from "@/lib/auth/server";
import {
  apiError,
  apiErrorFromUnknown,
  apiNoContent,
  apiSuccess,
} from "@/lib/api/response";
import {
  disconnectAccountForUser,
  getAccountManagementForUser,
} from "@/lib/services/accounts";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  try {
    const account = await getAccountManagementForUser(userId, id);
    if (!account) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "We couldn't find that account." });
    }
    return apiSuccess({ account });
  } catch (error) {
    logger.error("internal api account fetch failed", {
      accountId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't load this account. Try again.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  try {
    await disconnectAccountForUser(userId, id);
    return apiNoContent();
  } catch (error) {
    logger.error("internal api account disconnect failed", {
      accountId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't disconnect this account. Try again.");
  }
}
