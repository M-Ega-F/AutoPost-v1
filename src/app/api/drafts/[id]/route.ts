import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiMethodNotAllowed, apiSuccess, apiValidationError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import {
  deleteDraftForUser,
  getDraftDetailForUser,
  saveDraftForUser,
} from "@/lib/services/posts";
import { saveDraftSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  try {
    const draft = await getDraftDetailForUser(userId, id);
    if (!draft) return apiError({ status: 404, code: "NOT_FOUND", message: "We couldn't find that draft." });
    const safeMedia = draft.media
      ? (({ storageKey: _storageKey, sourceUrl: _sourceUrl, ...media }) => media)(draft.media)
      : null;
    return apiSuccess({ draft: { ...draft, media: safeMedia } });
  } catch (error) {
    logger.error("draft fetch failed", { postId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't load this draft. Try again.");
  }
}

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }
  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "Invalid draft.");

  try {
    return apiSuccess(await saveDraftForUser(userId, { ...parsed.data, postId: id }));
  } catch (error) {
    logger.error("draft update failed", { postId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't update this draft. Try again.");
  }
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  try {
    await deleteDraftForUser(userId, id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("draft delete failed", { postId: id, error: error instanceof Error ? error.message : String(error) });
    return apiErrorFromUnknown(error, "We couldn't delete this draft. Try again.");
  }
}

export async function PUT(): Promise<Response> {
  return apiMethodNotAllowed("GET, PATCH, DELETE");
}
