CREATE TYPE "public"."analytics_snapshot_status" AS ENUM('available', 'unavailable', 'failed');--> statement-breakpoint
CREATE TABLE "post_analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"post_platform_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_post_id" text,
	"status" "analytics_snapshot_status" NOT NULL,
	"views" bigint,
	"likes" bigint,
	"comments" bigint,
	"shares" bigint,
	"saves" bigint,
	"reach" bigint,
	"impressions" bigint,
	"raw_metrics" jsonb,
	"error_code" text,
	"error_message" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_analytics_snapshots" ADD CONSTRAINT "post_analytics_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics_snapshots" ADD CONSTRAINT "post_analytics_snapshots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics_snapshots" ADD CONSTRAINT "post_analytics_snapshots_post_platform_id_post_platforms_id_fk" FOREIGN KEY ("post_platform_id") REFERENCES "public"."post_platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_analytics_snapshots_user_collected_at_index" ON "post_analytics_snapshots" USING btree ("user_id","collected_at");--> statement-breakpoint
CREATE INDEX "post_analytics_snapshots_post_platform_collected_at_index" ON "post_analytics_snapshots" USING btree ("post_platform_id","collected_at");--> statement-breakpoint
CREATE INDEX "post_analytics_snapshots_user_platform_index" ON "post_analytics_snapshots" USING btree ("user_id","platform");