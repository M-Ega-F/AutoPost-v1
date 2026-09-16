CREATE TYPE "public"."campaign_activity_type" AS ENUM('created', 'updated', 'goal_updated', 'activated', 'completed', 'archived', 'restored', 'post_added', 'post_removed', 'post_approved', 'post_published', 'post_failed');--> statement-breakpoint
CREATE TYPE "public"."campaign_target_metric" AS ENUM('views', 'likes', 'comments', 'shares', 'saves', 'reach', 'impressions');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_GOAL_UPDATED' BEFORE 'CAMPAIGN_ACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.goal_updated' BEFORE 'campaign.activated';--> statement-breakpoint
CREATE TABLE "campaign_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"post_id" uuid,
	"actor_id" uuid,
	"type" "campaign_activity_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "custom_objective" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "target_metric" "campaign_target_metric";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "target_value" bigint;--> statement-breakpoint
ALTER TABLE "campaign_activity" ADD CONSTRAINT "campaign_activity_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_activity" ADD CONSTRAINT "campaign_activity_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_activity" ADD CONSTRAINT "campaign_activity_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_activity" ADD CONSTRAINT "campaign_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_activity_campaign_occurred_at_index" ON "campaign_activity" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "campaign_activity_workspace_occurred_at_index" ON "campaign_activity" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_activity_campaign_dedupe_unique" ON "campaign_activity" USING btree ("campaign_id","dedupe_key") WHERE "campaign_activity"."dedupe_key" is not null;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_target_value_check" CHECK ("campaigns"."target_value" is null or "campaigns"."target_value" > 0);--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_custom_objective_check" CHECK ("campaigns"."objective" <> 'other' or char_length(trim(coalesce("campaigns"."custom_objective", ''))) between 1 and 160);