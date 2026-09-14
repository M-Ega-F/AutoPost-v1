import type { ErrorCode } from "@/lib/errors";
import type {
  Platform,
  SocialAccountStatus,
} from "@/lib/status";

/**
 * A `social_accounts` row. Token columns are always ciphertext — decrypt them
 * with `decryptSecret` from `@/lib/crypto/tokens` at the point of use, never
 * pass them to the client, a job payload, or a log.
 */
export type SocialAccountRecord = {
  id: string;
  userId: string;
  platform: Platform;
  platformAccountId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string | null;
  status: SocialAccountStatus;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  metadata: unknown;
};

/** One account as returned by an OAuth callback, before it is persisted. */
export type ConnectedAccountDraft = {
  platform: Platform;
  platformAccountId: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  scopes?: string | null;
  metadata?: Record<string, unknown>;
};

export type RefreshResult = {
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
};

export type MediaAsset = {
  mediaType: "image" | "video";
  mimeType: string;
  /** Supabase Storage object key, when the media was uploaded. */
  storageKey: string | null;
  /** Original HTTPS URL, when the media was pasted in. */
  sourceUrl: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string };

export type PublishInput = {
  postPlatformId: string;
  account: SocialAccountRecord;
  /** Decrypted, short lived, never logged. */
  accessToken: string;
  caption: string;
  media: MediaAsset;
  /** Resolves a persistently stored object to a short-lived HTTPS URL. */
  resolveMediaUrl: (media: MediaAsset) => Promise<string>;
  /** Reads the stored object as bytes, for providers that upload the file. */
  readMedia: (
    media: MediaAsset,
  ) => Promise<{ bytes: Uint8Array; mimeType: string; size: number }>;
};

export type PublishResult =
  | {
      status: "published";
      externalPostId: string | null;
      responseLog?: unknown;
    }
  | {
      status: "accepted";
      externalPostId: string | null;
      /** Opaque handle used by `getPublishStatus` on the follow-up check. */
      statusToken: string | null;
      responseLog?: unknown;
    };

export type PublishStatusInput = {
  account: SocialAccountRecord;
  accessToken: string;
  externalPostId: string | null;
  statusToken: string | null;
  responseLog: unknown;
};

export type PublishStatusResult =
  | { status: "processing"; externalPostId?: string | null; responseLog?: unknown }
  | { status: "published"; externalPostId: string | null; responseLog?: unknown }
  | {
      status: "failed";
      errorCode: ErrorCode;
      message?: string;
      responseLog?: unknown;
  };

export type AnalyticsInput = {
  account: SocialAccountRecord;
  accessToken: string;
  externalPostId: string;
};

export type AnalyticsResult = {
  metrics: Partial<Record<
    "views" | "likes" | "comments" | "shares" | "saves" | "reach" | "impressions",
    number | null
  >>;
  rawMetrics?: unknown;
  collectedAt?: Date;
};

export type OAuthStartInput = {
  userId: string;
  workspaceId?: string;
  state: string;
  redirectUri: string;
  setCookie?: (cookie: { name: string; value: string; maxAge: number }) => void;
};

export type OAuthCallbackInput = {
  userId: string;
  workspaceId?: string;
  code: string;
  state: string;
  redirectUri: string;
  codeVerifier?: string;
};

/**
 * Every platform implements this and nothing else. The core publishing system
 * knows only: connect, validate, publish, check status.
 */
export interface SocialProvider {
  readonly platform: Platform;

  /** False when the platform's app credentials are absent. */
  isConfigured(): boolean;

  getAuthorizationUrl(input: OAuthStartInput): Promise<string>;

  /** Exchanges the code and returns every account the grant covers. */
  handleCallback(input: OAuthCallbackInput): Promise<ConnectedAccountDraft[]>;

  refreshToken(account: SocialAccountRecord): Promise<RefreshResult>;

  /** Confirms the account can still be published to. */
  validateAccount(account: SocialAccountRecord): Promise<SocialAccountStatus>;

  /** Runs the platform's content rules before the post is ever scheduled. */
  validateContent(input: {
    account: SocialAccountRecord;
    media: MediaAsset;
    caption: string;
  }): Promise<ValidationResult>;

  publish(input: PublishInput): Promise<PublishResult>;

  /** Optional: for platforms that finish publishing asynchronously. */
  getPublishStatus?(
    input: PublishStatusInput,
  ): Promise<PublishStatusResult>;

  /** Optional: only providers with approved analytics scopes implement this. */
  getPostAnalytics?(input: AnalyticsInput): Promise<AnalyticsResult>;
}

export const VALIDATION_OK: ValidationResult = { ok: true };

export function validationError(
  code: ErrorCode,
  message: string,
): ValidationResult {
  return { ok: false, code, message };
}
