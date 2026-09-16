ALTER TYPE "public"."post_review_action" ADD VALUE 'reviewer_assigned';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'reviewer_changed';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'reviewer_unassigned';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'deadline_changed';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'withdrawn';--> statement-breakpoint
ALTER TYPE "public"."post_review_action" ADD VALUE 'comment_added';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_withdrawn' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.reviewer_assigned' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.reviewer_changed' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.reviewer_unassigned' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_deadline_changed' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'post.review_comment_added' BEFORE 'webhook.test';--> statement-breakpoint
CREATE TABLE "post_review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_review_comments_body_length_check" CHECK (char_length("post_review_comments"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "assigned_reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "review_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD CONSTRAINT "post_review_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD CONSTRAINT "post_review_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_comments" ADD CONSTRAINT "post_review_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_review_comments_post_created_at_index" ON "post_review_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "post_review_comments_workspace_created_at_index" ON "post_review_comments" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "post_review_comments_author_index" ON "post_review_comments" USING btree ("author_id","created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_assigned_reviewer_id_users_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_workspace_approval_queue_index" ON "posts" USING btree ("workspace_id","approval_status","review_due_at","updated_at");--> statement-breakpoint
CREATE INDEX "posts_assigned_reviewer_index" ON "posts" USING btree ("assigned_reviewer_id","approval_status");