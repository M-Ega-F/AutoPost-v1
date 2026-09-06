CREATE TYPE "public"."execution_status" AS ENUM('accepted', 'processing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('instagram', 'facebook', 'tiktok');--> statement-breakpoint
CREATE TYPE "public"."post_platform_status" AS ENUM('pending', 'processing', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'processing', 'published', 'partial_failure', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."social_account_status" AS ENUM('active', 'needs_reconnect', 'disconnected');--> statement-breakpoint
CREATE TABLE "post_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_platform_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"status" "execution_status" NOT NULL,
	"attempt_number" integer NOT NULL,
	"bullmq_job_id" text,
	"external_post_id" text,
	"error_code" text,
	"error_message" text,
	"response_log" jsonb,
	"started_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_executions_platform_attempt_unique" UNIQUE("post_platform_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"storage_key" text,
	"source_url" text,
	"media_type" "media_type" NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint,
	"width" integer,
	"height" integer,
	"duration" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_media_source_present_check" CHECK ("storage_key" IS NOT NULL OR "source_url" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "post_platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"status" "post_platform_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"bullmq_job_id" text,
	"external_post_id" text,
	"published_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_platforms_post_account_unique" UNIQUE("post_id","social_account_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_text" text NOT NULL,
	"timezone" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_account_id" text NOT NULL,
	"username" text,
	"display_name" text,
	"avatar_url" text,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text,
	"status" "social_account_status" DEFAULT 'active' NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_user_platform_account_unique" UNIQUE("user_id","platform","platform_account_id")
);
--> statement-breakpoint
ALTER TABLE "post_executions" ADD CONSTRAINT "post_executions_post_platform_id_post_platforms_id_fk" FOREIGN KEY ("post_platform_id") REFERENCES "public"."post_platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_platforms" ADD CONSTRAINT "post_platforms_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_platforms" ADD CONSTRAINT "post_platforms_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_executions_post_platform_id_index" ON "post_executions" USING btree ("post_platform_id");--> statement-breakpoint
CREATE INDEX "post_executions_status_index" ON "post_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "post_executions_created_at_index" ON "post_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_media_post_id_index" ON "post_media" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_platforms_post_id_index" ON "post_platforms" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_platforms_status_index" ON "post_platforms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "post_platforms_status_next_retry_at_index" ON "post_platforms" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "posts_user_id_index" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_status_index" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "posts_scheduled_at_index" ON "posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "posts_status_scheduled_at_index" ON "posts" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "posts_user_id_created_at_index" ON "posts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "social_accounts_user_id_index" ON "social_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_accounts_user_id_platform_index" ON "social_accounts" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "social_accounts_status_index" ON "social_accounts" USING btree ("status");