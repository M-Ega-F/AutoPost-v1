ALTER TYPE "public"."notification_type" ADD VALUE 'OPTIMIZATION_ACTION_CREATED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'OPTIMIZATION_ACTION_COMPLETED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'EXPERIMENT_WINNER_DETECTED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'EXPERIMENT_INSUFFICIENT_DATA' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'optimization.action_created' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'optimization.action_completed' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'experiment.created' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'experiment.started' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'experiment.paused' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'experiment.completed' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'experiment.cancelled' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'experiment.winner_detected' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_type" ADD VALUE 'experiment.insufficient_data' BEFORE 'webhook.test';--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" DROP CONSTRAINT "experiment_results_status_check";--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD CONSTRAINT "experiment_results_status_check" CHECK ("experiment_result_snapshots"."status" in ('variant_wins', 'control_wins', 'inconclusive', 'insufficient_data', 'failed'));