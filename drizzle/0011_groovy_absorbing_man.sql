CREATE TYPE "public"."notification_priority" AS ENUM('info', 'success', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('POST_PUBLISHED', 'POST_FAILED', 'POST_PARTIAL_FAILURE', 'POST_SCHEDULED', 'POST_CANCELLED', 'POST_RETRYING', 'POST_RETRY_FAILED', 'ACCOUNT_EXPIRED', 'ACCOUNT_RECONNECT_REQUIRED', 'ACCOUNT_DISCONNECTED', 'INVITATION_RECEIVED', 'INVITATION_ACCEPTED', 'MEMBER_JOINED', 'MEMBER_LEFT', 'WORKSPACE_TRANSFERRED', 'WORKSPACE_DELETED', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "recipient_id" uuid NOT NULL,
  "actor_id" uuid,
  "type" "notification_type" NOT NULL,
  "priority" "notification_priority" DEFAULT 'info' NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "resource_type" text,
  "resource_id" uuid,
  "href" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_href_internal_check" CHECK ("href" is null or ("href" like '/%' and "href" not like '//%'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_workspace_created_at_index" ON "notifications" USING btree ("recipient_id","workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_workspace_created_at_index" ON "notifications" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_index" ON "notifications" USING btree ("recipient_id","workspace_id","created_at") WHERE "read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_unread_dedupe_unique" ON "notifications" USING btree ("workspace_id","recipient_id","dedupe_key") WHERE "read_at" is null and "dedupe_key" is not null;
