import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { listWorkspaceMembers } from "@/lib/domain/invitations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try {
    return apiSuccess({ members: await listWorkspaceMembers(userId) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load workspace members. Try again.");
  }
}
