import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import {
  deleteWorkspaceForUser,
  getWorkspaceOverview,
  updateWorkspaceForUser,
} from "@/lib/domain/workspaces";
import { assertRateLimit } from "@/lib/rate-limit";
import { workspaceDeleteSchema, workspaceUpdateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });

  try {
    return apiSuccess({ workspace: await getWorkspaceOverview(userId) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load the workspace.");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });

  try {
    assertRateLimit("workspaceUpdate", userId, "Too many workspace updates. Try again later.");
    const parsed = workspaceUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid workspace details.",
      });
    }
    return apiSuccess({ workspace: await updateWorkspaceForUser(userId, parsed.data) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update the workspace.");
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });

  try {
    assertRateLimit("workspaceDelete", userId, "Too many deletion attempts. Try again later.");
    const parsed = workspaceDeleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Type the workspace name to confirm.",
      });
    }
    return apiSuccess(await deleteWorkspaceForUser(userId, parsed.data.confirmation));
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't delete the workspace.");
  }
}
