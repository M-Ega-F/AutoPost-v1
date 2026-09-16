CREATE TYPE "public"."campaign_automation_event_type" AS ENUM('goal_milestone', 'goal_completed', 'health_changed', 'deadline_warning', 'deadline_overdue', 'publishing_issue', 'approval_bottleneck');--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'goal_milestone';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'goal_completed';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'health_changed';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'deadline_warning';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'deadline_overdue';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'publishing_issue';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'approval_bottleneck';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_GOAL_MILESTONE' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_GOAL_COMPLETED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_HEALTH_WARNING' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_AT_RISK' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_CRITICAL' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_DEADLINE_WARNING' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_DEADLINE_OVERDUE' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_APPROVAL_BOTTLENECK' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.goal_milestone' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.goal_completed' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.health_changed' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.deadline_warning' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.deadline_overdue' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.performance_updated' BEFORE 'webhook.test';--> statement-breakpoint
CREATE TABLE "campaign_automation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"event_type" "campaign_automation_event_type" NOT NULL,
	"event_key" text NOT NULL,
	"state" text NOT NULL,
	"milestone" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_automation_events_workspace_key_unique" UNIQUE("workspace_id","event_key"),
	CONSTRAINT "campaign_automation_events_event_key_length_check" CHECK (char_length("campaign_automation_events"."event_key") between 1 and 240)
);
--> statement-breakpoint
ALTER TABLE "campaign_automation_events" ADD CONSTRAINT "campaign_automation_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_automation_events" ADD CONSTRAINT "campaign_automation_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_automation_events_campaign_created_at_index" ON "campaign_automation_events" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "campaign_automation_events_workspace_created_at_index" ON "campaign_automation_events" USING btree ("workspace_id","created_at");