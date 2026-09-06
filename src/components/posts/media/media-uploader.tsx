"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { ACCEPTED_UPLOAD_EXTENSIONS, UPLOAD_HINT } from "@/lib/validation/limits";
import { cn } from "@/lib/utils";

export function MediaUploader({
  onSelect,
  error,
  disabled = false,
}: {
  onSelect: (file: File) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = event.dataTransfer.files.item(0);
          if (file) onSelect(file);
        }}
        aria-describedby={error ? "media-upload-error" : "media-upload-hint"}
        className={cn(
          "flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 bg-card px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-accent/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isDragging && "border-secondary bg-secondary/10",
          disabled && "cursor-not-allowed",
          error && "border-destructive",
        )}
      >
        <UploadCloud
          className="size-8 text-primary"
          aria-hidden="true"
        />
        <span className="text-sm">
          Drag and drop an image or video, or click to browse
        </span>
        <span
          id="media-upload-hint"
          className="text-xs text-muted-foreground"
        >
          {UPLOAD_HINT}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_EXTENSIONS.join(",")}
        disabled={disabled}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.item(0);
          if (file) onSelect(file);
          event.target.value = "";
        }}
      />

      {error ? (
        <p id="media-upload-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
