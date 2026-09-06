import "server-only";

import { eq, sql } from "drizzle-orm";

import { db, postPlatforms, posts } from "@/lib/db";
import type { Post, PostPlatform } from "@/lib/db/schema";
import {
  decryptAccessToken,
  markAccountNeedsReconnect,
  saveRefreshedTokens,
} from "@/lib/domain/accounts";
import {
  MAX_ATTEMPTS,
  backoffDelayMs,
  claimPlatformForPublish,
  finishExecutionAccepted,
  finishExecutionFailed,
  finishExecutionPublished,
  latestExecutionLog,
  startExecution,
} from "@/lib/domain/executions";
import { recomputePostStatus } from "@/lib/domain/posts";
import {
  ProviderError,
  humanErrorMessage,
  isAuthFailure,
  toErrorCode,
  type ErrorCode,
} from "@/lib/errors";
import { logger, sanitize, type Logger } from "@/lib/logger";
import {
  SIGNED_URL_TTL_SECONDS,
  createSignedMediaUrl,
  downloadMediaObject,
} from "@/lib/storage";
import { getProvider } from "@/providers/social";
import type {
  MediaAsset,
  PublishInput,
  SocialAccountRecord,
  SocialProvider,
} from "@/providers/social/types";

/** Refresh when the token expires within this window. */
const TOKEN_REFRESH_SKEW_MS = 5 * 60_000;
const STATUS_POLL_ATTEMPTS = 6;
const STATUS_POLL_INTERVAL_MS = 5_000;
const MEDIA_FETCH_TIMEOUT_MS = 30_000;
const REDACTED_MARKER = "[redacted]";

export type PublishJobInput = {
  postPlatformId: string;
  attempt: number;
  workerId: string;
  bullmqJobId: string | null;
};

export type PublishOutcome =
  | { status: "skipped"; reason: string }
  | {
      status: "published";
      executionId: string;
      externalPostId: string | null;
      postStatus: string | null;
    }
  | {
      status: "failed";
      executionId: string;
      code: ErrorCode;
      message: string;
      postStatus: string | null;
    };

export type ResumeHandle = {
  externalPostId: string | null;
  statusRef: string | null;
  alreadyPublished: boolean;
};

type StatusProvider = SocialProvider &
  Required<Pick<SocialProvider, "getPublishStatus">>;

type AttemptState = {
  log: Logger;
  attempt: number;
  attemptNumber: number;
  postPlatform: PostPlatform;
  post: Post;
  media: MediaAsset;
  account: SocialAccountRecord;
  executionId: string;
  previousLog: unknown;
};

/**
 * Publishes one `post_platforms` row end to end.
 *
 * Throws a retryable `ProviderError` when the target has to be attempted again
 * (the row is already back to `pending` at that point); otherwise the result is
 * terminal and the job completes.
 */
export async function executePublishJob(
  input: PublishJobInput,
): Promise<PublishOutcome> {
  const attempt = normalizeAttempt(input.attempt);
  const entryLog = logger.child({
    postPlatformId: input.postPlatformId,
    attempt,
    bullmqJobId: input.bullmqJobId,
  });

  // The claim is the concurrency guard: only one worker can move the row from
  // `pending`/stale-`processing` to `processing`.
  const claim = await claimPlatformForPublish(
    input.postPlatformId,
    input.workerId,
  );

  if (!claim.claimed) {
    entryLog.info("job skipped", { reason: claim.reason });
    return { status: "skipped", reason: claim.reason };
  }

  const { postPlatform, post, media, account } = claim.context;
  const log = entryLog.child({
    postId: post.id,
    platform: postPlatform.platform,
    accountId: account.id,
  });

  log.info("job started", { attemptCount: postPlatform.attemptCount });

  if (post.status === "cancelled") {
    await markTargetCancelled(postPlatform.id, postPlatform.platform);
    log.info("job skipped", { reason: "post-cancelled" });
    return { status: "skipped", reason: "post-cancelled" };
  }

  try {
    // Read the previous attempt's log BEFORE inserting this attempt's row, so a
    // redelivered job sees the handle the earlier attempt left behind instead of
    // the empty log of the row we are about to create.
    const previousLog = await latestExecutionLog(postPlatform.id);
    const attemptNumber = await beginAttempt(postPlatform.id, attempt);
    const executionId = await startExecution({
      postPlatformId: postPlatform.id,
      platform: postPlatform.platform,
      attemptNumber,
      bullmqJobId: input.bullmqJobId,
    });

    const state: AttemptState = {
      log,
      attempt,
      attemptNumber,
      postPlatform,
      post,
      media,
      account,
      executionId,
      previousLog,
    };

    try {
      return await runAttempt(state);
    } catch (error) {
      return await handleAttemptError(state, error);
    }
  } catch (error) {
    // No execution row exists yet: hand the target back so the recovery sweep
    // can enqueue it again instead of leaving it locked forever.
    await db
      .update(postPlatforms)
      .set({
        status: "pending",
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(postPlatforms.id, postPlatform.id));
    log.error("job failed before execution started", {
      error: errorMessage(error),
    });
    throw error;
  }
}

async function runAttempt(state: AttemptState): Promise<PublishOutcome> {
  const { log, postPlatform, account } = state;
  const platform = postPlatform.platform;

  if (account.status === "disconnected") {
    throw new ProviderError({
      code: "account_disconnected",
      message: humanErrorMessage(platform, "account_disconnected"),
      retryable: false,
    });
  }

  if (account.status === "needs_reconnect") {
    throw new ProviderError({
      code: "account_needs_reconnect",
      message: humanErrorMessage(platform, "account_needs_reconnect"),
      retryable: false,
    });
  }

  const provider = getProvider(platform);
  const accessToken = await resolveAccessToken(state);

  // Final cancellation check: never call a social API for a cancelled post.
  if (await isPostCancelled(state.post.id)) {
    return await abortCancelled(state);
  }

  const resume = readResumeHandle(state.previousLog);
  const checker = statusChecker(provider);

  // Resume first. If an earlier attempt already talked to the provider, asking
  // for its status is what keeps a redelivered job from creating a second post.
  if (resume && checker) {
    if (resume.alreadyPublished) {
      log.info("resuming previous published attempt", {
        hasExternalId: Boolean(resume.externalPostId),
      });
      return await completePublished(
        state,
        resume.externalPostId,
        state.previousLog,
      );
    }

    const current = await checker.getPublishStatus({
      account: state.account,
      accessToken,
      externalPostId: resume.externalPostId,
      statusToken: resume.statusRef,
      responseLog: state.previousLog,
    });

    if (current.status === "published") {
      return await completePublished(
        state,
        current.externalPostId ?? resume.externalPostId,
        current.responseLog,
      );
    }

    if (current.status === "failed") {
      throw new ProviderError({
        code: current.errorCode,
        message: current.message ?? humanErrorMessage(platform, current.errorCode),
        responseLog: current.responseLog,
      });
    }

    return await awaitAsyncPublish(state, checker, accessToken, {
      externalPostId: current.externalPostId ?? resume.externalPostId,
      statusToken: resume.statusRef,
      responseLog: current.responseLog ?? state.previousLog,
    });
  }

  const result = await provider.publish(buildPublishInput(state, accessToken));

  if (result.status === "published") {
    return await completePublished(
      state,
      result.externalPostId,
      result.responseLog,
    );
  }

  if (!checker || !result.statusToken) {
    // The provider accepted the post but cannot report its status; assume the
    // platform owns it now rather than retrying and risking a duplicate.
    log.warn("provider cannot report async publish status", {
      hasExternalId: Boolean(result.externalPostId),
    });
    return await completePublished(
      state,
      result.externalPostId,
      result.responseLog,
    );
  }

  await finishExecutionAccepted(
    state.executionId,
    statusLog({
      provider: platform,
      externalPostId: result.externalPostId,
      statusRef: result.statusToken,
      response: result.responseLog,
    }),
  );

  return await awaitAsyncPublish(state, checker, accessToken, {
    externalPostId: result.externalPostId,
    statusToken: result.statusToken,
    responseLog: result.responseLog,
  });
}

/**
 * Bounded polling for providers that finish asynchronously. Still `processing`
 * at the end is not a failure: the handle is persisted and BullMQ redelivers,
 * and the next attempt resumes through `getPublishStatus`.
 */
async function awaitAsyncPublish(
  state: AttemptState,
  checker: StatusProvider,
  accessToken: string,
  handle: {
    externalPostId: string | null;
    statusToken: string | null;
    responseLog: unknown;
  },
): Promise<PublishOutcome> {
  const { postPlatform } = state;
  const platform = postPlatform.platform;
  let responseLog = handle.responseLog;

  state.log.info("awaiting async publish", {
    polls: STATUS_POLL_ATTEMPTS,
    intervalMs: STATUS_POLL_INTERVAL_MS,
  });

  for (let index = 0; index < STATUS_POLL_ATTEMPTS; index += 1) {
    await delay(STATUS_POLL_INTERVAL_MS);

    const current = await checker.getPublishStatus({
      account: state.account,
      accessToken,
      externalPostId: handle.externalPostId,
      statusToken: handle.statusToken,
      responseLog,
    });

    responseLog = current.responseLog ?? responseLog;

    if (current.status === "published") {
      return await completePublished(
        state,
        current.externalPostId ?? handle.externalPostId,
        current.responseLog,
      );
    }

    if (current.status === "failed") {
      throw new ProviderError({
        code: current.errorCode,
        message: current.message ?? humanErrorMessage(platform, current.errorCode),
        responseLog: current.responseLog,
      });
    }
  }

  // Still processing: persist the handle so the next attempt resumes through
  // `getPublishStatus` instead of publishing a second time.
  state.log.warn("provider still processing", {
    polls: STATUS_POLL_ATTEMPTS,
  });

  await finishExecutionAccepted(
    state.executionId,
    statusLog({
      provider: platform,
      externalPostId: handle.externalPostId,
      statusRef: handle.statusToken,
      response: responseLog,
    }),
  );

  return scheduleRetry(state, {
    code: "timeout",
    message: humanErrorMessage(platform, "timeout"),
    responseLog,
  });
}

async function resolveAccessToken(state: AttemptState): Promise<string> {
  const { log, account } = state;
  const provider = getProvider(account.platform);
  const expiresAt = account.tokenExpiresAt?.getTime() ?? null;
  const hasRefreshToken = Boolean(account.encryptedRefreshToken);
  const expiringSoon =
    expiresAt !== null && expiresAt - Date.now() < TOKEN_REFRESH_SKEW_MS;
  const needsRefresh = (expiresAt === null && hasRefreshToken) || expiringSoon;

  if (!needsRefresh) return decryptAccessToken(account);

  log.info("token refresh", { platform: account.platform });

  try {
    const refreshed = await provider.refreshToken(account);
    await saveRefreshedTokens(account.id, refreshed);
    log.info("token refreshed", {
      expiresAt: refreshed.tokenExpiresAt?.toISOString() ?? null,
    });
    return refreshed.accessToken;
  } catch (error) {
    log.error("token refresh failed", { error: errorMessage(error) });
    await markAccountNeedsReconnect(
      account.id,
      "token_expired",
      humanErrorMessage(account.platform, "token_expired"),
    );
    throw new ProviderError({
      code: "token_expired",
      message: humanErrorMessage(account.platform, "token_expired"),
      retryable: false,
      responseLog: sanitize(errorMessage(error)),
    });
  }
}

async function handleAttemptError(
  state: AttemptState,
  error: unknown,
): Promise<PublishOutcome> {
  const platform = state.postPlatform.platform;
  const providerError = toProviderError(platform, error);
  const code = providerError.code;
  const message =
    providerError.message || humanErrorMessage(platform, code);

  state.log.error("job failed", {
    code,
    retryable: providerError.retryable,
    status: providerError.status,
    error: providerError.message,
  });

  await finishExecutionFailed(state.executionId, {
    code,
    message,
    responseLog: providerError.responseLog,
  });

  // An authentication failure is never retried: the user has to reconnect.
  if (isAuthFailure(code)) {
    await markAccountNeedsReconnect(state.account.id, code, message);
    return await failTarget(state, code, message);
  }

  if (providerError.retryable && state.attemptNumber < attemptBudget(state)) {
    await scheduleRetry(state, { code, message, responseLog: providerError.responseLog });
  }

  return await failTarget(state, code, message);
}

async function completePublished(
  state: AttemptState,
  externalPostId: string | null,
  responseLog: unknown,
): Promise<PublishOutcome> {
  const { log, postPlatform } = state;

  await finishExecutionPublished(
    state.executionId,
    externalPostId,
    statusLog({
      provider: postPlatform.platform,
      externalPostId,
      statusRef: null,
      published: true,
      response: responseLog,
    }),
  );

  await db
    .update(postPlatforms)
    .set({
      status: "success",
      externalPostId,
      publishedAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(postPlatforms.id, postPlatform.id));

  const postStatus = await safeRecompute(state);
  log.info("job completed", { externalPostId, postStatus });

  return {
    status: "published",
    executionId: state.executionId,
    externalPostId,
    postStatus,
  };
}

async function failTarget(
  state: AttemptState,
  code: string,
  message: string,
): Promise<PublishOutcome> {
  await db
    .update(postPlatforms)
    .set({
      status: "failed",
      lastErrorCode: code,
      lastErrorMessage: message,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(postPlatforms.id, state.postPlatform.id));

  const postStatus = await safeRecompute(state);
  state.log.error("job failed", { code, postStatus });

  return {
    status: "failed",
    executionId: state.executionId,
    code: toErrorCode(code),
    message,
    postStatus,
  };
}

async function abortCancelled(state: AttemptState): Promise<PublishOutcome> {
  const platform = state.postPlatform.platform;
  const message = humanErrorMessage(platform, "cancelled");

  await finishExecutionFailed(state.executionId, {
    code: "cancelled",
    message,
  });
  await markTargetCancelled(state.postPlatform.id, platform);

  state.log.info("job skipped", { reason: "post-cancelled" });
  return { status: "skipped", reason: "post-cancelled" };
}

/** Releases the lock, keeps the target retryable, then rethrows for BullMQ. */
async function scheduleRetry(
  state: AttemptState,
  error: { code: string; message: string; responseLog?: unknown },
): Promise<never> {
  const nextRetryAt = new Date(
    Date.now() + backoffDelayMs(state.attemptNumber),
  );

  await db
    .update(postPlatforms)
    .set({
      status: "pending",
      lockedAt: null,
      lockedBy: null,
      nextRetryAt,
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      updatedAt: new Date(),
    })
    .where(eq(postPlatforms.id, state.postPlatform.id));

  state.log.warn("retry scheduled", {
    code: error.code,
    attempt: state.attemptNumber,
    nextRetryAt: nextRetryAt.toISOString(),
  });

  throw new ProviderError({
    code: toErrorCode(error.code),
    message: error.message,
    retryable: true,
    responseLog: error.responseLog,
  });
}

async function beginAttempt(
  postPlatformId: string,
  attempt: number,
): Promise<number> {
  const [row] = await db
    .update(postPlatforms)
    .set({
      attemptCount: sql`${postPlatforms.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(postPlatforms.id, postPlatformId))
    .returning({ attemptCount: postPlatforms.attemptCount });

  // BullMQ redelivers the same payload, so the payload attempt alone cannot
  // count attempts; the stored counter can.
  return Math.max(attempt, row?.attemptCount ?? attempt);
}

async function markTargetCancelled(
  postPlatformId: string,
  platform: string,
): Promise<void> {
  await db
    .update(postPlatforms)
    .set({
      status: "failed",
      lastErrorCode: "cancelled",
      lastErrorMessage: humanErrorMessage(platform, "cancelled"),
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(postPlatforms.id, postPlatformId));
}

async function safeRecompute(state: AttemptState): Promise<string | null> {
  const [row] = await db
    .select({ status: posts.status })
    .from(posts)
    .where(eq(posts.id, state.post.id))
    .limit(1);

  // A post cancelled while we were publishing must stay `cancelled`.
  if (!row || row.status === "cancelled") return row?.status ?? null;

  return recomputePostStatus(state.post.id, {
    scheduled: state.post.scheduledAt !== null && row.status === "scheduled",
  });
}

async function isPostCancelled(postId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: posts.status })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  return row?.status === "cancelled";
}

function buildPublishInput(
  state: AttemptState,
  accessToken: string,
): PublishInput {
  const { postPlatform, post, media, account } = state;
  const platform = postPlatform.platform;

  return {
    postPlatformId: postPlatform.id,
    account,
    accessToken,
    caption: post.contentText,
    media,
    resolveMediaUrl: async (asset: MediaAsset) => {
      if (asset.storageKey) {
        return createSignedMediaUrl(asset.storageKey, SIGNED_URL_TTL_SECONDS);
      }
      if (asset.sourceUrl) return asset.sourceUrl;
      throw new ProviderError({
        code: "invalid_media_url",
        message: humanErrorMessage(platform, "invalid_media_url"),
        retryable: false,
      });
    },
    readMedia: async (asset: MediaAsset) => {
      if (asset.storageKey) {
        const stored = await downloadMediaObject(asset.storageKey);
        return {
          bytes: stored.bytes,
          mimeType: stored.mimeType ?? asset.mimeType,
          size: stored.size,
        };
      }

      if (asset.sourceUrl) return await fetchMedia(asset, platform);

      throw new ProviderError({
        code: "invalid_media_url",
        message: humanErrorMessage(platform, "invalid_media_url"),
        retryable: false,
      });
    },
  };
}

async function fetchMedia(
  asset: MediaAsset,
  platform: string,
): Promise<{ bytes: Uint8Array; mimeType: string; size: number }> {
  const response = await fetch(asset.sourceUrl as string, {
    signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new ProviderError({
      code: "url_unreachable",
      message: humanErrorMessage(platform, "url_unreachable"),
      retryable: false,
      status: response.status,
    });
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    mimeType: response.headers.get("content-type") ?? asset.mimeType,
    size: bytes.byteLength,
  };
}

function statusChecker(provider: SocialProvider): StatusProvider | null {
  return typeof provider.getPublishStatus === "function"
    ? (provider as StatusProvider)
    : null;
}

/**
 * The handle the next attempt needs in order to resume. `sanitize()` redacts
 * every key matching /token/i, so the value is also stored under `statusRef`.
 */
function statusLog(input: {
  provider: string;
  externalPostId: string | null;
  statusRef: string | null;
  published?: boolean;
  response?: unknown;
}) {
  return {
    provider: input.provider,
    externalPostId: input.externalPostId,
    statusToken: input.statusRef,
    statusRef: input.statusRef,
    published: input.published ?? false,
    response: sanitize(input.response) ?? null,
  };
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  if (value.length === 0 || value === REDACTED_MARKER) return null;
  return value;
}

export function readResumeHandle(log: unknown): ResumeHandle | null {
  if (!log || typeof log !== "object" || Array.isArray(log)) return null;

  const record = log as Record<string, unknown>;
  const externalPostId = readString(record, "externalPostId");
  const statusRef =
    readString(record, "statusRef") ?? readString(record, "statusToken");

  if (record.published === true && externalPostId) {
    return { externalPostId, statusRef, alreadyPublished: true };
  }
  if (statusRef) return { externalPostId, statusRef, alreadyPublished: false };

  return null;
}

function attemptBudget(state: AttemptState): number {
  return state.postPlatform.maxAttempts > 0
    ? state.postPlatform.maxAttempts
    : MAX_ATTEMPTS;
}

function toProviderError(platform: string, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;

  if (error instanceof Error) {
    return new ProviderError({
      code: "provider_error",
      message: error.message,
      responseLog: { name: error.name, message: error.message },
    });
  }

  return new ProviderError({
    code: "unknown",
    message: humanErrorMessage(platform, "unknown"),
    retryable: false,
    responseLog: sanitize(error) ?? null,
  });
}

function normalizeAttempt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
