import type { PlatformCapabilities } from "@/lib/domain/types";
import { PLATFORM_LIMITS } from "@/lib/validation/limits";
import type { Platform } from "@/lib/status";

/**
 * Capabilities are derived from the same platform limits used by server-side
 * post validation. Carousel and text-only posts are intentionally false in
 * this MVP because the product stores one media asset per post.
 */
export function platformCapabilitiesFor(
  platform: Platform,
): PlatformCapabilities {
  const limits = PLATFORM_LIMITS[platform];

  return {
    image: limits.imageMimeTypes.length > 0,
    video: limits.videoMimeTypes.length > 0,
    carousel: false,
    textOnly: false,
    scheduling: true,
    multipleAccounts: true,
    analytics: false,
  };
}
