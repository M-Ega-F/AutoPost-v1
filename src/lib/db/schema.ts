import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-schema";

export const platformEnum = pgEnum("platform", [
  "instagram",
  "facebook",
  "tiktok",
  "threads",
  "linkedin",
  "x",
]);

export const socialAccountStatusEnum = pgEnum("social_account_status", [
  "active",
  "needs_reconnect",
  "disconnected",
]);

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "processing",
  "published",
  "partial_failure",
  "failed",
  "cancelled",
]);

export const postPlatformStatusEnum = pgEnum("post_platform_status", [
  "pending",
  "processing",
  "success",
  "failed",
]);

export const executionStatusEnum = pgEnum("execution_status", [
  "accepted",
  "processing",
  "published",
  "failed",
]);

export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    platformAccountId: text("platform_account_id").notNull(),
    username: text("username"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    scopes: text("scopes"),
    status: socialAccountStatusEnum("status").notNull().default("active"),
    lastValidatedAt: timestamp("last_validated_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("social_accounts_user_platform_account_unique").on(
      t.userId,
      t.platform,
      t.platformAccountId,
    ),
    index("social_accounts_user_id_index").on(t.userId),
    index("social_accounts_user_id_platform_index").on(t.userId, t.platform),
    index("social_accounts_status_index").on(t.status),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    contentText: text("content_text").notNull(),
    timezone: text("timezone").notNull(),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    status: postStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("posts_user_id_index").on(t.userId),
    index("posts_status_index").on(t.status),
    index("posts_scheduled_at_index").on(t.scheduledAt),
    index("posts_status_scheduled_at_index").on(t.status, t.scheduledAt),
    index("posts_user_id_created_at_index").on(t.userId, t.createdAt),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    storageKey: text("storage_key"),
    sourceUrl: text("source_url"),
    mediaType: mediaTypeEnum("media_type").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("post_media_post_id_index").on(t.postId),
    check(
      "post_media_source_present_check",
      sql`"storage_key" IS NOT NULL OR "source_url" IS NOT NULL`,
    ),
  ],
);

export const postPlatforms = pgTable(
  "post_platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "restrict" }),
    platform: platformEnum("platform").notNull(),
    status: postPlatformStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    nextRetryAt: timestamp("next_retry_at", {
      withTimezone: true,
      mode: "date",
    }),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockedBy: text("locked_by"),
    bullmqJobId: text("bullmq_job_id"),
    externalPostId: text("external_post_id"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("post_platforms_post_account_unique").on(t.postId, t.socialAccountId),
    index("post_platforms_post_id_index").on(t.postId),
    index("post_platforms_status_index").on(t.status),
    index("post_platforms_status_next_retry_at_index").on(
      t.status,
      t.nextRetryAt,
    ),
  ],
);

export const postExecutions = pgTable(
  "post_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postPlatformId: uuid("post_platform_id")
      .notNull()
      .references(() => postPlatforms.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    status: executionStatusEnum("status").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    bullmqJobId: text("bullmq_job_id"),
    externalPostId: text("external_post_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    responseLog: jsonb("response_log"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    executedAt: timestamp("executed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("post_executions_platform_attempt_unique").on(
      t.postPlatformId,
      t.attemptNumber,
    ),
    index("post_executions_post_platform_id_index").on(t.postPlatformId),
    index("post_executions_status_index").on(t.status),
    index("post_executions_created_at_index").on(t.createdAt),
  ],
);

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export type PostMedia = typeof postMedia.$inferSelect;
export type NewPostMedia = typeof postMedia.$inferInsert;

export type PostPlatform = typeof postPlatforms.$inferSelect;
export type NewPostPlatform = typeof postPlatforms.$inferInsert;

export type PostExecution = typeof postExecutions.$inferSelect;
export type NewPostExecution = typeof postExecutions.$inferInsert;
