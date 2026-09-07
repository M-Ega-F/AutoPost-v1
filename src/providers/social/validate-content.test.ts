import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Platform } from "@/lib/status";
import { PLATFORM_LIMITS } from "@/lib/validation/limits";
import {
  allProviders,
  getProvider,
  type MediaAsset,
  type SocialAccountRecord,
  type SocialProvider,
  type ValidationResult,
} from "@/providers/social";
// `src/providers/social/index.ts` exposes the registry (`getProvider`), not the
// individual provider constants, so the concrete providers come from their own
// modules. The test below pins the registry back to these instances.
import { metaFacebookProvider, metaInstagramProvider } from "@/providers/social/meta";
import { tiktokProvider } from "@/providers/social/tiktok";
import { threadsProvider } from "@/providers/social/threads";
import { linkedinProvider } from "@/providers/social/linkedin";
import { xProvider } from "@/providers/social/x";

/* -------------------------------------------------------------------------- */

function account(platform: Platform): SocialAccountRecord {
  return {
    id: `account-${platform}`,
    userId: "user-1",
    platform,
    platformAccountId: `platform-${platform}`,
    username: `@${platform}`,
    displayName: platform,
    avatarUrl: null,
    encryptedAccessToken: "v1.iv.tag.ciphertext",
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    scopes: null,
    status: "active",
    lastErrorCode: null,
    lastErrorMessage: null,
    metadata: null,
  };
}

function media(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    mediaType: "image",
    mimeType: "image/jpeg",
    storageKey: "user-1/post-1.jpg",
    sourceUrl: null,
    fileSize: 2 * 1024 * 1024,
    width: 1080,
    height: 1080,
    duration: null,
    ...overrides,
  };
}

function video(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return media({
    mediaType: "video",
    mimeType: "video/mp4",
    storageKey: "user-1/post-1.mp4",
    width: 1080,
    height: 1920,
    duration: 30,
    ...overrides,
  });
}

function expectOk(result: ValidationResult): void {
  assert.deepEqual(result, { ok: true });
}

function expectFailure(
  result: ValidationResult,
  code: string,
  platform: Platform,
): void {
  assert.equal(result.ok, false, `expected a failure for ${platform}`);
  assert.equal(result.ok === false && result.code, code);
  assert.ok(result.ok === false && typeof result.message === "string");

  if (result.ok === false) {
    // The copy a non-technical user reads: no HTTP status, no raw code.
    assert.equal(/\bHTTP\b/i.test(result.message), false, result.message);
    assert.equal(/\b\d{3}\b/.test(result.message), false, result.message);
    assert.equal(result.message.toLowerCase().includes(code), false, result.message);
    assert.ok(result.message.length > 0);
    assert.ok(result.message.trim().endsWith("."), result.message);
  }
}

async function validate(
  provider: SocialProvider,
  platform: Platform,
  asset: MediaAsset,
  caption = "Hello world",
): Promise<ValidationResult> {
  return provider.validateContent({ account: account(platform), media: asset, caption });
}

const PROVIDERS: Array<{
  name: string;
  platform: Platform;
  provider: SocialProvider;
  captionLimit: number;
  maxDurationSec: number;
  minDurationSec: number;
}> = [
  {
    name: "metaInstagramProvider",
    platform: "instagram",
    provider: metaInstagramProvider,
    captionLimit: PLATFORM_LIMITS.instagram.captionLength,
    maxDurationSec: PLATFORM_LIMITS.instagram.maxDurationSec ?? 0,
    minDurationSec: PLATFORM_LIMITS.instagram.minDurationSec ?? 0,
  },
  {
    name: "metaFacebookProvider",
    platform: "facebook",
    provider: metaFacebookProvider,
    captionLimit: PLATFORM_LIMITS.facebook.captionLength,
    maxDurationSec: PLATFORM_LIMITS.facebook.maxDurationSec ?? 0,
    minDurationSec: PLATFORM_LIMITS.facebook.minDurationSec ?? 0,
  },
  {
    name: "tiktokProvider",
    platform: "tiktok",
    provider: tiktokProvider,
    captionLimit: PLATFORM_LIMITS.tiktok.captionLength,
    maxDurationSec: PLATFORM_LIMITS.tiktok.maxDurationSec ?? 0,
    minDurationSec: PLATFORM_LIMITS.tiktok.minDurationSec ?? 0,
  },
];

/* -------------------------------------------------------------------------- */

describe("the provider registry", () => {
  test("getProvider returns the same instances the tests exercise", () => {
    assert.equal(getProvider("instagram"), metaInstagramProvider);
    assert.equal(getProvider("facebook"), metaFacebookProvider);
    assert.equal(getProvider("tiktok"), tiktokProvider);
    assert.equal(getProvider("threads"), threadsProvider);
    assert.equal(getProvider("linkedin"), linkedinProvider);
    assert.equal(getProvider("x"), xProvider);
    assert.deepEqual(allProviders(), [
      metaInstagramProvider,
      metaFacebookProvider,
      tiktokProvider,
      threadsProvider,
      linkedinProvider,
      xProvider,
    ]);
  });
});

describe("provider.validateContent", () => {
  for (const { name, platform, provider, captionLimit, maxDurationSec, minDurationSec } of PROVIDERS) {
    describe(name, () => {
      test("an acceptable JPEG image passes", async () => {
        expectOk(await validate(provider, platform, media()));
      });

      test("an acceptable video passes", async () => {
        expectOk(
          await validate(provider, platform, video({ duration: minDurationSec })),
        );
        expectOk(
          await validate(provider, platform, video({ duration: maxDurationSec })),
        );
      });

      test("a caption at exactly the limit is allowed", async () => {
        expectOk(
          await validate(provider, platform, media(), "a".repeat(captionLimit)),
        );
      });

      test("an oversized file fails with media_too_large", async () => {
        expectFailure(
          await validate(
            provider,
            platform,
            media({ fileSize: 100 * 1024 * 1024 + 1 }),
          ),
          "media_too_large",
          platform,
        );
      });

      test("a file at exactly the size limit passes", async () => {
        expectOk(
          await validate(provider, platform, media({ fileSize: 100 * 1024 * 1024 })),
        );
      });

      test("a mime type outside the allow-list fails with unsupported_media", async () => {
        for (const mimeType of ["image/gif", "application/pdf"]) {
          expectFailure(
            await validate(provider, platform, media({ mimeType })),
            "unsupported_media",
            platform,
          );
        }
      });

      test("a video mime type on an image asset fails with unsupported_media", async () => {
        expectFailure(
          await validate(provider, platform, media({ mimeType: "video/mp4" })),
          "unsupported_media",
          platform,
        );
      });

      test("a caption over the limit fails with caption_too_long", async () => {
        expectFailure(
          await validate(provider, platform, media(), "a".repeat(captionLimit + 1)),
          "caption_too_long",
          platform,
        );
      });

      test("a video over the maximum duration fails with video_too_long", async () => {
        expectFailure(
          await validate(provider, platform, video({ duration: maxDurationSec + 1 })),
          "video_too_long",
          platform,
        );
      });

      test("a video under the minimum duration is rejected", async () => {
        // There is no `video_too_short` code: `validateMediaLimits` reports the
        // clip under `unsupported_media` and says so in a comment (http.ts).
        const result = await validate(
          provider,
          platform,
          video({ duration: Math.max(0, minDurationSec - 1) }),
        );
        assert.equal(result.ok, false);
        expectFailure(result, "unsupported_media", platform);
      });

      test("the failure message names the platform", async () => {
        const result = await validate(provider, platform, media({ mimeType: "image/gif" }));
        assert.equal(result.ok, false);
        const label =
          platform === "instagram" ? "Instagram" : platform === "facebook" ? "Facebook" : "TikTok";
        assert.equal(
          result.ok === false && result.message,
          `${label} rejected this media format.`,
        );
      });
    });
  }
});

describe("per-platform validation is genuinely per-platform", () => {
  test("a 500 second video: Instagram refuses it, Facebook and TikTok accept it", async () => {
    const long = video({ duration: 500 });

    expectFailure(
      await validate(metaInstagramProvider, "instagram", long),
      "video_too_long",
      "instagram",
    );
    expectOk(await validate(metaFacebookProvider, "facebook", long));
    expectOk(await validate(tiktokProvider, "tiktok", long));
  });

  test("a 30 second video is accepted everywhere", async () => {
    const clip = video({ duration: 30 });
    expectOk(await validate(metaInstagramProvider, "instagram", clip));
    expectOk(await validate(metaFacebookProvider, "facebook", clip));
    expectOk(await validate(tiktokProvider, "tiktok", clip));
  });

  test("a 5,000 character caption: Instagram and TikTok refuse it, Facebook accepts it", async () => {
    const caption = "a".repeat(5_000);

    expectFailure(
      await validate(metaInstagramProvider, "instagram", media(), caption),
      "caption_too_long",
      "instagram",
    );
    expectFailure(
      await validate(tiktokProvider, "tiktok", media(), caption),
      "caption_too_long",
      "tiktok",
    );
    expectOk(await validate(metaFacebookProvider, "facebook", media(), caption));
  });

  test("a 10,000 pixel wide image: only Instagram's upper bound rejects it", async () => {
    const huge = media({ width: 10_000, height: 10_000 });

    expectFailure(
      await validate(metaInstagramProvider, "instagram", huge),
      "unsupported_media",
      "instagram",
    );
    expectOk(await validate(metaFacebookProvider, "facebook", huge));
    expectOk(await validate(tiktokProvider, "tiktok", huge));
  });

  test("a 200 pixel image is too small for Instagram but fine for the others", async () => {
    const tiny = media({ width: 200, height: 200 });

    expectFailure(
      await validate(metaInstagramProvider, "instagram", tiny),
      "unsupported_media",
      "instagram",
    );
    expectOk(await validate(metaFacebookProvider, "facebook", tiny));
    expectOk(await validate(tiktokProvider, "tiktok", tiny));
  });

  test("validation reads the account's platform, not the provider's own", async () => {
    // The Meta providers share one implementation and dispatch on
    // `account.platform`, which is what makes one grant safe for two targets.
    const instagramAccount = account("instagram");
    const facebookAccount = account("facebook");
    const longCaption = "a".repeat(5_000);

    const asInstagram = await metaInstagramProvider.validateContent({
      account: instagramAccount,
      media: media(),
      caption: longCaption,
    });
    const asFacebook = await metaInstagramProvider.validateContent({
      account: facebookAccount,
      media: media(),
      caption: longCaption,
    });

    assert.equal(asInstagram.ok, false);
    assert.deepEqual(asFacebook, { ok: true });
  });

  test("an image with a null duration is never duration-checked", async () => {
    const still = media({ duration: null });
    expectOk(await validate(metaInstagramProvider, "instagram", still));
    expectOk(await validate(metaFacebookProvider, "facebook", still));
    expectOk(await validate(tiktokProvider, "tiktok", still));
  });
});
