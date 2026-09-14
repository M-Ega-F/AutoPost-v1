import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiNoContent, apiSuccess } from "@/lib/api/response";
import { deleteMediaForUser, getMediaForUser } from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try {
    const { id } = await context.params;
    return apiSuccess({ asset: await getMediaForUser(userId, id) });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load this media asset. Try again.");
  }
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  try {
    const { id } = await context.params;
    await deleteMediaForUser(userId, id);
    return apiNoContent();
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't delete this media asset. Try again.");
  }
}
