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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
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
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const abortRequest = () => request.abort();
    const cleanup = () => {
      signal?.removeEventListener("abort", abortRequest);
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
    const handleLoad = () => {
      finish(() => {
        const payload = parseJson(request.responseText);
        if (request.status >= 200 && request.status < 300) {
          resolve(payload as MediaApiResponse);
          return;
        }
        reject(new Error(messageFrom(payload, UPLOAD_FAILED)));
      });
    };
    const handleError = () => finish(() => reject(new Error(UPLOAD_FAILED)));
    const handleAbort = () =>
      finish(() =>
        reject(new DOMException("The upload was cancelled.", "AbortError")),
      );

    request.open("POST", "/api/media/upload");

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", handleLoad);
    request.addEventListener("error", handleError);
    request.addEventListener("abort", handleAbort);
    signal?.addEventListener("abort", abortRequest, { once: true });

    if (signal?.aborted) {
      abortRequest();
      return;
    }

    const body = new FormData();
    body.append("file", file, file.name);
    request.send(body);
  });
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
