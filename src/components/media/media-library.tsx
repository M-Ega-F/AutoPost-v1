"use client";

import Link from "next/link";
import { FileImage, ImageIcon, Loader2, Search, Trash2, Upload, Video } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MediaAssetSummary, PaginatedMediaAssets } from "@/lib/domain/types";
import { formatMediaMeta } from "@/lib/time";
import { ACCEPTED_UPLOAD_EXTENSIONS, ACCEPTED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, UPLOAD_HINT } from "@/lib/validation/limits";

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    if ("error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error && typeof payload.error.message === "string") return payload.error.message;
    if ("message" in payload && typeof payload.message === "string") return payload.message;
  }
  return fallback;
}

function preview(asset: MediaAssetSummary) {
  if (!asset.previewUrl) return <span className="grid size-full place-items-center"><ImageIcon className="size-8 text-muted-foreground" aria-hidden="true" /></span>;
  if (asset.mediaType === "video") return <video src={asset.previewUrl} className="size-full object-contain bg-black" controls muted playsInline preload="metadata" />;
  // A signed preview URL is already the secure media boundary; optimization
  // would require configuring every possible storage origin.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.previewUrl} alt={asset.fileName} className="size-full object-cover" />;
}

export function MediaLibrary({ initial }: { initial: PaginatedMediaAssets }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState(initial.items);
  const [pagination, setPagination] = useState(initial);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "image" | "video">("all");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load(page = 1, nextSearch = search, nextType = type) {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "24" });
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      if (nextType !== "all") params.set("type", nextType);
      const response = await fetch(`/api/media?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "We couldn't load your media library."));
      setAssets(payload.assets ?? []);
      setPagination({ items: payload.assets ?? [], ...payload.pagination });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "We couldn't load your media library.");
    } finally {
      setLoading(false);
    }
  }

  async function upload(file: File) {
    const extension = file.name.includes(".") ? `.${file.name.split(".").pop()?.toLowerCase()}` : "";
    const typeAllowed = (ACCEPTED_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type);
    const extensionAllowed = (ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension);
    if (file.size > MAX_UPLOAD_BYTES || (!typeAllowed && !extensionAllowed)) {
      setMessage(file.size > MAX_UPLOAD_BYTES ? `This file is too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` : "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.");
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      const response = await fetch("/api/media", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "We couldn't upload this file."));
      await load(1);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "We couldn't upload this file.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(asset: MediaAssetSummary) {
    if (!window.confirm(`Delete ${asset.fileName}?`)) return;
    setMessage(null);
    const response = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(errorMessage(payload, "We couldn't delete this media asset."));
      return;
    }
    await load(pagination.page);
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-lg p-4 shadow-none md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <form className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void load(1); }}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search file names" className="pl-9" aria-label="Search media library" />
            </div>
            <select value={type} onChange={(event) => { const value = event.target.value as typeof type; setType(value); void load(1, search, value); }} className="h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Filter media type">
              <option value="all">All media</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
            <Button type="submit" variant="secondary" disabled={loading}><Search className="size-4" aria-hidden="true" />Search</Button>
          </form>
          <div className="space-y-1 lg:text-right">
            <Button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
              {uploading ? "Uploading…" : "Upload media"}
            </Button>
            <p className="text-xs text-muted-foreground">{UPLOAD_HINT}</p>
          </div>
          <input ref={inputRef} type="file" accept={ACCEPTED_UPLOAD_EXTENSIONS.join(",")} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        </div>
        {message ? <p className="mt-4 rounded-md border border-destructive-border bg-destructive-surface p-3 text-sm text-destructive">{message}</p> : null}
      </Card>

      {loading ? <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Loading media…</div> : assets.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-none"><CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center"><FileImage className="size-10 text-primary" aria-hidden="true" /><div><p className="font-medium">{search || type !== "all" ? "No media matches this filter" : "Your media library is empty"}</p><p className="mt-1 text-sm text-muted-foreground">{search || type !== "all" ? "Try a different search or filter." : "Upload an image or video to reuse it in future posts."}</p></div></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <Card key={asset.id} className="gap-0 overflow-hidden rounded-lg p-0 shadow-none">
              <div className={`aspect-video overflow-hidden ${asset.mediaType === "video" ? "bg-black" : "bg-muted"}`}>{preview(asset)}</div>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-medium" title={asset.fileName}>{asset.fileName}</p><Badge variant="outline">{asset.mediaType === "video" ? <Video className="size-3" aria-hidden="true" /> : <ImageIcon className="size-3" aria-hidden="true" />}{asset.mediaType}</Badge></div>
                <p className="text-xs text-muted-foreground">{formatMediaMeta(asset)}</p>
                <div className="flex items-center justify-between gap-2"><Button asChild size="sm" variant="secondary"><Link href={`/create-post?mediaId=${asset.id}`}>Use in post</Link></Button><Button type="button" size="sm" variant="danger" onClick={() => void remove(asset)}><Trash2 className="size-4" aria-hidden="true" />Delete</Button></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 ? <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Media library pagination"><p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages} · {pagination.total} {pagination.total === 1 ? "asset" : "assets"}</p><div className="flex gap-1"><Button type="button" variant="ghost" size="sm" disabled={pagination.page <= 1 || loading} onClick={() => void load(pagination.page - 1)}>Previous</Button><Button type="button" variant="ghost" size="sm" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => void load(pagination.page + 1)}>Next</Button></div></nav> : null}
    </div>
  );
}
