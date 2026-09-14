import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent, apiSuccess, apiValidationError } from "@/lib/api/response";
import { removeWorkspaceMember, updateWorkspaceMemberRole } from "@/lib/domain/invitations";
import { memberRoleUpdateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }
  const parsed = memberRoleUpdateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Choose a valid workspace role.");
  try {
    return apiSuccess({ member: await updateWorkspaceMemberRole(userId, id, parsed.data.role) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't update this member. Try again.");
  }
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const { id } = await params;
  try {
    await removeWorkspaceMember(userId, id);
    return apiNoContent();
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't remove this member. Try again.");
  }
}
