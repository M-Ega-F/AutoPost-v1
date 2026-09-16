# Phase 17G — Campaign Optimization Actions & Experimentation

Phase 17G turns the existing campaign intelligence report, recommendations,
opportunities, and post summaries into an explicit optimization work loop. It
does not create a second scoring engine and it never mutates or publishes a
post automatically.

## Architecture

`campaign_optimization_actions` stores a workspace/campaign-scoped action and
its lifecycle (`proposed → accepted → in_progress → completed`, with explicit
dismissed, cancelled, and failed exits). `experiments` stores a hypothesis,
control post, primary metric, and lifecycle. `experiment_variants` links up to
three alternative posts to the experiment. `experiment_result_snapshots`
stores a deduplicated, safe evaluation snapshot keyed by the current summary
fingerprint.

The application resolves the active workspace on the server, checks campaign
membership and `campaigns:view`/`campaigns:update`, then repeats workspace and
campaign predicates in every query. Cross-campaign control posts, variants,
actions, and experiments are rejected. A conditional update protects lifecycle
transitions from stale clients.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/campaigns/:id/optimization-actions` | List or create an action |
| GET | `/api/campaigns/:id/optimization-actions/:actionId` | Read one action |
| POST | `/api/campaigns/:id/optimization-actions/:actionId/:action` | `accept`, `start`, `complete`, `dismiss`, `cancel`, `fail`, or `retry` |
| GET/POST | `/api/campaigns/:id/experiments` | List or create an experiment |
| GET | `/api/campaigns/:id/experiments/:experimentId` | Read an experiment with variants and latest result |
| POST | `/api/campaigns/:id/experiments/:experimentId/:action` | `plan`, `start`, `pause`, `resume`, `complete`, or `cancel` |
| GET/POST | `/api/campaigns/:id/experiments/:experimentId/variants` | List or add a variant |
| DELETE | `/api/campaigns/:id/experiments/:experimentId/variants/:variantId` | Remove a draft/planned variant |
| GET/POST | `/api/campaigns/:id/experiments/:experimentId/results` | Read or evaluate the current result |

## Evaluation

The evaluator consumes `post_intelligence_summaries`; raw analytics are never
copied into an experiment result. It compares normalized derived scores for
the selected primary metric, reports `insufficient_data` when control or every
variant lacks a usable summary, and only marks a winner when a variant is
strictly above the control. Confidence is inherited conservatively from fresh
summary confidence. Repeating an evaluation with the same input fingerprint
does not create another snapshot.

Running experiments are evaluated by the existing campaign automation worker
after fresh campaign/post intelligence summaries are persisted. No second
queue or scheduler is introduced. Evaluation failures are isolated and logged
as worker failures; campaign publishing continues through its existing queue.

## UI and workflow boundaries

Campaign detail includes an Optimization lab showing the existing intelligence
signal count, action lifecycle, and experiment list. The experiment detail page
supports adding/removing variants, lifecycle transitions, and manual result
evaluation. Variants link existing campaign posts; content creation, review,
approval, scheduling, publishing, retry, and cancellation continue to use the
existing post workflows. There is no auto-publish path from an optimization
action or experiment winner.

Mutations write safe campaign activity metadata containing IDs, type/status,
and dedupe keys. Descriptions, captions, media URLs, provider responses,
credentials, and secrets are not placed in the activity record or result
snapshot.

## Security and rollout

The application migrations are `drizzle/0025_fixed_maximus.sql`,
`drizzle/0026_adorable_redwing.sql`, and
`drizzle/0027_sleepy_silver_surfer.sql`; all are applied with
`npm run db:migrate`. The prepared Supabase migration
`supabase/migrations/0021_campaign_optimization_experimentation_rls.sql`
enables and forces RLS, revokes direct client table access, and grants
workspace-member policies. It must be applied through the reviewed Supabase
migration workflow; the local safety gate may reject `REVOKE`/`FORCE RLS` for
live execution. Until it is applied, the privileged server domain remains the
only supported access path.

The result model deliberately uses existing derived intelligence scores rather
than claiming statistical significance. A future phase can add sample-size
power analysis and richer metric-specific confidence once the product has
enough observations.
