CREATE TABLE "experiment_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"platform" text,
	"optimization_dimension" text NOT NULL,
	"metric" text NOT NULL,
	"observed_uplift" numeric(12, 6),
	"confidence" numeric(5, 4),
	"sample_size" integer DEFAULT 0 NOT NULL,
	"duration_days" numeric(10, 4),
	"result" text NOT NULL,
	"learning_strength" text NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"consistency" numeric(5, 4),
	"algorithm_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_learnings_experiment_platform_unique" UNIQUE("workspace_id","experiment_id","platform"),
	CONSTRAINT "experiment_learnings_sample_size_check" CHECK ("experiment_learnings"."sample_size" >= 0),
	CONSTRAINT "experiment_learnings_evidence_count_check" CHECK ("experiment_learnings"."evidence_count" >= 1),
	CONSTRAINT "experiment_learnings_strength_check" CHECK ("experiment_learnings"."learning_strength" in ('weak', 'moderate', 'strong'))
);
--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "statistical_status" text DEFAULT 'insufficient_data' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "sample_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "control_metric" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "variant_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "absolute_uplifts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "relative_uplifts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "confidence_level" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "confidence_intervals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "mde_absolute" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "mde_relative" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "power_estimate" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "target_power" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "winner_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "duration_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "data_quality" text DEFAULT 'insufficient' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "recommendation" text DEFAULT 'continue_experiment' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD COLUMN "statistical_details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_learnings" ADD CONSTRAINT "experiment_learnings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_learnings" ADD CONSTRAINT "experiment_learnings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_learnings" ADD CONSTRAINT "experiment_learnings_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiment_learnings_workspace_created_at_index" ON "experiment_learnings" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "experiment_learnings_workspace_platform_metric_index" ON "experiment_learnings" USING btree ("workspace_id","platform","metric");--> statement-breakpoint
CREATE INDEX "experiment_learnings_workspace_result_index" ON "experiment_learnings" USING btree ("workspace_id","result","created_at");--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD CONSTRAINT "experiment_results_statistical_status_check" CHECK ("experiment_result_snapshots"."statistical_status" in ('invalid', 'insufficient_data', 'running', 'inconclusive', 'statistically_promising', 'statistically_significant', 'winner', 'completed'));--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD CONSTRAINT "experiment_results_duration_check" CHECK ("experiment_result_snapshots"."duration_hours" >= 0);