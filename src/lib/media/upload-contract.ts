import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  ACCEPTED_UPLOAD_MIME_TYPES,
} from "@/lib/validation/limits";

export function mediaExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}

export function isAcceptedMediaExtension(fileName: string): boolean {
  const extension = mediaExtension(fileName);
  return (
    extension.length === 0 ||
    (ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)
  );
}

export function isAcceptedMediaMimeHint(mimeType: string | null): boolean {
  return (
    !mimeType ||
    mimeType === "application/octet-stream" ||
    (ACCEPTED_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)
  );
}

export function isMediaStorageKeyForUser(
  storageKey: string,
  userId: string,
): boolean {
  const [ownerId, objectName, ...rest] = storageKey.split("/");
  return ownerId === userId && Boolean(objectName) && rest.length === 0;
}
