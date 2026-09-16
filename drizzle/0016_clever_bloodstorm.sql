ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEWER_ASSIGNED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEWER_CHANGED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEWER_UNASSIGNED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_WITHDRAWN' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_COMMENT_ADDED' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_DEADLINE_APPROACHING' BEFORE 'ACCOUNT_EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REVIEW_OVERDUE' BEFORE 'ACCOUNT_EXPIRED';