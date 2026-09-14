CREATE TYPE "public"."post_approval_status" AS ENUM('not_required', 'draft', 'in_review', 'changes_requested', 'approved');--> statement-breakpoint
CREATE TYPE "public"."post_review_action" AS ENUM('submitted', 'approved', 'changes_requested', 'resubmitted', 'invalidated');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CONTENT_SUBMITTED_FOR_REVIEW' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CONTENT_APPROVED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CONTENT_CHANGES_REQUESTED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CONTENT_RESUBMITTED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'APPROVAL_INVALIDATED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_requested' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.approved' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.changes_requested' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.resubmitted' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.approval_invalidated' BEFORE 'webhook.test';--> statement-breakpoint
CREATE TABLE "post_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action" "post_review_action" NOT NULL,
	"actor_id" uuid,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approval_status" "post_approval_status" DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "review_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "last_review_comment" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "approval_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "post_review_events" ADD CONSTRAINT "post_review_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_events" ADD CONSTRAINT "post_review_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_events" ADD CONSTRAINT "post_review_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_review_events_post_created_at_index" ON "post_review_events" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "post_review_events_workspace_created_at_index" ON "post_review_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_review_requested_by_users_id_fk" FOREIGN KEY ("review_requested_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;