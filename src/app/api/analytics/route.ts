import { getUserId } from "@/lib/auth/server";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  getAnalyticsForUser,
  getPostForUser,
  listAnalyticsTargetIdsForUser,
} from "@/lib/services/posts";
import { getSettingsForUser } from "@/lib/services/settings";
import { PLATFORMS, type Platform } from "@/lib/status";
import { normalizeTimeZone } from "@/lib/time";
import { enqueueAnalyticsJob } from "@/lib/queue/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readPlatform(value: string | null): Platform | undefined {
  return value && (PLATFORMS as readonly string[]).includes(value)
    ? (value as Platform)
    : undefined;
}

function readRange(value: string | null): "7d" | "30d" | "all" {
  return value === "7d" || value === "all" ? value : "30d";
}

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  const url = new URL(request.url);
  const requestedPlatform = url.searchParams.get("platform");
  if (requestedPlatform && !readPlatform(requestedPlatform)) {
    return apiValidationError("Unsupported platform.");
  }

  try {
    const settings = await getSettingsForUser(userId);
    const analytics = await getAnalyticsForUser(userId, {
      range: readRange(url.searchParams.get("range")),
      platform: readPlatform(requestedPlatform),
      timeZone: normalizeTimeZone(settings.timezone),
    });
    return apiSuccess({ analytics });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load analytics. Try again.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  try {
    await requireWorkspacePermission(userId, "analytics:refresh");
    assertRateLimit("analyticsRefresh", userId, "Too many refreshes. Try again in a minute.");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const postId = typeof body.postId === "string" ? body.postId : undefined;
    const requestedPlatform = typeof body.platform === "string" ? body.platform : undefined;
    if (requestedPlatform && !readPlatform(requestedPlatform)) {
      return apiValidationError("Unsupported platform.");
    }

    const targetIds = postId
      ? (await getPostForUser(userId, postId))?.platforms
          .filter((target) => target.status === "success" && (!requestedPlatform || target.platform === requestedPlatform))
          .map((target) => target.id) ?? null
      : await listAnalyticsTargetIdsForUser(userId, readPlatform(requestedPlatform ?? null));

    if (targetIds === null) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "We couldn't find that post." });
    }

    const jobs = await Promise.all(
      targetIds.map((postPlatformId) => enqueueAnalyticsJob({ postPlatformId })),
    );
    return apiSuccess({ queued: jobs.filter(Boolean).length }, 202);
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't refresh analytics. Try again.");
  }
}
