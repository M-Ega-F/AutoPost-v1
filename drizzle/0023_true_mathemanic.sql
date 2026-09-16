CREATE TABLE "campaign_intelligence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"evaluation_version" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"evaluation_mode" text NOT NULL,
	"snapshot_reason" text NOT NULL,
	"performance_score" integer,
	"health_status" text,
	"momentum" text NOT NULL,
	"historical_trend" text NOT NULL,
	"freshness" text NOT NULL,
	"confidence" text NOT NULL,
	"coverage" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"evaluated_post_count" integer DEFAULT 0 NOT NULL,
	"top_performer_count" integer DEFAULT 0 NOT NULL,
	"underperforming_count" integer DEFAULT 0 NOT NULL,
	"rising_count" integer DEFAULT 0 NOT NULL,
	"declining_count" integer DEFAULT 0 NOT NULL,
	"goal_progress" integer,
	"insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opportunities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_intelligence_snapshots_campaign_fingerprint_unique" UNIQUE("workspace_id","campaign_id","input_fingerprint"),
	CONSTRAINT "campaign_intelligence_snapshots_coverage_check" CHECK ("campaign_intelligence_snapshots"."coverage" between 0 and 100),
	CONSTRAINT "campaign_intelligence_snapshots_score_check" CHECK ("campaign_intelligence_snapshots"."performance_score" is null or "campaign_intelligence_snapshots"."performance_score" between 0 and 100),
	CONSTRAINT "campaign_intelligence_snapshots_counts_check" CHECK ("campaign_intelligence_snapshots"."post_count" >= 0 and "campaign_intelligence_snapshots"."evaluated_post_count" >= 0 and "campaign_intelligence_snapshots"."top_performer_count" >= 0 and "campaign_intelligence_snapshots"."underperforming_count" >= 0 and "campaign_intelligence_snapshots"."rising_count" >= 0 and "campaign_intelligence_snapshots"."declining_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_intelligence_snapshots" ADD CONSTRAINT "campaign_intelligence_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intelligence_snapshots" ADD CONSTRAINT "campaign_intelligence_snapshots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_intelligence_snapshots_workspace_campaign_created_at_index" ON "campaign_intelligence_snapshots" USING btree ("workspace_id","campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "campaign_intelligence_snapshots_campaign_fingerprint_index" ON "campaign_intelligence_snapshots" USING btree ("campaign_id","input_fingerprint");