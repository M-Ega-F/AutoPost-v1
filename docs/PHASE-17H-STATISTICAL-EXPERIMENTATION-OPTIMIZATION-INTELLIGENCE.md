# Phase 17H — Statistical Experimentation & Optimization Intelligence

## Summary

Phase 17H extends the Phase 17G experiment evaluator with explainable,
deterministic statistical evidence. It does not publish, schedule, mutate
content, or apply an optimization automatically.

## Problem

Raw metric differences are not enough to declare a winner. Small samples,
stale analytics, different platform coverage, and short experiment duration can
make a large apparent uplift unreliable.

## Architecture

Campaign intelligence persists post summaries, then the existing experiment
evaluation path calls the pure `experiment-statistics` engine. The result is
stored in the existing `experiment_result_snapshots` table and is consumed by
the existing worker, notification, webhook, and UI layers.

## Statistical model

Post-intelligence scores are treated as bounded percentage estimates with the
summary sample size as the observation count. Uplift is computed as
`variant - control`; relative uplift is null when the control is zero.

## Confidence interval

Wilson intervals are used for bounded rate/score estimates. Bounds are clamped
to `[0, 1]` internally and returned as percentage points, with finite-number
guards at every boundary.

## Sample size

Configuration is centralized in `STATISTICAL_CONFIG`. The minimum comparable
sample is 30 observations per arm. The output distinguishes below, exactly at,
and above threshold and retains sample ratios.

## Power

Power is an awareness estimate based on the observed difference and standard
error. It is reported as insufficient, borderline, or adequate against a 0.80
target; power alone never creates significance.

## MDE

Minimum detectable effect uses the confidence and target-power z approximations
with the current control baseline and both arm sizes. Invalid baselines or
small samples return null with an explanatory reason.

## Winner logic

A winner requires sufficient sample, adequate duration, high data quality,
meaningful effect, positive evidence, and adequate power. Statistical status is
separate from lifecycle status and includes insufficient, promising,
significant, inconclusive, and winner states.

## Premature winner protection

An apparently higher variant with insufficient data remains `promising` and
the recommendation is to continue/review evidence. The UI never labels it a
winner candidate until the guards pass.

## Baseline normalization

The pure normalization helper compares like-for-like platform observations and
returns coverage plus a platform-dependent flag. Raw cross-platform values are
not merged without recording coverage.

## Platform-aware comparison

The evaluator attaches available post-platform comparisons to the statistical
details. Mixed positive and negative platform effects are reported as
platform-dependent rather than as a universal format claim.

## Historical learning

Eligible completed/winning evaluations create one workspace-scoped learning
row per experiment. The read model reports experiment count, winners,
inconclusive outcomes, average observed uplift/duration, evidence count, and a
deterministic strongest optimization dimension.

## API

See `docs/API-INTERNAL.md` for the statistics, paginated result history, and
historical learning endpoints. All routes resolve the active workspace
server-side and verify campaign/experiment ownership.

## Worker

The existing campaign automation worker evaluates running experiments after
fresh campaign/post intelligence summaries. No scheduler or queue was added.

## Notifications

Existing deduplicated experiment events are emitted only on meaningful
statistical transitions (insufficient data, significant/winner evidence, or a
completed/inconclusive state), not on every worker run.

## Webhooks

Existing experiment webhook events carry only allow-listed IDs and derived
statistical status, uplift, confidence, sample size, and evaluation time.
Captions, provider payloads, credentials, and secrets are excluded.

## Permissions

Reads use `campaigns:view`; mutations and manual evaluation use
`campaigns:update`. The existing workspace permission engine is unchanged.

## RLS

`supabase/migrations/0022_experiment_learnings_rls.sql` enables forced RLS for
historical learning and permits only authenticated workspace members. The
Phase 17G snapshot RLS migration remains the parent policy for result rows.

## Security

Client-supplied workspace IDs are not trusted. Snapshot and learning writes
are derived server-side. Metadata is bounded and passed through the existing
safe webhook/notification filters.

## Testing

The unit suite covers uplift, Wilson intervals, sample sufficiency, MDE, power,
winner guards, duration/freshness, numerical safety, platform normalization,
and deterministic output. Existing integration coverage remains green.

## Known limitations

Statistical significance is not absolute causal proof. Analytics are
observational, provider attribution differs, score summaries are not raw event
streams, MDE/power depend on assumptions, and small or stale samples remain
uncertain.

## Production rollout

Review and apply the generated Drizzle migration through the normal database
pipeline. Apply the Supabase RLS migration through the reviewed safety-gated
workflow. For multi-instance deployments, move the existing process-local
manual evaluation limiter to the repository's shared limiter convention.

## Algorithm version

All Phase 17H statistical snapshots use `17h-v1`. The version is persisted so
future algorithms can coexist without rewriting historical semantics.
