CREATE TABLE "content_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"media_storage_key" text,
	"media_source_url" text,
	"media_type" "media_type",
	"mime_type" text,
	"file_size" bigint,
	"width" integer,
	"height" integer,
	"duration" integer,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_templates" ADD CONSTRAINT "content_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_templates_user_id_index" ON "content_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_templates_user_id_updated_at_index" ON "content_templates" USING btree ("user_id","updated_at");