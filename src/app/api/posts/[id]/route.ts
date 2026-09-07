import { getUserId } from "@/lib/auth/server";
import { getPostDetailForUser } from "@/lib/services/posts";
import {
  apiError,
  apiErrorFromUnknown,
  apiMethodNotAllowed,
  apiSuccess,
} from "@/lib/api/response";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;

  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  try {
    const post = await getPostDetailForUser(userId, id);

    if (!post) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "We couldn't find that post." });
    }

    const safeMedia = post.media
      ? (({ storageKey: _storageKey, sourceUrl: _sourceUrl, ...media }) => media)(post.media)
      : null;
    return apiSuccess({ post: { ...post, media: safeMedia } });
  } catch (error) {
    logger.error("post fetch failed", {
      postId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return apiErrorFromUnknown(error, "We couldn't load this post. Try again.");
  }
}

export async function PATCH(): Promise<Response> {
  if (!(await getUserId())) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }
  return apiMethodNotAllowed("GET");
}

export async function DELETE(): Promise<Response> {
  if (!(await getUserId())) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }
  return apiMethodNotAllowed("GET");
}
