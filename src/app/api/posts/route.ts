import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { consumeRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  createPostForUser,
  getPostForUser,
  listPostsForUser,
  listHistoryPostsForUser,
  type PostListScope,
} from "@/lib/services/posts";
import { getSettingsForUser } from "@/lib/services/settings";
import { createPostSchema, historyQuerySchema } from "@/lib/validation/schemas";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isScope(value: string | null): value is PostListScope {
  return value === "history" || value === "scheduled" || value === "all";
}

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Please log in to continue.",
    });
  }

  const url = new URL(request.url);
  const rawScope = url.searchParams.get("scope");
  const scope = rawScope ? (isScope(rawScope) ? rawScope : null) : "history";
  if (!scope) {
    return apiValidationError("Use a valid post scope.");
  }

  try {
    if (scope === "history") {
      const rawQuery = Object.fromEntries(url.searchParams.entries());
      delete rawQuery.scope;
      const parsedQuery = historyQuerySchema.safeParse(rawQuery);
      if (!parsedQuery.success) {
        return apiValidationError(
          parsedQuery.error.issues[0]?.message ?? "Invalid history filters.",
        );
      }

      const cookieStore = await cookies();
      const settings = await getSettingsForUser(
        userId,
        normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value),
      );
      const result = await listHistoryPostsForUser(
        userId,
        parsedQuery.data,
        settings.timezone,
      );
      return apiSuccess({
        posts: result.items,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }

    const posts = await listPostsForUser(
      userId,
      scope,
      url.searchParams.get("search") ?? undefined,
    );
    return apiSuccess({ posts });
  } catch (error) {
    logger.error("internal api post list failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't load posts. Try again.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Please log in to continue.",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }

  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "Invalid post.");
  }

  const limited = consumeRateLimit(
    parsed.data.schedule ? "schedule" : "publishNow",
    userId,
  );
  if (!limited.ok) {
    return apiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many posts at once. Wait a moment and try again.",
      headers: { "Retry-After": String(limited.retryAfterSeconds) },
    });
  }

  try {
    const result = await createPostForUser(userId, parsed.data);
    const post = await getPostForUser(userId, result.postId);
    return NextResponse.json(
      { post, postId: result.postId, status: result.status },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("internal api post create failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't create this post. Try again.");
  }
}
