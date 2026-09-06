import type { Platform } from "@/lib/status";
import type { SocialProvider } from "./types";
import { metaFacebookProvider, metaInstagramProvider } from "./meta";
import { tiktokProvider } from "./tiktok";

const providers: Record<Platform, SocialProvider> = {
  instagram: metaInstagramProvider,
  facebook: metaFacebookProvider,
  tiktok: tiktokProvider,
};

export function getProvider(platform: Platform): SocialProvider {
  const provider = providers[platform];
  if (!provider) {
    throw new Error(`No social provider registered for "${platform}".`);
  }
  return provider;
}

export function allProviders(): SocialProvider[] {
  return [providers.instagram, providers.facebook, providers.tiktok];
}

export function isPlatformConfigured(platform: Platform): boolean {
  return getProvider(platform).isConfigured();
}

export * from "./types";
