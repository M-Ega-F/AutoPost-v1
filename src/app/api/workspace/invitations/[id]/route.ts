import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent } from "@/lib/api/response";
import { cancelWorkspaceInvitation } from "@/lib/domain/invitations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  const { id } = await params;
  try {
    await cancelWorkspaceInvitation(userId, id);
    return apiNoContent();
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't cancel the invitation. Try again.");
  }
}
