# Phase 17C — Campaign Automation, Performance & Optimization

## Status

Implemented and validated. This document records the implementation separately
from the editable Master Plan.

## Scope delivered

- Deterministic performance aggregation from the latest available analytics
  snapshot per campaign target, including metric coverage, engagement,
  platform breakdown, trend deltas, and actionable insights.
- Goal evaluation for views, likes, comments, shares, saves, reach, and
  impressions with 25%, 50%, 75%, and 100% milestones.
- Health evaluation with `healthy`, `warning`, `at_risk`, `critical`, and
  `completed` states. Missing analytics alone does not make a campaign
  critical.
- Deadline warnings at 7, 3, and 1 day, plus overdue alerts. Approval
  bottlenecks and publishing failures are also surfaced as actionable alerts.
- Idempotent automation event claiming using the
  `campaign_automation_events` registry and stable workspace-scoped event
  keys. Repeated worker retries do not duplicate activity, notifications, or
  webhook deliveries.

## Architecture

`src/lib/domain/campaign-performance.ts` contains pure aggregation, goal, and
health functions. `src/lib/domain/campaign-automation.ts` evaluates one
campaign, claims events, records campaign activity, and sends notifications and
webhooks through the existing safe delivery paths.

`src/lib/queue/campaign-automation.ts` defines the `campaign-evaluation` queue.
`src/workers/campaign-automation-worker.ts` processes scheduled and per-campaign
jobs. A repeatable scheduler enqueues bounded batches of active and draft
campaigns; trigger jobs are also queued after publish/failure, analytics
updates, approval changes, and campaign changes. The manual endpoint is:

`POST /api/campaigns/:id/evaluate`

The endpoint is authenticated, workspace-scoped, rate-limited, and requires
`campaigns:update`; editors can evaluate only campaigns they own.

## Data, RLS, and security

Migration `drizzle/0021_fuzzy_bill_hollister.sql` adds the automation event enum,
event types, and `campaign_automation_events` with workspace/campaign foreign
keys, a unique `(workspace_id, event_key)` constraint, indexes, and a bounded
event-key check. The corresponding Supabase migration is
`supabase/migrations/0018_campaign_automation_events_rls.sql`.

RLS is enabled and forced on `campaigns`, `campaign_activity`, and
`campaign_automation_events`. The automation service performs explicit
workspace authorization before reading campaign detail. Event metadata is
allowlisted before it reaches notifications or webhooks; secrets, tokens, and
raw provider payloads are not exposed.

## Reliability and compatibility

The campaign queue is included in the existing reliability snapshot and health
card. It uses the existing Redis/BullMQ retry, backoff, scheduler, heartbeat,
and graceful shutdown conventions. Campaign automation is additive: existing
campaign APIs, review flows, notifications, webhooks, and activity history
remain compatible. Analytics history is reused; no duplicate snapshot table was
introduced.

## Validation

The database migration was generated, reviewed, applied with `db:migrate`, and
verified against the live database. Unit coverage includes latest-snapshot
selection, null metrics, platform aggregation, trends, goal milestones, and
health behavior. Integration coverage verifies event claiming and repeated-run
idempotency. Final repository validation covers lint, typecheck, unit tests,
integration tests, build, and `git diff --check`.

## Known operating requirement

The campaign automation worker must run as a separate worker process in
production using the existing Redis and database configuration. Without that
process, manual evaluation can enqueue successfully but scheduled evaluation
will remain pending.
