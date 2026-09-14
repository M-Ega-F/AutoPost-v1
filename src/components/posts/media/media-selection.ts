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
  kind: "upload" | "url" | "library";
  storageKey: string | null;
  assetId?: string | null;
  sourceUrl: string | null;
  mimeType: string;
};

export type LocalFileSelection = {
  file: File;
  media: ComposerMedia;
};

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

export function createLocalFileSelection(
  file: File,
  previewUrl: string,
): LocalFileSelection {
  return { file, media: localFileMedia(file, previewUrl) };
}

export function selectLocalFile(
  file: File,
  createPreviewUrl: (file: File) => string = (value) =>
    URL.createObjectURL(value),
): LocalFileSelection {
  return createLocalFileSelection(file, createPreviewUrl(file));
}

export function createLocalUrlMedia(url: string): ComposerMedia {
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

export function createLibraryMedia(input: {
  id: string;
  fileName: string;
  previewUrl: string | null;
  mediaType: "image" | "video";
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}): ComposerMedia {
  return {
    kind: "library",
    storageKey: null,
    assetId: input.id,
    sourceUrl: null,
    mimeType: input.mimeType,
    fileName: input.fileName,
    previewUrl: input.previewUrl,
    mediaType: input.mediaType,
    fileSize: input.fileSize,
    width: input.width,
    height: input.height,
    duration: input.duration,
  };
}

export function revokePreviewUrls(
  urls: readonly string[],
  revoke: (url: string) => void = (url) => URL.revokeObjectURL(url),
): void {
  for (const url of urls) revoke(url);
}
