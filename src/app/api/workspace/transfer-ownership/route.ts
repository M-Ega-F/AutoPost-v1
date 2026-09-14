import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { transferWorkspaceOwnership } from "@/lib/domain/workspaces";
import { assertRateLimit } from "@/lib/rate-limit";
import { workspaceTransferSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });

  try {
    assertRateLimit("workspaceTransfer", userId, "Too many ownership transfer attempts. Try again later.");
    const parsed = workspaceTransferSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Choose a workspace member.",
      });
    }
    await transferWorkspaceOwnership(userId, parsed.data.memberId);
    return apiSuccess({ success: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't transfer workspace ownership.");
  }
}
