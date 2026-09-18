import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isAcceptedMediaExtension,
  isAcceptedMediaMimeHint,
  isMediaStorageKeyForUser,
  mediaExtension,
} from "@/lib/media/upload-contract";

describe("direct media upload contract", () => {
  test("accepts supported extensions and rejects path-like names", () => {
    assert.equal(mediaExtension("clip.MP4"), ".mp4");
    assert.equal(isAcceptedMediaExtension("clip.mp4"), true);
    assert.equal(isAcceptedMediaExtension("clip.mov"), true);
    assert.equal(isAcceptedMediaExtension("clip.exe"), false);
    assert.equal(isAcceptedMediaExtension("clip"), true);
  });

  test("allows empty browser MIME hints for authoritative server sniffing", () => {
    assert.equal(isAcceptedMediaMimeHint(null), true);
    assert.equal(isAcceptedMediaMimeHint("application/octet-stream"), true);
    assert.equal(isAcceptedMediaMimeHint("video/mp4"), true);
    assert.equal(isAcceptedMediaMimeHint("video/webm"), false);
  });

  test("only accepts a single server-generated object under the current user", () => {
    const userId = "229d8802-c8f7-430e-a29a-f2df5d73553d";
    assert.equal(isMediaStorageKeyForUser(`${userId}/clip.mp4`, userId), true);
    assert.equal(isMediaStorageKeyForUser("other-user/clip.mp4", userId), false);
    assert.equal(isMediaStorageKeyForUser(`${userId}/nested/clip.mp4`, userId), false);
    assert.equal(isMediaStorageKeyForUser(`${userId}/../clip.mp4`, userId), false);
  });
});
