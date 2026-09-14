CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'processing', 'delivered', 'retrying', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_type" AS ENUM('post.created', 'post.scheduled', 'post.publishing', 'post.published', 'post.failed', 'post.partial_failure', 'post.cancelled', 'account.connected', 'account.disconnected', 'account.expired', 'account.reconnect_required', 'workspace.member_joined', 'workspace.member_removed', 'workspace.member_role_changed', 'workspace.ownership_transferred', 'workspace.invitation_created', 'workspace.invitation_accepted', 'workspace.invitation_cancelled', 'analytics.updated', 'webhook.test');--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type" "webhook_event_type" NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"response_time_ms" integer,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text,
	"safe_error_message" text,
	"response_body" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_webhook_event_unique" UNIQUE("webhook_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"consecutive_failure_count" integer DEFAULT 0 NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"disabled_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_name_length_check" CHECK (char_length("webhooks"."name") between 1 and 120),
	CONSTRAINT "webhooks_url_length_check" CHECK (char_length("webhooks"."url") between 1 and 2048)
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_created_at_index" ON "webhook_deliveries" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_workspace_status_created_at_index" ON "webhook_deliveries" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_event_id_index" ON "webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhooks_workspace_active_index" ON "webhooks" USING btree ("workspace_id","is_active");--> statement-breakpoint
CREATE INDEX "webhooks_workspace_created_at_index" ON "webhooks" USING btree ("workspace_id","created_at");