ALTER TYPE "public"."platform" ADD VALUE 'youtube' BEFORE 'x';--> statement-breakpoint
ALTER TABLE "post_platforms" ADD COLUMN "metadata" jsonb;