import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { getReliabilitySnapshot } from "@/lib/reliability/health";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns workspace-scoped publishing health without exposing queue payloads or IDs. */
export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  try {
    const context = await requireWorkspacePermission(userId, "workspace:view");
    const reliability = await getReliabilitySnapshot(context.workspaceId);
    return apiSuccess({ reliability });
  } catch (error) {
    logger.error("internal api reliability fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't load publishing health. Try again.");
  }
}

