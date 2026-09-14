import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { eq } from "drizzle-orm";

import {
  createMediaAssetForUser,
  getMediaAssetForUser,
  isMediaAssetReferenced,
  listMediaAssetsForUser,
  deleteMediaAssetForUser,
} from "@/lib/domain/media";
import { mediaAssets, postMedia } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { deleteDraftForUser } from "@/lib/services/posts";

import { db, seedUser } from "./db-harness";
import { OTHER_USER_ID, USER_ID, insertPost, setupTestDatabase } from "./fixtures";

beforeEach(async () => {
  await setupTestDatabase();
  await seedUser(OTHER_USER_ID);
});

function assetInput(name: string, storageKey: string) {
  return {
    storageKey,
    fileName: name,
    mimeType: "image/jpeg",
    mediaType: "image" as const,
    fileSize: 1_024,
    width: 1200,
    height: 800,
    duration: null,
  };
}

describe("media library domain", () => {
  test("lists only owned assets with search, type filters and pagination", async () => {
    await createMediaAssetForUser(USER_ID, assetInput("launch.jpg", `${USER_ID}/launch.jpg`));
    await createMediaAssetForUser(USER_ID, { ...assetInput("demo.mp4", `${USER_ID}/demo.mp4`), mimeType: "video/mp4", mediaType: "video" });
    await createMediaAssetForUser(OTHER_USER_ID, assetInput("private.jpg", `${OTHER_USER_ID}/private.jpg`));

    const images = await listMediaAssetsForUser(USER_ID, { page: 1, pageSize: 1, mediaType: "image" });
    assert.equal(images.total, 1);
    assert.equal(images.items[0]?.fileName, "launch.jpg");

    const searched = await listMediaAssetsForUser(USER_ID, { page: 1, pageSize: 24, search: "launch" });
    assert.equal(searched.total, 1);
    assert.equal(searched.items[0]?.fileName, "launch.jpg");
  });

  test("enforces ownership and blocks deletion while a post references the asset", async () => {
    const asset = await createMediaAssetForUser(USER_ID, assetInput("used.jpg", `${USER_ID}/used.jpg`));
    await assert.rejects(
      getMediaAssetForUser(OTHER_USER_ID, asset.id),
      (error: unknown) => error instanceof AppError && error.code === "not_found",
    );

    const postId = await insertPost({ userId: USER_ID, status: "draft" });
    await db
      .update(postMedia)
      .set({ storageKey: `${USER_ID}/used.jpg` })
      .where(eq(postMedia.postId, postId));

    assert.equal(await isMediaAssetReferenced(USER_ID, `${USER_ID}/used.jpg`), true);
    await assert.rejects(
      deleteMediaAssetForUser(USER_ID, asset.id),
      (error: unknown) => error instanceof AppError && error.code === "conflict",
    );

    const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, asset.id));
    assert.equal(rows.length, 1);
  });

  test("post cleanup keeps a library asset and its storage reference alive", async () => {
    const storageKey = `${USER_ID}/kept.jpg`;
    const asset = await createMediaAssetForUser(USER_ID, assetInput("kept.jpg", storageKey));
    const postId = await insertPost({ userId: USER_ID, status: "draft" });
    await db.update(postMedia).set({ storageKey }).where(eq(postMedia.postId, postId));

    await deleteDraftForUser(USER_ID, postId);

    const [remaining] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, asset.id));
    assert.ok(remaining);
  });

  test("deletes an unused asset and asks storage to remove its object", async () => {
    const storageKey = `${USER_ID}/unused.jpg`;
    const asset = await createMediaAssetForUser(USER_ID, assetInput("unused.jpg", storageKey));
    const removed: string[] = [];

    await deleteMediaAssetForUser(USER_ID, asset.id, async (key) => {
      removed.push(key);
    });

    const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, asset.id));
    assert.equal(rows.length, 0);
    assert.deepEqual(removed, [storageKey]);
  });
});
