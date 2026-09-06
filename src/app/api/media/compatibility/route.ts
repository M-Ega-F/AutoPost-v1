import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { PLATFORM_LABELS, humanErrorMessage, type ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { listActiveAccounts } from "@/lib/domain/accounts";
import { getProvider } from "@/providers/social";
import type { MediaAsset, ValidationResult } from "@/providers/social/types";
import { PLATFORMS, type Platform } from "@/lib/status";
import {
  ACCEPTED_UPLOAD_MIME_TYPES,
  PLATFORM_LIMITS,
} from "@/lib/validation/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CAPTION_LENGTH = Math.max(
  ...Object.values(PLATFORM_LIMITS).map((limits) => limits.captionLength),
);

const platformSchema = z.custom<Platform>(
  (value) => typeof value === "string" && (PLATFORMS as readonly string[]).includes(value),
  { message: "Unsupported platform." },
);

const nullableInt = z.number().int().nonnegative().nullish();

/**
 * The client sends what it knows about the media; the server re-validates it
 * against each platform's own rules before the post can ever be scheduled.
 */
const bodySchema = z.object({
  storageKey: z.string().trim().min(1).max(512).nullish(),
  sourceUrl: z.string().trim().url().max(2048).nullish(),
  mediaType: z.enum(["image", "video"]),
  mimeType: z.string().trim().max(128).refine(
    (value) => (ACCEPTED_UPLOAD_MIME_TYPES as readonly string[]).includes(value),
    { message: "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV." },
  ),
  fileSize: nullableInt,
  width: nullableInt,
  height: nullableInt,
  duration: z.number().nonnegative().nullish(),
  caption: z.string().max(MAX_CAPTION_LENGTH).default(""),
  platforms: z.array(platformSchema).min(1).max(PLATFORMS.length),
});

type CompatibilityResult = {
  platform: Platform;
  ok: boolean;
  code?: ErrorCode | "not_configured";
  message?: string;
};

function toResult(
  platform: Platform,
  validation: ValidationResult,
): CompatibilityResult {
  if (validation.ok) return { platform, ok: true };
  return {
    platform,
    ok: false,
    code: validation.code,
    message: validation.message || humanErrorMessage(platform, validation.code),
  };
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json(
      { message: "Please log in to continue." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ??
        "We couldn't check this media. Try uploading it again.";
      return NextResponse.json({ message }, { status: 400 });
    }

    const input = parsed.data;

    // The stored object must belong to this user: the key is the only thing
    // that stands between a request and someone else's media.
    if (input.storageKey && !input.storageKey.startsWith(`${userId}/`)) {
      return NextResponse.json(
        { message: "We couldn't read this media file. Try uploading it again." },
        { status: 400 },
      );
    }

    if (!input.storageKey && !input.sourceUrl) {
      return NextResponse.json(
        { message: "Add media before publishing." },
        { status: 400 },
      );
    }

    const media: MediaAsset = {
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      storageKey: input.storageKey ?? null,
      sourceUrl: input.sourceUrl ?? null,
      fileSize: input.fileSize ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      duration: input.duration ?? null,
    };

    const caption = input.caption.trim();
    const accounts = await listActiveAccounts(userId);
    const byPlatform = new Map(accounts.map((account) => [account.platform, account]));

    const results = await Promise.all(
      input.platforms.map(async (platform): Promise<CompatibilityResult> => {
        const label = PLATFORM_LABELS[platform];
        const account = byPlatform.get(platform);

        if (!account) {
          return {
            platform,
            ok: false,
            code: "account_disconnected",
            message: `Connect ${label} to publish there.`,
          };
        }

        const provider = getProvider(platform);
        if (!provider.isConfigured()) {
          return {
            platform,
            ok: false,
            code: "not_configured",
            message: `We couldn't check ${label} right now. Try again.`,
          };
        }

        try {
          return toResult(
            platform,
            await provider.validateContent({ account, media, caption }),
          );
        } catch (error) {
          logger.error("content validation failed", {
            platform,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            platform,
            ok: false,
            code: "unknown",
            message: `We couldn't check ${label} right now. Try again.`,
          };
        }
      }),
    );

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    logger.error("compatibility route failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { message: "We couldn't check this media. Try again." },
      { status: 500 },
    );
  }
}
