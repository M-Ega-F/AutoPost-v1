"use client";

import { ImageIcon, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatMediaMeta } from "@/lib/time";
import type { MediaPreviewItem } from "./use-media-upload";

export function MediaPreview({
  item,
  uploading = false,
  progress = 0,
  onRemove,
}: {
  item: MediaPreviewItem;
  uploading?: boolean;
  progress?: number;
  onRemove: () => void;
}) {
  const [previewError, setPreviewError] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors sm:flex-row sm:items-center">
      <div
        className={`relative aspect-video w-full max-w-sm shrink-0 overflow-hidden rounded-lg border border-border/70 ring-1 ring-black/5 sm:h-24 sm:w-36 ${
          item.mediaType === "video" ? "bg-black" : "bg-muted"
        }`}
      >
        {item.previewUrl === null ? (
          <span className="grid size-full place-items-center">
            <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
        ) : previewError ? (
          <span className="flex size-full items-center justify-center p-2 text-center text-xs text-destructive">
            We couldn&apos;t read this media file. Try uploading it again.
          </span>
        ) : item.mediaType === "video" ? (
          <>
            <video
              src={item.previewUrl}
              className="size-full object-contain bg-black"
              controls
              muted
              playsInline
              preload="metadata"
              onError={() => setPreviewError(true)}
              onLoadedData={() => setPreviewError(false)}
            />
          </>
        ) : (
          // A local or remote preview: next/image cannot optimize either.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.previewUrl}
            alt=""
            className="size-full object-contain bg-muted"
            onError={() => setPreviewError(true)}
            onLoad={() => setPreviewError(false)}
          />
        )}
      </div>

      <div className="w-full min-w-0 flex-1 space-y-2">
        <p className="truncate text-sm font-medium">{item.fileName}</p>
        {uploading ? (
          <>
            <Progress
              value={progress}
              className="h-2"
              aria-label="Upload progress"
            />
            <p className="text-xs text-muted-foreground">
              Uploading… {progress}%
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {formatMediaMeta(item)}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 self-end transition-colors hover:bg-destructive/10 hover:text-destructive sm:size-9 sm:self-auto"
        onClick={onRemove}
        disabled={uploading}
        aria-label="Remove media"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
