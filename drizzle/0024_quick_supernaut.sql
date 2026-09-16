CREATE TABLE "post_intelligence_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"format" text NOT NULL,
	"algorithm_version" text NOT NULL,
	"performance_score" integer,
	"engagement_score" integer,
	"reach_score" integer,
	"views_score" integer,
	"goal_contribution" integer,
	"trend" text NOT NULL,
	"momentum" text NOT NULL,
	"classification" text NOT NULL,
	"confidence" text NOT NULL,
	"freshness" text NOT NULL,
	"state" text DEFAULT 'fresh' NOT NULL,
	"is_underperforming" boolean DEFAULT false NOT NULL,
	"analytics_coverage" integer DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"input_fingerprint" text NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_intelligence_summaries_workspace_campaign_post_unique" UNIQUE("workspace_id","campaign_id","post_id"),
	CONSTRAINT "post_intelligence_summaries_score_check" CHECK (("post_intelligence_summaries"."performance_score" is null or "post_intelligence_summaries"."performance_score" between 0 and 100) and ("post_intelligence_summaries"."engagement_score" is null or "post_intelligence_summaries"."engagement_score" between 0 and 100) and ("post_intelligence_summaries"."reach_score" is null or "post_intelligence_summaries"."reach_score" between 0 and 100) and ("post_intelligence_summaries"."views_score" is null or "post_intelligence_summaries"."views_score" between 0 and 100) and ("post_intelligence_summaries"."goal_contribution" is null or "post_intelligence_summaries"."goal_contribution" between 0 and 100)),
	CONSTRAINT "post_intelligence_summaries_quality_check" CHECK ("post_intelligence_summaries"."analytics_coverage" between 0 and 100 and "post_intelligence_summaries"."sample_size" >= 0),
	CONSTRAINT "post_intelligence_summaries_state_check" CHECK ("post_intelligence_summaries"."state" in ('fresh', 'stale', 'evaluating', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "post_intelligence_summaries" ADD CONSTRAINT "post_intelligence_summaries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_intelligence_summaries" ADD CONSTRAINT "post_intelligence_summaries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_intelligence_summaries" ADD CONSTRAINT "post_intelligence_summaries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_intelligence_summaries_campaign_perf_index" ON "post_intelligence_summaries" USING btree ("workspace_id","campaign_id","performance_score","post_id");--> statement-breakpoint
CREATE INDEX "post_intelligence_summaries_campaign_engagement_index" ON "post_intelligence_summaries" USING btree ("workspace_id","campaign_id","engagement_score","post_id");--> statement-breakpoint
CREATE INDEX "post_intelligence_summaries_campaign_reach_index" ON "post_intelligence_summaries" USING btree ("workspace_id","campaign_id","reach_score","post_id");--> statement-breakpoint
CREATE INDEX "post_intelligence_summaries_campaign_views_index" ON "post_intelligence_summaries" USING btree ("workspace_id","campaign_id","views_score","post_id");--> statement-breakpoint
CREATE INDEX "post_intelligence_summaries_campaign_state_index" ON "post_intelligence_summaries" USING btree ("workspace_id","campaign_id","state","updated_at");--> statement-breakpoint
CREATE INDEX "post_intelligence_summaries_campaign_trend_index" ON "post_intelligence_summaries" USING btree ("workspace_id","campaign_id","trend","post_id");--> statement-breakpoint
CREATE INDEX "post_intelligence_summaries_campaign_underperforming_index" ON "post_intelligence_summaries" USING btree ("workspace_id","campaign_id","is_underperforming","post_id");