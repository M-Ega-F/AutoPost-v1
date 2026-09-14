CREATE TYPE "public"."workspace_member_role" AS ENUM('owner');--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_user_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"is_personal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspaces_owner_personal_unique" UNIQUE("owner_id","is_personal")
);
--> statement-breakpoint
ALTER TABLE "social_accounts" DROP CONSTRAINT "social_accounts_user_platform_account_unique";--> statement-breakpoint
ALTER TABLE "content_templates" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "active_workspace_id" uuid;--> statement-breakpoint
INSERT INTO "workspaces" ("name", "slug", "owner_id", "is_personal")
SELECT 'Personal workspace', 'personal-' || replace(u."id"::text, '-', ''), u."id", true
FROM "auth"."users" u
ON CONFLICT ("owner_id", "is_personal") DO NOTHING;--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT w."id", w."owner_id", 'owner'
FROM "workspaces" w
WHERE w."is_personal" = true
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;--> statement-breakpoint
UPDATE "content_templates" t
SET "workspace_id" = w."id"
FROM "workspaces" w
WHERE w."owner_id" = t."user_id" AND w."is_personal" = true;--> statement-breakpoint
UPDATE "media_assets" a
SET "workspace_id" = w."id"
FROM "workspaces" w
WHERE w."owner_id" = a."user_id" AND w."is_personal" = true;--> statement-breakpoint
UPDATE "posts" p
SET "workspace_id" = w."id"
FROM "workspaces" w
WHERE w."owner_id" = p."user_id" AND w."is_personal" = true;--> statement-breakpoint
UPDATE "social_accounts" a
SET "workspace_id" = w."id"
FROM "workspaces" w
WHERE w."owner_id" = a."user_id" AND w."is_personal" = true;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "content_templates" WHERE "workspace_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "media_assets" WHERE "workspace_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "posts" WHERE "workspace_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "social_accounts" WHERE "workspace_id" IS NULL) THEN
    RAISE EXCEPTION 'workspace backfill left orphaned resource rows';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "content_templates" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_id_index" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_index" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_id_index" ON "workspaces" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "content_templates" ADD CONSTRAINT "content_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_active_workspace_id_workspaces_id_fk" FOREIGN KEY ("active_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_templates_workspace_id_index" ON "content_templates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "media_assets_workspace_id_index" ON "media_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "posts_workspace_id_index" ON "posts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "social_accounts_workspace_id_index" ON "social_accounts" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_platform_account_unique" UNIQUE("workspace_id","platform","platform_account_id");
