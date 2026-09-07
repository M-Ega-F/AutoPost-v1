import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createLocalFileSelection,
  createLocalUrlMedia,
  revokePreviewUrls,
  selectLocalFile,
} from "@/components/posts/media/media-selection";

describe("media selection", () => {
  test("keeps a selected File and creates a browser-local preview without storage", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "clip.png", {
      type: "image/png",
    });
    const selection = createLocalFileSelection(file, "blob:local-preview");

    assert.strictEqual(selection.file, file);
    assert.deepEqual(selection.media, {
      kind: "upload",
      storageKey: null,
      sourceUrl: null,
      mimeType: "image/png",
      fileName: "clip.png",
      previewUrl: "blob:local-preview",
      mediaType: "image",
      fileSize: 3,
      width: null,
      height: null,
      duration: null,
    });
  });

  test("creates the preview through the browser object URL boundary", () => {
    const file = new File([new Uint8Array([1])], "clip.mp4", {
      type: "video/mp4",
    });
    const createdFor: File[] = [];
    const selection = selectLocalFile(file, (value) => {
      createdFor.push(value);
      return "blob:video-preview";
    });

    assert.deepEqual(createdFor, [file]);
    assert.strictEqual(selection.media.previewUrl, "blob:video-preview");
    assert.strictEqual(selection.media.mediaType, "video");
  });

  test("accepts a media URL locally without resolving or storing it", () => {
    const media = createLocalUrlMedia("https://cdn.example.test/photo.webp");

    assert.strictEqual(media.kind, "url");
    assert.strictEqual(media.storageKey, null);
    assert.strictEqual(media.sourceUrl, "https://cdn.example.test/photo.webp");
    assert.strictEqual(media.previewUrl, "https://cdn.example.test/photo.webp");
    assert.strictEqual(media.mediaType, "image");
  });

  test("revokes every browser-local preview when media is replaced or removed", () => {
    const revoked: string[] = [];

    revokePreviewUrls(["blob:first", "blob:second"], (url) => {
      revoked.push(url);
    });

    assert.deepEqual(revoked, ["blob:first", "blob:second"]);
  });
});
