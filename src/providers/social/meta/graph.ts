import "server-only";

import { serverConfig } from "@/lib/env";
import type { Platform } from "@/lib/status";
import { formBody, requestJson, type JsonResult, type ProviderResponseLog } from "../http";

function graphBase(): string {
  return `https://graph.facebook.com/${serverConfig.meta.graphVersion}`;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function formHeaders(token: string): Record<string, string> {
  return {
    ...bearer(token),
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function pathWithFields(
  path: string,
  fields: string,
  extra: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams({ fields });
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return `${graphBase()}/${path}?${params.toString()}`;
}

/** Instagram container lifecycle: see `status_code` in Meta's docs. */
export type InstagramContainerStatus =
  | "FINISHED"
  | "IN_PROGRESS"
  | "ERROR"
  | "EXPIRED"
  | "UNKNOWN";

export type FacebookVideoState = "ready" | "processing" | "error" | "unknown";

export async function getMe(
  token: string,
  platform: Platform,
): Promise<JsonResult<{ id?: string }>> {
  return requestJson<{ id?: string }>(
    pathWithFields("me", "id"),
    { method: "GET", headers: bearer(token) },
    { platform, endpoint: "GET /me" },
  );
}

export async function getInstagramUser(
  token: string,
  igUserId: string,
  platform: Platform,
): Promise<JsonResult<{ id?: string; username?: string }>> {
  return requestJson<{ id?: string; username?: string }>(
    pathWithFields(igUserId, "id,username"),
    { method: "GET", headers: bearer(token) },
    { platform, endpoint: "GET /{ig-user-id}" },
  );
}

export type CreateContainerInput = {
  igUserId: string;
  token: string;
  platform: Platform;
  /** `IMAGE`, `VIDEO` or `REELS`. */
  mediaType: "IMAGE" | "VIDEO" | "REELS";
  mediaUrl: string;
  caption: string;
};

export async function createInstagramContainer(
  input: CreateContainerInput,
): Promise<JsonResult<{ id?: string }>> {
  const body = formBody({
    caption: input.caption,
    media_type: input.mediaType,
    ...(input.mediaType === "IMAGE"
      ? { image_url: input.mediaUrl }
      : { video_url: input.mediaUrl }),
  });

  return requestJson<{ id?: string }>(
    `${graphBase()}/${encodeURIComponent(input.igUserId)}/media`,
    { method: "POST", headers: formHeaders(input.token), body },
    { platform: input.platform, endpoint: "POST /{ig-user-id}/media" },
  );
}

export async function publishInstagramContainer(
  input: { igUserId: string; token: string; platform: Platform; creationId: string },
): Promise<JsonResult<{ id?: string }>> {
  const body = formBody({ creation_id: input.creationId });

  return requestJson<{ id?: string }>(
    `${graphBase()}/${encodeURIComponent(input.igUserId)}/media_publish`,
    { method: "POST", headers: formHeaders(input.token), body },
    { platform: input.platform, endpoint: "POST /{ig-user-id}/media_publish" },
  );
}

export async function getInstagramContainerStatus(
  input: { token: string; platform: Platform; containerId: string },
): Promise<
  JsonResult<{ id?: string; status_code?: string; status?: string }>
> {
  return requestJson<{ id?: string; status_code?: string; status?: string }>(
    pathWithFields(encodeURIComponent(input.containerId), "id,status_code,status"),
    { method: "GET", headers: bearer(input.token) },
    { platform: input.platform, endpoint: "GET /{ig-container-id}" },
  );
}

export function toContainerStatus(
  payload: { status_code?: string; status?: string } | undefined,
): InstagramContainerStatus {
  const raw =
    payload?.status_code ?? payload?.status ?? "";

  switch (raw.toUpperCase()) {
    case "FINISHED":
      return "FINISHED";
    case "ERROR":
      return "ERROR";
    case "EXPIRED":
      return "EXPIRED";
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    default:
      return "UNKNOWN";
  }
}

export async function publishPagePhoto(
  input: {
    pageId: string;
    token: string;
    platform: Platform;
    url: string;
    message: string;
  },
): Promise<JsonResult<{ id?: string; post_id?: string }>> {
  const body = formBody({
    url: input.url,
    message: input.message,
    published: "true",
  });

  return requestJson<{ id?: string; post_id?: string }>(
    `${graphBase()}/${encodeURIComponent(input.pageId)}/photos`,
    { method: "POST", headers: formHeaders(input.token), body },
    { platform: input.platform, endpoint: "POST /{page-id}/photos" },
  );
}

export async function publishPageVideo(
  input: {
    pageId: string;
    token: string;
    platform: Platform;
    fileUrl: string;
    description: string;
  },
): Promise<JsonResult<{ id?: string; success?: boolean }>> {
  const body = formBody({
    file_url: input.fileUrl,
    description: input.description,
    published: "true",
  });

  return requestJson<{ id?: string; success?: boolean }>(
    `${graphBase()}/${encodeURIComponent(input.pageId)}/videos`,
    { method: "POST", headers: formHeaders(input.token), body },
    { platform: input.platform, endpoint: "POST /{page-id}/videos" },
  );
}

/**
 * A Page video uploaded by URL is encoded asynchronously: the POST returns an
 * id while the video itself may still be `processing`.
 */
export async function getVideoStatus(
  input: { videoId: string; token: string; platform: Platform },
): Promise<{ state: FacebookVideoState; responseLog: ProviderResponseLog }> {
  const { data, responseLog } = await requestJson<{
    id?: string;
    status?: { video_status?: string };
  }>(
    pathWithFields(encodeURIComponent(input.videoId), "id,status"),
    { method: "GET", headers: bearer(input.token) },
    { platform: input.platform, endpoint: "GET /{video-id}" },
  );

  const raw = data.status?.video_status?.toLowerCase() ?? "";

  if (raw === "ready" || raw === "published") {
    return { state: "ready", responseLog };
  }
  if (raw === "error" || raw === "failed") {
    return { state: "error", responseLog };
  }
  if (raw.length > 0) {
    return { state: "processing", responseLog };
  }
  return { state: "unknown", responseLog };
}
