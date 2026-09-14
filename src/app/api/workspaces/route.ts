import { getUserId } from "@/lib/auth/server";
import {
  createWorkspaceForUser,
  getActiveWorkspaceForUser,
  listUserWorkspaces,
} from "@/lib/domain/workspaces";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { assertRateLimit } from "@/lib/rate-limit";
import { workspaceCreateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });

  try {
    const [workspaces, active] = await Promise.all([
      listUserWorkspaces(userId),
      getActiveWorkspaceForUser(userId),
    ]);
    return apiSuccess({ workspaces, activeWorkspaceId: active.workspace.id });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load your workspaces.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in first." });

  try {
    assertRateLimit("workspaceCreate", userId, "Too many workspace creation attempts. Try again later.");
    const parsed = workspaceCreateSchema.safeParse(await request.json());
    if (!parsed.success) return apiError({ status: 422, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid workspace details." });
    const workspace = await createWorkspaceForUser(userId, parsed.data.name, parsed.data);
    return apiSuccess({ workspace }, 201);
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't create that workspace.");
  }
}
