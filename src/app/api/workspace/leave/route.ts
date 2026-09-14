import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { leaveWorkspace } from "@/lib/domain/workspaces";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });

  try {
    assertRateLimit("workspaceLeave", userId, "Too many leave attempts. Try again later.");
    return apiSuccess(await leaveWorkspace(userId));
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't leave the workspace.");
  }
}
