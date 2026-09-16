CREATE TYPE "public"."post_review_automation_event_type" AS ENUM('deadline_approaching_24h', 'deadline_approaching_6h', 'overdue', 'escalated');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_ESCALATED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_COMMENT_UPDATED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_COMMENT_DELETED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_COMMENT_RESOLVED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_COMMENT_REOPENED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_MENTIONED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'comment_updated';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'comment_deleted';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'comment_resolved';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'comment_reopened';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'deadline_approaching';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'reminder_sent';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'overdue';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'escalated';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'mentioned';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_deadline_approaching' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_reminder_sent' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_overdue' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_escalated' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_comment_updated' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_comment_deleted' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_comment_resolved' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_comment_reopened' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_mentioned' BEFORE 'webhook.test';--> statement-breakpoint
CREATE TABLE "post_review_automation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"event_type" "post_review_automation_event_type" NOT NULL,
	"event_key" text NOT NULL,
	"review_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_review_automation_events_workspace_key_unique" UNIQUE("workspace_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "post_review_comment_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_review_comment_mentions_comment_user_unique" UNIQUE("comment_id","mentioned_user_id")
);
--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD COLUMN "parent_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "post_review_automation_events" ADD CONSTRAINT "post_review_automation_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_automation_events" ADD CONSTRAINT "post_review_automation_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_automation_events" ADD CONSTRAINT "post_review_automation_events_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_comment_mentions" ADD CONSTRAINT "post_review_comment_mentions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_comment_mentions" ADD CONSTRAINT "post_review_comment_mentions_comment_id_post_review_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."post_review_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_comment_mentions" ADD CONSTRAINT "post_review_comment_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_review_automation_events_post_created_at_index" ON "post_review_automation_events" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "post_review_automation_events_workspace_created_at_index" ON "post_review_automation_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "post_review_comment_mentions_workspace_index" ON "post_review_comment_mentions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "post_review_comment_mentions_user_index" ON "post_review_comment_mentions" USING btree ("mentioned_user_id","created_at");--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD CONSTRAINT "post_review_comments_parent_comment_id_post_review_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."post_review_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD CONSTRAINT "post_review_comments_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD CONSTRAINT "post_review_comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_review_comments_parent_index" ON "post_review_comments" USING btree ("parent_comment_id","created_at");