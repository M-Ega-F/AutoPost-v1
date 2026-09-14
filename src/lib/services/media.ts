import "server-only";

import {
  createMediaAssetForUser,
  deleteMediaAssetForUser,
  getMediaAssetForUser,
  listMediaAssetsForUser,
  type MediaAssetInput,
  type MediaLibraryQuery,
} from "@/lib/domain/media";
import type { MediaAssetSummary, PaginatedMediaAssets } from "@/lib/domain/types";

export function listMediaForUser(
  userId: string,
  query: MediaLibraryQuery,
): Promise<PaginatedMediaAssets> {
  return listMediaAssetsForUser(userId, query);
}

export function getMediaForUser(userId: string, assetId: string): Promise<MediaAssetSummary> {
  return getMediaAssetForUser(userId, assetId);
}

export function createMediaForUser(
  userId: string,
  input: MediaAssetInput,
): Promise<MediaAssetSummary> {
  return createMediaAssetForUser(userId, input);
}

export function deleteMediaForUser(userId: string, assetId: string): Promise<void> {
  return deleteMediaAssetForUser(userId, assetId);
}
