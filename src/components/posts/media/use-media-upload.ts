"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  ACCEPTED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/validation/limits";

export type MediaPreviewItem = {
  fileName: string;
  previewUrl: string | null;
  mediaType: "image" | "video";
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export type ComposerMedia = MediaPreviewItem & {
  kind: "upload" | "url";
  storageKey: string | null;
  sourceUrl: string | null;
  mimeType: string;
};

export type MediaResult =
  | { ok: true; media: ComposerMedia }
  | { ok: false; message: string };

type MediaApiResponse = {
  storageKey: string;
  sourceUrl?: string | null;
  mediaType: "image" | "video";
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

const UNSUPPORTED_TYPE =
  "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.";
const TOO_LARGE = `This file is too large. Maximum size is ${Math.round(
  MAX_UPLOAD_BYTES / (1024 * 1024),
)} MB.`;
const UPLOAD_FAILED =
  "We couldn't upload this file. Check your connection and try again.";
const INVALID_URL = "Invalid media URL.";
const HTTPS_ONLY = "Only HTTPS URLs are supported.";
const URL_UNREACHABLE =
  "We couldn't reach this URL. Check that it's publicly accessible.";
const MEDIA_REQUIRED = "Add media before publishing.";

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

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}

function mediaTypeFromExtension(extension: string): "image" | "video" {
  return extension === ".mp4" || extension === ".mov" ? "video" : "image";
}

function mediaTypeFromFile(file: File): "image" | "video" {
  if (file.type.startsWith("video/")) return "video";
  return mediaTypeFromExtension(extensionOf(file.name));
}

function mediaTypeFromUrl(url: string): "image" | "video" {
  try {
    return mediaTypeFromExtension(extensionOf(new URL(url).pathname));
  } catch {
    return "image";
  }
}

function mimeTypeFromFile(file: File): string {
  return file.type || "application/octet-stream";
}

function mimeTypeFromUrl(url: string): string {
  let extension = "";
  try {
    extension = extensionOf(new URL(url).pathname);
  } catch {
    return "application/octet-stream";
  }

  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return mimeTypes[extension] ?? "application/octet-stream";
}

/** A fast local check so the user is not left waiting for a doomed upload. */
function validateFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return TOO_LARGE;

  const typeAllowed = (ACCEPTED_UPLOAD_MIME_TYPES as readonly string[]).includes(
    file.type,
  );
  // Some browsers report an empty type for `.mov`; the extension is the fallback.
  const extensionAllowed = (
    ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]
  ).includes(extensionOf(file.name));

  return typeAllowed || extensionAllowed ? null : UNSUPPORTED_TYPE;
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : parsed.hostname;
  } catch {
    return url;
  }
}

function localFileMedia(file: File, previewUrl: string): ComposerMedia {
  return {
    kind: "upload",
    storageKey: null,
    sourceUrl: null,
    mimeType: mimeTypeFromFile(file),
    fileName: file.name,
    previewUrl,
    mediaType: mediaTypeFromFile(file),
    fileSize: file.size,
    width: null,
    height: null,
    duration: null,
  };
}

function localUrlMedia(url: string): ComposerMedia {
  return {
    kind: "url",
    storageKey: null,
    sourceUrl: url,
    mimeType: mimeTypeFromUrl(url),
    fileName: fileNameFromUrl(url),
    previewUrl: url,
    mediaType: mediaTypeFromUrl(url),
    fileSize: null,
    width: null,
    height: null,
    duration: null,
  };
}

/** XHR reports upload progress, which the composer displays during publish. */
function postUpload(
  file: File,
  onProgress: (percent: number) => void,
): Promise<MediaApiResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/media/upload");

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      const payload = parseJson(request.responseText);
      if (request.status >= 200 && request.status < 300) {
        resolve(payload as MediaApiResponse);
        return;
      }
      reject(new Error(messageFrom(payload, UPLOAD_FAILED)));
    });

    request.addEventListener("error", () => reject(new Error(UPLOAD_FAILED)));
    request.addEventListener("abort", () => reject(new Error(UPLOAD_FAILED)));

    const body = new FormData();
    body.append("file", file, file.name);
    request.send(body);
  });
}

async function resolveRemoteUrl(url: string): Promise<MediaApiResponse> {
  const response = await fetch("/api/media/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(messageFrom(payload, URL_UNREACHABLE));
  }

  return payload as MediaApiResponse;
}

export function useMediaUpload() {
  const [pending, setPending] = useState<ComposerMedia | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFile = useRef<File | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const urls = objectUrls;
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    };
  }, []);

  const clearBlobPreviews = useCallback(() => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current = [];
  }, []);

  const reset = useCallback(() => {
    clearBlobPreviews();
    selectedFile.current = null;
    setPending(null);
    setProgress(0);
    setUploading(false);
    setResolving(false);
    setError(null);
  }, [clearBlobPreviews]);

  // Add only updates local composer state. It does not contact the server.
  const uploadFile = useCallback(
    async (file: File): Promise<MediaResult> => {
      setError(null);

      const invalid = validateFile(file);
      if (invalid) {
        setError(invalid);
        return { ok: false, message: invalid };
      }

      clearBlobPreviews();
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.push(previewUrl);
      selectedFile.current = file;

      const media = localFileMedia(file, previewUrl);
      setPending(media);
      setProgress(0);
      return { ok: true, media };
    },
    [clearBlobPreviews],
  );

  // Add only validates the URL and stores it as the preview source. SSRF
  // validation and remote download happen in persistPendingMedia at publish.
  const addFromUrl = useCallback(
    async (rawUrl: string): Promise<MediaResult> => {
      setError(null);

      const url = rawUrl.trim();
      if (url.length === 0) {
        setError(INVALID_URL);
        return { ok: false, message: INVALID_URL };
      }
      if (!/^https:\/\//i.test(url)) {
        setError(HTTPS_ONLY);
        return { ok: false, message: HTTPS_ONLY };
      }

      try {
        new URL(url);
      } catch {
        setError(INVALID_URL);
        return { ok: false, message: INVALID_URL };
      }

      clearBlobPreviews();
      selectedFile.current = null;
      const media = localUrlMedia(url);
      setPending(media);
      setProgress(0);
      return { ok: true, media };
    },
    [clearBlobPreviews],
  );

  // Persistent storage is contacted only from the Publish/Schedule flow.
  const persistPendingMedia = useCallback(
    async (media: ComposerMedia): Promise<MediaResult> => {
      if (media.storageKey) return { ok: true, media };

      setError(null);

      try {
        if (media.kind === "upload") {
          const file = selectedFile.current;
          if (!file) return { ok: false, message: MEDIA_REQUIRED };

          setUploading(true);
          setProgress(0);
          const result = await postUpload(file, setProgress);
          const persisted: ComposerMedia = {
            ...media,
            storageKey: result.storageKey,
            mimeType: result.mimeType,
            mediaType: result.mediaType,
            fileSize: result.fileSize ?? file.size,
            width: result.width ?? null,
            height: result.height ?? null,
            duration: result.duration ?? null,
          };
          setPending(persisted);
          return { ok: true, media: persisted };
        }

        if (!media.sourceUrl) return { ok: false, message: INVALID_URL };

        setResolving(true);
        const result = await resolveRemoteUrl(media.sourceUrl);
        const persisted: ComposerMedia = {
          ...media,
          storageKey: result.storageKey,
          sourceUrl: result.sourceUrl ?? media.sourceUrl,
          mimeType: result.mimeType,
          mediaType: result.mediaType,
          fileSize: result.fileSize ?? null,
          width: result.width ?? null,
          height: result.height ?? null,
          duration: result.duration ?? null,
        };
        setPending(persisted);
        return { ok: true, media: persisted };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : UPLOAD_FAILED;
        setError(message);
        return { ok: false, message };
      } finally {
        setUploading(false);
        setResolving(false);
      }
    },
    [],
  );

  return {
    pending,
    progress,
    uploading,
    resolving,
    error,
    uploadFile,
    addFromUrl,
    persistPendingMedia,
    reset,
  };
}
