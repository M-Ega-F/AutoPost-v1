ALTER TABLE "notifications" DROP CONSTRAINT "notifications_href_internal_check";--> statement-breakpoint
DROP INDEX "notifications_unread_index";--> statement-breakpoint
DROP INDEX "notifications_unread_dedupe_unique";--> statement-breakpoint
CREATE INDEX "notifications_unread_index" ON "notifications" USING btree ("recipient_id","workspace_id","created_at") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_unread_dedupe_unique" ON "notifications" USING btree ("workspace_id","recipient_id","dedupe_key") WHERE "notifications"."read_at" is null and "notifications"."dedupe_key" is not null;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_href_internal_check" CHECK ("notifications"."href" is null or ("notifications"."href" like '/%' and "notifications"."href" not like '//%'));