"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  ACCEPTED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/validation/limits";
import {
  createLocalUrlMedia,
  revokePreviewUrls,
  selectLocalFile,
  type ComposerMedia,
} from "./media-selection";
import {
  persistMediaUrl,
  persistSelectedFile,
} from "./media-persistence";

export type { ComposerMedia, LocalFileSelection, MediaPreviewItem } from "./media-selection";

export type MediaResult =
  | { ok: true; media: ComposerMedia }
  | { ok: false; message: string };

const UNSUPPORTED_TYPE =
  "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.";
const TOO_LARGE = `This file is too large. Maximum size is ${Math.round(
  MAX_UPLOAD_BYTES / (1024 * 1024),
)} MB.`;
const INVALID_URL = "Invalid media URL.";
const HTTPS_ONLY = "Only HTTPS URLs are supported.";
const MEDIA_REQUIRED = "Add media before publishing.";

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
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

export function useMediaUpload() {
  const [pending, setPending] = useState<ComposerMedia | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFile = useRef<File | null>(null);
  const objectUrls = useRef<string[]>([]);
  const persistenceAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const urls = objectUrls;
    return () => {
      revokePreviewUrls(urls.current);
      urls.current = [];
    };
  }, []);

  const clearBlobPreviews = useCallback(() => {
    revokePreviewUrls(objectUrls.current);
    objectUrls.current = [];
  }, []);

  const reset = useCallback(() => {
    persistenceAbort.current?.abort();
    persistenceAbort.current = null;
    clearBlobPreviews();
    selectedFile.current = null;
    setPending(null);
    setProgress(0);
    setUploading(false);
    setResolving(false);
    setError(null);
  }, [clearBlobPreviews]);

  const cancelPersistence = useCallback(() => {
    persistenceAbort.current?.abort();
    persistenceAbort.current = null;
    setUploading(false);
    setResolving(false);
  }, []);

  // Add only updates local composer state. It does not contact the server.
  const selectFile = useCallback(
    async (file: File): Promise<MediaResult> => {
      setError(null);

      const invalid = validateFile(file);
      if (invalid) {
        setError(invalid);
        return { ok: false, message: invalid };
      }

      clearBlobPreviews();
      const selection = selectLocalFile(file);
      objectUrls.current.push(selection.media.previewUrl as string);
      selectedFile.current = selection.file;
      const media = selection.media;
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
      const media = createLocalUrlMedia(url);
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
      const controller = new AbortController();
      persistenceAbort.current = controller;

      try {
        if (media.kind === "upload") {
          const file = selectedFile.current;
          if (!file) return { ok: false, message: MEDIA_REQUIRED };

          setUploading(true);
          setProgress(0);
           const result = await persistSelectedFile(file, setProgress, controller.signal);
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
         const result = await persistMediaUrl(media.sourceUrl, controller.signal);
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
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return { ok: false, message: "Publishing cancelled." };
        }
        const message =
          cause instanceof Error
            ? cause.message
            : "We couldn't upload this file. Check your connection and try again.";
        setError(message);
        return { ok: false, message };
      } finally {
        if (persistenceAbort.current === controller) {
          persistenceAbort.current = null;
        }
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
    selectFile,
    addFromUrl,
    persistPendingMedia,
    cancelPersistence,
    reset,
  };
}
