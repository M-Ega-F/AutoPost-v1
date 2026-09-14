"use client";

import { ImageIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { createLibraryMedia, type ComposerMedia } from "./media-selection";

type Asset = {
  id: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video";
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  previewUrl: string | null;
};

function thumbnail(asset: Asset) {
  if (!asset.previewUrl) return <span className="grid size-full place-items-center"><ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" /></span>;
  if (asset.mediaType === "video") return <video src={asset.previewUrl} className="size-full object-contain" muted playsInline preload="metadata" />;
  // A signed preview URL is already the secure media boundary; optimization
  // would require configuring every possible storage origin.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.previewUrl} alt="" className="size-full object-cover transition group-hover:scale-105" />;
}

export function MediaLibraryPicker({
  onSelect,
  disabled = false,
}: {
  onSelect: (media: ComposerMedia) => void;
  disabled?: boolean;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/media?page=1&pageSize=12", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { assets?: Asset[]; error?: { message?: string }; message?: string } | null;
        if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? "We couldn't load your media library.");
        return payload?.assets ?? [];
      })
      .then((next) => {
        if (active) setAssets(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "We couldn't load your media library.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Loading library…</div>;
  }
  if (error) return <p className="rounded-md border border-destructive-border bg-destructive-surface p-3 text-sm text-destructive">{error}</p>;
  if (assets.length === 0) return <p className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">Your library is empty. Upload media from the Media Library page first.</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          disabled={disabled}
          className="group overflow-hidden rounded-lg border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          onClick={() => onSelect(createLibraryMedia(asset))}
        >
          <div className={`aspect-video overflow-hidden ${asset.mediaType === "video" ? "bg-black" : "bg-muted"}`}>
            {thumbnail(asset)}
          </div>
          <p className="truncate px-2 py-2 text-xs font-medium">{asset.fileName}</p>
        </button>
      ))}
    </div>
  );
}
