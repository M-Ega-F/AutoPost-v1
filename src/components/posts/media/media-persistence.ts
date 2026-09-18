export type MediaApiResponse = {
  storageKey: string;
  sourceUrl?: string | null;
  mediaType: "image" | "video";
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

type UploadIntentResponse = {
  storageKey: string;
  signedUrl: string;
};

const UPLOAD_FAILED =
  "We couldn't upload this file. Check your connection and try again.";
const URL_UNREACHABLE =
  "We couldn't reach this URL. Check that it's publicly accessible.";

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

function mimeHintFor(file: File): string | null {
  return file.type || null;
}

function uploadIntentMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    if ("message" in payload && typeof payload.message === "string") {
      return payload.message;
    }
    if (
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
    ) {
      return payload.error.message;
    }
  }
  return fallback;
}

async function requestUploadIntent(
  file: File,
  signal?: AbortSignal,
): Promise<UploadIntentResponse> {
  const response = await fetch("/api/media/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      fileName: file.name,
      mimeType: mimeHintFor(file),
      fileSize: file.size,
    }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      uploadIntentMessage(payload, UPLOAD_FAILED),
    );
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(UPLOAD_FAILED);
  }
  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.storageKey !== "string" ||
    typeof candidate.signedUrl !== "string"
  ) {
    throw new Error(UPLOAD_FAILED);
  }
  return {
    storageKey: candidate.storageKey,
    signedUrl: candidate.signedUrl,
  };
}

function uploadDirect(
  intent: UploadIntentResponse,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", abortRequest);
      request.upload.removeEventListener("progress", handleProgress);
      request.removeEventListener("load", handleLoad);
      request.removeEventListener("error", handleError);
      request.removeEventListener("abort", handleAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abortRequest = () => request.abort();
    const handleProgress = (event: ProgressEvent) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    const handleLoad = () => {
      if (request.status >= 200 && request.status < 300) {
        finish(() => resolve());
        return;
      }
      finish(() => reject(new Error(UPLOAD_FAILED)));
    };
    const handleError = () => finish(() => reject(new Error(UPLOAD_FAILED)));
    const handleAbort = () =>
      finish(() => reject(new DOMException("The upload was cancelled.", "AbortError")));

    request.open("PUT", intent.signedUrl);
    request.upload.addEventListener("progress", handleProgress);
    request.addEventListener("load", handleLoad);
    request.addEventListener("error", handleError);
    request.addEventListener("abort", handleAbort);
    signal?.addEventListener("abort", abortRequest, { once: true });

    if (signal?.aborted) {
      abortRequest();
      return;
    }

    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    request.send(body);
  });
}

/**
 * The only browser-to-server media upload boundary. Call this from publish or
 * schedule persistence, never from file selection or preview rendering.
 */
export function persistSelectedFile(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<MediaApiResponse> {
  return (async () => {
    onProgress(0);
    const intent = await requestUploadIntent(file, signal);
    await uploadDirect(intent, file, onProgress, signal);

    const response = await fetch("/api/media/upload-finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        storageKey: intent.storageKey,
        fileName: file.name,
        mimeType: mimeHintFor(file),
        fileSize: file.size,
      }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(uploadIntentMessage(payload, UPLOAD_FAILED));
    }
    onProgress(100);
    return payload as MediaApiResponse;
  })();
}

/** Resolves and stores a remote URL only when publish/schedule is submitted. */
export async function persistMediaUrl(
  url: string,
  signal?: AbortSignal,
): Promise<MediaApiResponse> {
  const response = await fetch("/api/media/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ url }),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(messageFrom(payload, URL_UNREACHABLE));
  }

  return payload as MediaApiResponse;
}
