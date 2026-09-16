CREATE TABLE "campaign_optimization_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source_snapshot_id" uuid,
	"source_fingerprint" text,
	"title" text NOT NULL,
	"description" text,
	"action_type" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_by" uuid NOT NULL,
	"assigned_to" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opt_actions_source_fingerprint_unique" UNIQUE("workspace_id","campaign_id","source_fingerprint"),
	CONSTRAINT "opt_actions_title_length_check" CHECK (char_length("campaign_optimization_actions"."title") between 1 and 160),
	CONSTRAINT "opt_actions_type_check" CHECK ("campaign_optimization_actions"."action_type" in ('create_variant', 'change_format', 'change_platform', 'change_posting_time', 'test_hook', 'test_caption')),
	CONSTRAINT "opt_actions_status_check" CHECK ("campaign_optimization_actions"."status" in ('proposed', 'accepted', 'in_progress', 'completed', 'dismissed', 'cancelled', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "experiment_result_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"algorithm_version" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"control_value" integer,
	"variant_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"control_sample_size" integer DEFAULT 0 NOT NULL,
	"variant_sample_sizes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" text NOT NULL,
	"winner_variant_id" uuid,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_results_experiment_fingerprint_unique" UNIQUE("workspace_id","experiment_id","input_fingerprint"),
	CONSTRAINT "experiment_results_status_check" CHECK ("experiment_result_snapshots"."status" in ('ready', 'inconclusive', 'insufficient_data', 'failed')),
	CONSTRAINT "experiment_results_confidence_check" CHECK ("experiment_result_snapshots"."confidence" in ('high', 'medium', 'low', 'insufficient')),
	CONSTRAINT "experiment_results_sample_size_check" CHECK ("experiment_result_snapshots"."control_sample_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"post_id" uuid,
	"label" text NOT NULL,
	"variant_type" text DEFAULT 'content' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_variants_experiment_label_unique" UNIQUE("experiment_id","label"),
	CONSTRAINT "experiment_variants_experiment_post_unique" UNIQUE("experiment_id","post_id"),
	CONSTRAINT "experiment_variants_label_length_check" CHECK (char_length("experiment_variants"."label") between 1 and 80),
	CONSTRAINT "experiment_variants_type_check" CHECK ("experiment_variants"."variant_type" in ('content', 'format', 'platform', 'posting_time', 'hook', 'caption'))
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"optimization_action_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"experiment_type" text DEFAULT 'content' NOT NULL,
	"primary_metric" "campaign_target_metric" NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"control_post_id" uuid NOT NULL,
	"planned_start_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"winner_variant_id" uuid,
	"confidence" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_name_length_check" CHECK (char_length("experiments"."name") between 1 and 160),
	CONSTRAINT "experiments_type_check" CHECK ("experiments"."experiment_type" in ('content', 'format', 'platform', 'posting_time', 'hook', 'caption')),
	CONSTRAINT "experiments_status_check" CHECK ("experiments"."status" in ('draft', 'planned', 'running', 'paused', 'completed', 'cancelled')),
	CONSTRAINT "experiments_confidence_check" CHECK ("experiments"."confidence" is null or "experiments"."confidence" in ('high', 'medium', 'low', 'insufficient'))
);
--> statement-breakpoint
ALTER TABLE "campaign_optimization_actions" ADD CONSTRAINT "campaign_optimization_actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_optimization_actions" ADD CONSTRAINT "campaign_optimization_actions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_optimization_actions" ADD CONSTRAINT "campaign_optimization_actions_source_snapshot_id_campaign_intelligence_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."campaign_intelligence_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_optimization_actions" ADD CONSTRAINT "campaign_optimization_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_optimization_actions" ADD CONSTRAINT "campaign_optimization_actions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD CONSTRAINT "experiment_result_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_result_snapshots" ADD CONSTRAINT "experiment_result_snapshots_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_optimization_action_id_campaign_optimization_actions_id_fk" FOREIGN KEY ("optimization_action_id") REFERENCES "public"."campaign_optimization_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_control_post_id_posts_id_fk" FOREIGN KEY ("control_post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opt_actions_workspace_campaign_status_index" ON "campaign_optimization_actions" USING btree ("workspace_id","campaign_id","status","created_at");--> statement-breakpoint
CREATE INDEX "opt_actions_campaign_created_at_index" ON "campaign_optimization_actions" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "opt_actions_source_snapshot_index" ON "campaign_optimization_actions" USING btree ("source_snapshot_id");--> statement-breakpoint
CREATE INDEX "experiment_results_workspace_experiment_created_at_index" ON "experiment_result_snapshots" USING btree ("workspace_id","experiment_id","created_at");--> statement-breakpoint
CREATE INDEX "experiment_results_experiment_status_index" ON "experiment_result_snapshots" USING btree ("experiment_id","status","evaluated_at");--> statement-breakpoint
CREATE INDEX "experiment_variants_workspace_experiment_index" ON "experiment_variants" USING btree ("workspace_id","experiment_id","created_at");--> statement-breakpoint
CREATE INDEX "experiment_variants_post_index" ON "experiment_variants" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "experiments_workspace_campaign_status_index" ON "experiments" USING btree ("workspace_id","campaign_id","status","created_at");--> statement-breakpoint
CREATE INDEX "experiments_campaign_metric_status_index" ON "experiments" USING btree ("campaign_id","primary_metric","status");--> statement-breakpoint
CREATE INDEX "experiments_control_post_index" ON "experiments" USING btree ("control_post_id");