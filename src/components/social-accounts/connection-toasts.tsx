"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { PLATFORMS, PLATFORM_META, type Platform } from "@/lib/status";

type OAuthErrorCode = "denied" | "no_pages" | "channel_not_found" | "quota" | "not_configured" | "token" | "unknown";

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

function isErrorCode(value: string): value is OAuthErrorCode {
  return (
    value === "denied" ||
    value === "no_pages" ||
    value === "channel_not_found" ||
    value === "quota" ||
    value === "not_configured" ||
    value === "token" ||
    value === "unknown"
  );
}

/** "TikTok", or "the account" when the platform is missing. */
function subjectOf(value: string | null): string {
  return value && isPlatform(value) ? PLATFORM_META[value].label : "the account";
}

function messageFor(code: OAuthErrorCode, subject: string): string {
  if (code === "not_configured") {
    const start = subject.charAt(0).toUpperCase() + subject.slice(1);
    return `${start} isn't set up on this server yet.`;
  }
  if (code === "no_pages") {
    return "No publishable Facebook Page was returned. Check the Page access and publishing permissions, then try again.";
  }
  if (code === "channel_not_found") {
    return "Google connected successfully, but no YouTube channel was found for this account.";
  }
  if (code === "quota") {
    return "YouTube quota has been exceeded. Check the Google Cloud quota before trying again.";
  }
  if (code === "denied" && subject === "YouTube") {
    return "Google did not grant the required YouTube permissions. Reconnect and allow upload plus channel access.";
  }
  return `We couldn't connect ${subject}. Try again.`;
}

/**
 * Reads the `?connected=` / `?error=` flags the OAuth routes redirect back with,
 * fires one toast per outcome, then strips the flags from the URL.
 */
export function ConnectionToasts() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const handled = useRef<string | null>(null);
  const search = searchParams.toString();

  useEffect(() => {
    if (handled.current === search) return;
    handled.current = search;

    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const platform = searchParams.get("platform");

    if (connected) {
      for (const value of connected.split(",")) {
        const platformValue = value.trim();
        if (!isPlatform(platformValue)) continue;
        toast.success(`${PLATFORM_META[platformValue].label} connected.`);
      }
    }

    if (error) {
      toast.error(
        messageFor(isErrorCode(error) ? error : "unknown", subjectOf(platform)),
      );
    }

    if (connected || error) {
      router.replace(pathname, { scroll: false });
    }
  }, [search, searchParams, pathname, router]);

  return null;
}
