ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'intelligence_updated';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'content_underperforming';--> statement-breakpoint
ALTER TYPE "public"."campaign_activity_type" ADD VALUE 'recommendation_created';--> statement-breakpoint
ALTER TYPE "public"."campaign_automation_event_type" ADD VALUE 'intelligence_updated';--> statement-breakpoint
ALTER TYPE "public"."campaign_automation_event_type" ADD VALUE 'content_underperforming';--> statement-breakpoint
ALTER TYPE "public"."campaign_automation_event_type" ADD VALUE 'recommendation_created';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_CONTENT_UNDERPERFORMING' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CAMPAIGN_RECOMMENDATION' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.intelligence_updated' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.content_underperforming' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'campaign.recommendation_created' BEFORE 'webhook.test';