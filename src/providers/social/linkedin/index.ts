import "server-only";

import { decryptSecret } from "@/lib/crypto/tokens";
import { serverConfig } from "@/lib/env";
import {
  humanErrorMessage,
  isAuthFailure,
  ProviderError,
} from "@/lib/errors";
import type { SocialAccountStatus } from "@/lib/status";
import {
  formBody,
  jsonBody,
  requestJson,
  responseLog as buildResponseLog,
  signOAuthState,
  uploadBytes,
  uploadBytesWithHeaders,
  validateMediaLimits,
  verifyOAuthState,
} from "../http";
import type {
  ConnectedAccountDraft,
  PublishInput,
  PublishResult,
  RefreshResult,
  SocialAccountRecord,
  SocialProvider,
  ValidationResult,
} from "../types";

const PLATFORM = "linkedin" as const;
const API_BASE = "https://api.linkedin.com";
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const SCOPES = "openid profile w_member_social";

function requireCredentials(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = serverConfig.linkedin;
  if (!clientId || !clientSecret) {
    throw new ProviderError({
      code: "provider_error",
      message: "LinkedIn is not configured.",
      retryable: false,
    });
  }
  return { clientId, clientSecret };
}

function headers(token: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": serverConfig.linkedin.version,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function accountToken(account: SocialAccountRecord): string {
  if (!account.encryptedAccessToken) {
    throw new ProviderError({
      code: "account_needs_reconnect",
      message: humanErrorMessage(PLATFORM, "account_needs_reconnect"),
      retryable: false,
    });
  }
  return decryptSecret(account.encryptedAccessToken);
}

function metadataOf(account: SocialAccountRecord): Record<string, unknown> {
  return typeof account.metadata === "object" && account.metadata !== null
    ? (account.metadata as Record<string, unknown>)
    : {};
}

type LinkedInToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

type LinkedInProfile = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

function tokenExpiry(value: unknown): Date | null {
  return typeof value === "number" && value > 0
    ? new Date(Date.now() + value * 1000)
    : null;
}

async function readProfile(token: string): Promise<LinkedInProfile> {
  const { data } = await requestJson<LinkedInProfile>(
    `${API_BASE}/v2/userinfo`,
    { method: "GET", headers: headers(token) },
    { platform: PLATFORM, endpoint: "GET /v2/userinfo" },
  );
  return data;
}

function ownerUrnOf(account: SocialAccountRecord): string {
  const accountMetadata = metadataOf(account);
  return typeof accountMetadata.authorUrn === "string"
    ? accountMetadata.authorUrn
    : `urn:li:person:${account.platformAccountId}`;
}

async function uploadImage(
  input: PublishInput,
  owner: string,
  bytes: Uint8Array,
  size: number,
  mimeType: string,
): Promise<string> {
  const initialized = await requestJson<{
    value?: {
      uploadUrl?: string;
      image?: string;
    };
  }>(
    `${API_BASE}/rest/images?action=initializeUpload`,
    {
      method: "POST",
      headers: headers(input.accessToken, true),
      body: jsonBody({
        initializeUploadRequest: { owner },
      }),
    },
    { platform: PLATFORM, endpoint: "POST /rest/images?action=initializeUpload" },
  );

  const image = initialized.data.value?.image;
  const uploadUrl = initialized.data.value?.uploadUrl;
  if (!image || !uploadUrl) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog: initialized.responseLog,
    });
  }

  await uploadBytes(uploadUrl, bytes, {
    platform: PLATFORM,
    endpoint: "PUT {linkedin-image-upload-url}",
    contentType: mimeType,
    contentRange: `bytes 0-${Math.max(0, size - 1)}/${size}`,
  });

  return image;
}

async function uploadVideo(
  input: PublishInput,
  owner: string,
  bytes: Uint8Array,
  size: number,
): Promise<string> {
  const initialized = await requestJson<{
    value?: {
      video?: string;
      uploadToken?: string;
      uploadInstructions?: Array<{
        uploadUrl?: string;
        firstByte?: number;
        lastByte?: number;
      }>;
    };
  }>(
    `${API_BASE}/rest/videos?action=initializeUpload`,
    {
      method: "POST",
      headers: headers(input.accessToken, true),
      body: jsonBody({
        initializeUploadRequest: {
          owner,
          fileSizeBytes: size,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    },
    { platform: PLATFORM, endpoint: "POST /rest/videos?action=initializeUpload" },
  );

  const video = initialized.data.value?.video;
  const uploadToken = initialized.data.value?.uploadToken ?? "";
  const uploadInstructions = initialized.data.value?.uploadInstructions ?? [];
  if (!video || uploadInstructions.length === 0) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog: initialized.responseLog,
    });
  }

  const uploadedPartIds: string[] = [];
  let nextByte = 0;
  for (const instruction of uploadInstructions) {
    const uploadUrl = instruction.uploadUrl;
    const firstByte = instruction.firstByte ?? nextByte;
    const lastByte = Math.min(
      instruction.lastByte ?? size - 1,
      size - 1,
    );
    if (!uploadUrl || firstByte !== nextByte || firstByte < 0 || lastByte < firstByte) {
      throw new ProviderError({
        code: "publish_failed",
        message: humanErrorMessage(PLATFORM, "publish_failed"),
        retryable: false,
        responseLog: initialized.responseLog,
      });
    }

    const responseHeaders = await uploadBytesWithHeaders(
      uploadUrl,
      bytes.subarray(firstByte, lastByte + 1),
      {
        platform: PLATFORM,
        endpoint: "PUT {linkedin-video-upload-url}",
        contentType: "application/octet-stream",
        contentRange: `bytes ${firstByte}-${lastByte}/${size}`,
      },
    );
    const etag = responseHeaders.get("etag");
    if (!etag) {
      throw new ProviderError({
        code: "publish_failed",
        message: humanErrorMessage(PLATFORM, "publish_failed"),
        retryable: false,
        responseLog: initialized.responseLog,
      });
    }
    uploadedPartIds.push(etag);
    nextByte = lastByte + 1;
  }

  if (nextByte !== size) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog: initialized.responseLog,
    });
  }

  await requestJson(
    `${API_BASE}/rest/videos?action=finalizeUpload`,
    {
      method: "POST",
      headers: headers(input.accessToken, true),
      body: jsonBody({
        finalizeUploadRequest: {
          video,
          uploadToken,
          uploadedPartIds,
        },
      }),
    },
    { platform: PLATFORM, endpoint: "POST /rest/videos?action=finalizeUpload" },
  );

  return video;
}

async function uploadMedia(input: PublishInput): Promise<string> {
  const { bytes, size, mimeType } = await input.readMedia(input.media);
  const owner = ownerUrnOf(input.account);

  if (input.media.mediaType === "image") {
    return uploadImage(input, owner, bytes, size, mimeType);
  }

  return uploadVideo(input, owner, bytes, size);
}

async function publishPost(input: PublishInput): Promise<PublishResult> {
  const accountMetadata = metadataOf(input.account);
  const author =
    typeof accountMetadata.authorUrn === "string"
      ? accountMetadata.authorUrn
      : `urn:li:person:${input.account.platformAccountId}`;
  const mediaId = await uploadMedia(input);

  const result = await requestJson<unknown>(
    `${API_BASE}/rest/posts`,
    {
      method: "POST",
      headers: headers(input.accessToken, true),
      body: jsonBody({
        author,
        commentary: input.caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: { media: { title: input.caption.slice(0, 200), id: mediaId } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    },
    { platform: PLATFORM, endpoint: "POST /rest/posts" },
  );

  return {
    status: "published",
    externalPostId: result.headers.get("x-restli-id"),
    responseLog: buildResponseLog(PLATFORM, "linkedin-post", 201, {
      postId: result.headers.get("x-restli-id"),
      mediaId,
    }),
  };
}

export const linkedinProvider: SocialProvider = {
  platform: PLATFORM,

  isConfigured(): boolean {
    const { clientId, clientSecret } = serverConfig.linkedin;
    return Boolean(clientId && clientSecret);
  },

  async getAuthorizationUrl(input): Promise<string> {
    const { clientId } = serverConfig.linkedin;
    return `${AUTHORIZE_URL}?${new URLSearchParams({
      response_type: "code",
      client_id: clientId ?? "",
      redirect_uri: input.redirectUri,
      state: signOAuthState({ userId: input.userId, workspaceId: input.workspaceId, platform: PLATFORM, state: input.state }),
      scope: SCOPES,
    }).toString()}`;
  },

  async handleCallback(input): Promise<ConnectedAccountDraft[]> {
    const state = verifyOAuthState(input.state);
    if (!state || state.platform !== PLATFORM || state.userId !== input.userId) {
      throw new ProviderError({
        code: "permission_denied",
        message: humanErrorMessage(PLATFORM, "permission_denied"),
        retryable: false,
      });
    }

    const { clientId, clientSecret } = requireCredentials();
    const token = await requestJson<LinkedInToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          grant_type: "authorization_code",
          code: input.code,
          redirect_uri: input.redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      { platform: PLATFORM, endpoint: "POST /oauth/v2/accessToken" },
    );

    if (!token.data.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: token.responseLog,
      });
    }

    const profile = await readProfile(token.data.access_token);
    if (!profile.sub) {
      throw new ProviderError({
        code: "provider_error",
        message: humanErrorMessage(PLATFORM, "provider_error"),
        retryable: false,
      });
    }

    return [
      {
        platform: PLATFORM,
        platformAccountId: profile.sub,
        username: profile.name ?? profile.sub,
        displayName: profile.name ?? profile.sub,
        avatarUrl: profile.picture ?? null,
        accessToken: token.data.access_token,
        refreshToken: token.data.refresh_token ?? null,
        tokenExpiresAt: tokenExpiry(token.data.expires_in),
        scopes: token.data.scope ?? SCOPES,
        metadata: { authorUrn: `urn:li:person:${profile.sub}` },
      },
    ];
  },

  async refreshToken(account): Promise<RefreshResult> {
    const { clientId, clientSecret } = requireCredentials();
    if (!account.encryptedRefreshToken) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
      });
    }

    const token = await requestJson<LinkedInToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          grant_type: "refresh_token",
          refresh_token: decryptSecret(account.encryptedRefreshToken),
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      { platform: PLATFORM, endpoint: "POST /oauth/v2/accessToken (refresh)" },
    );

    if (!token.data.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: token.responseLog,
      });
    }

    return {
      accessToken: token.data.access_token,
      refreshToken: token.data.refresh_token ?? decryptSecret(account.encryptedRefreshToken),
      tokenExpiresAt: tokenExpiry(token.data.expires_in),
    };
  },

  async validateAccount(account): Promise<SocialAccountStatus> {
    try {
      await readProfile(accountToken(account));
      return "active";
    } catch (error) {
      return error instanceof ProviderError && isAuthFailure(error.code)
        ? "needs_reconnect"
        : "active";
    }
  },

  async validateContent(input): Promise<ValidationResult> {
    return validateMediaLimits(PLATFORM, input.media, input.caption);
  },

  async publish(input): Promise<PublishResult> {
    return publishPost(input);
  },
};
