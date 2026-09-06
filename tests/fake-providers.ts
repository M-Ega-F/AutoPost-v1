import type { ErrorCode } from "@/lib/errors";
import type { Platform, SocialAccountStatus } from "@/lib/status";
import type {
  ConnectedAccountDraft,
  MediaAsset,
  PublishInput,
  PublishResult,
  PublishStatusResult,
  RefreshResult,
  SocialAccountRecord,
  SocialProvider,
  ValidationResult,
} from "@/providers/social/types";

/**
 * Scriptable stand-ins for Instagram, Facebook and TikTok.
 *
 * The social APIs are the external boundary. Everything the plan cares about —
 * failure isolation, partial failure, retry scope, async status, auth failure —
 * is decided by OUR code, so the provider only needs to behave in a controlled
 * way and record what it was asked to do.
 */

export type Script =
  | { kind: "published"; externalPostId?: string | null }
  | {
      kind: "accepted";
      externalPostId?: string | null;
      /** What `getPublishStatus` reports on the follow-up check. */
      then: "published" | "processing" | "failed";
      errorCode?: ErrorCode;
    }
  | { kind: "error"; code: ErrorCode; retryable?: boolean };

const scripts = new Map<Platform, Script>();
const publishCalls: Array<{ platform: Platform; postPlatformId: string }> = [];
const statusCalls: Array<{ platform: Platform; externalPostId: string | null }> = [];

export function setScript(platform: Platform, script: Script): void {
  scripts.set(platform, script);
}

export function setScripts(entries: Partial<Record<Platform, Script>>): void {
  for (const [platform, script] of Object.entries(entries)) {
    if (script) scripts.set(platform as Platform, script);
  }
}

export function publishCallsFor(platform?: Platform) {
  return platform
    ? publishCalls.filter((call) => call.platform === platform)
    : [...publishCalls];
}

export function statusCallsFor(platform?: Platform) {
  return platform
    ? statusCalls.filter((call) => call.platform === platform)
    : [...statusCalls];
}

export function resetProviders(): void {
  scripts.clear();
  publishCalls.length = 0;
  statusCalls.length = 0;
}

function defaultScript(): Script {
  return { kind: "published", externalPostId: null };
}

function scriptFor(platform: Platform): Script {
  return scripts.get(platform) ?? defaultScript();
}

function makeProvider(platform: Platform): SocialProvider {
  return {
    platform,

    isConfigured: () => true,

    async getAuthorizationUrl({ state }): Promise<string> {
      return `https://example.test/oauth/${platform}?state=${encodeURIComponent(state)}`;
    },

    async handleCallback(): Promise<ConnectedAccountDraft[]> {
      return [
        {
          platform,
          platformAccountId: `${platform}-account`,
          username: `${platform}_user`,
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
      ];
    },

    async refreshToken(): Promise<RefreshResult> {
      return {
        accessToken: `refreshed-${platform}`,
        refreshToken: "refresh-token",
        tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      };
    },

    async validateAccount(): Promise<SocialAccountStatus> {
      return "active";
    },

    async validateContent(): Promise<ValidationResult> {
      return { ok: true };
    },

    async publish(input: PublishInput): Promise<PublishResult> {
      publishCalls.push({
        platform,
        postPlatformId: input.postPlatformId,
      });

      const script = scriptFor(platform);

      if (script.kind === "error") {
        const { ProviderError } = await import("@/lib/errors");
        throw new ProviderError({
          code: script.code,
          retryable: script.retryable,
          message: `${platform} failed`,
        });
      }

      const externalPostId =
        script.externalPostId ?? `ext-${platform}-${publishCalls.length}`;

      if (script.kind === "published") {
        return { status: "published", externalPostId };
      }

      return {
        status: "accepted",
        externalPostId,
        statusToken: externalPostId,
      };
    },

    async getPublishStatus(input): Promise<PublishStatusResult> {
      statusCalls.push({
        platform,
        externalPostId: input.externalPostId,
      });

      const script = scriptFor(platform);

      if (script.kind === "accepted") {
        if (script.then === "published") {
          return { status: "published", externalPostId: input.externalPostId };
        }
        if (script.then === "failed") {
          return { status: "failed", errorCode: script.errorCode ?? "provider_error" };
        }
        return { status: "processing", externalPostId: input.externalPostId };
      }

      return { status: "published", externalPostId: input.externalPostId };
    },
  };
}

const providers: Record<Platform, SocialProvider> = {
  instagram: makeProvider("instagram"),
  facebook: makeProvider("facebook"),
  tiktok: makeProvider("tiktok"),
};

export function getProvider(platform: Platform): SocialProvider {
  return providers[platform];
}

export function allProviders(): SocialProvider[] {
  return [providers.instagram, providers.facebook, providers.tiktok];
}

export function isPlatformConfigured(): boolean {
  return true;
}

export type { MediaAsset, SocialAccountRecord };
export * from "@/providers/social/types";
