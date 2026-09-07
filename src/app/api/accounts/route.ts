import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { listAccountsForUser } from "@/lib/services/accounts";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  try {
    return apiSuccess({ accounts: await listAccountsForUser(userId) });
  } catch (error) {
    logger.error("internal api account list failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't load connected accounts. Try again.");
  }
}
