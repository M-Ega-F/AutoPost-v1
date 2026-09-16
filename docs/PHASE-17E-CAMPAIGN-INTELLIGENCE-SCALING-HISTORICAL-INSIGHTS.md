# Phase 17E — Campaign Intelligence Scaling, Historical Insights & Optimization Automation

## Status

Implemented incrementally on top of Phase 17A–17D. `Master Plan.md` remains
the editable plan; this file is the implementation record.

## Architecture

The existing normalized analytics snapshots remain the source of truth:

`analytics snapshot → campaign-evaluation → cursor batches → deterministic engine → historical snapshot → automation/activity/notification/webhook`

No AI, LLM, machine-learning, provider analytics call, second scheduler, or
parallel queue was introduced. The existing `campaign-evaluation` queue and
`campaign-automation-worker` were extended.

## Scalable retrieval and batch processing

Campaign post retrieval now uses a stable `(created_at, id)` cursor internally.
The cursor is opaque base64url JSON, validates its ISO date and UUID, and never
contains credentials or raw SQL. Post/media/target/snapshot reads are performed
per `CAMPAIGN_INTELLIGENCE_BATCH_SIZE` batch (100), sequentially, with bounded
memory and no unbounded `Promise.all`.

The public Phase 17D intelligence response remains backward compatible with its
page/pageSize contract. Historical snapshots use bounded cursor pagination with
a maximum of 50 items per request and a maximum 90-day range.

## Incremental evaluation

Evaluation jobs carry only identifiers and safe scalar controls:

`campaignId`, `workspaceId`, `trigger`, `evaluationMode`, `reason`, `priority`.

Modes are `incremental` and `full`. Incremental evaluation uses an input
fingerprint built from campaign/goal timestamps, post membership/lifecycle, and
latest analytics collection metadata. An unchanged fingerprint is deduplicated
without inserting another snapshot. Analytics updates, campaign changes, post
membership changes, publishing, and approval changes enqueue the affected
campaign only.

## Snapshot model

`campaign_intelligence_snapshots` stores derived, safe historical state:

* evaluation version, input fingerprint, mode, and explainable reason;
* score, health/momentum/trend, freshness, confidence, coverage, and counts;
* deterministic insights, recommendations, and structured opportunities.

It never stores captions, media URLs, raw analytics payloads, tokens,
credentials, webhook secrets, or stack traces. A unique workspace/campaign/
fingerprint constraint prevents identical snapshots. Snapshot writes are
conditional and therefore idempotent.

## Historical insights, trend, and momentum

The engine distinguishes current content underperformance from historical
decline. Historical trend is `improving`, `stable`, `declining`, or
`insufficient_data`, using the centralized five-point score threshold.

Momentum is `accelerating`, `improving`, `stable`, `slowing`, `declining`, or
`unknown`. It requires a previous score and sufficient confidence, so the first
snapshot never fabricates a stable trend. Snapshot history exposes score,
direction, mode, reason, confidence, and safe derived insight/recommendation
data.

Recommendations are recorded as deterministic fingerprints. Current items are
active; repeated items can be identified as persisted, while older items remain
historical unless explicit resolution evidence is added in a future phase.

## Optimization opportunities

Recommendations are mapped to structured opportunities with:

`type`, `priority`, `confidence`, `title`, `reason`, `evidence`, `createdAt`,
`status`, and `fingerprint`.

Supported types are posting time, platform, format, content performance, and
goal contribution. Opportunities are suggestions only and never publish,
delete, reschedule, approve, or mutate content.

## Scheduler, queue, locking, and fairness

The existing 15-minute scheduler now considers deadline proximity, campaign
status, freshness, and time since last evaluation. Candidates are ordered by
urgent/high/normal/low priority, then oldest evaluation time, then stable
campaign identifiers so low-priority campaigns are not starved.

Scheduler enqueueing is sequential and bounded. Per-campaign evaluation uses a
Redis lock with a centralized five-minute TTL and compare-before-delete release.
Expired locks recover after worker crashes; duplicate jobs skip safely. The
existing worker command remains:

```bash
npm run campaign-automation-worker
```

## Automation and integrations

The existing `campaign_automation_events` registry continues to deduplicate
state transitions. Intelligence evaluation can emit the existing Phase 17D
events and the existing notification/webhook/activity systems deliver them.
No notification is emitted for every scheduler tick or small score movement.

Campaign worker heartbeat metadata now includes processed evaluation count,
failure count, and the last evaluation timestamp. Queue backlog, active,
failed, delayed, and stuck-job monitoring remains in the existing reliability
snapshot.

## API

Added:

* `GET /api/campaigns/:id/intelligence/history` — cursor-paginated, bounded
  history with optional ISO `from`/`to` filters;
* `GET /api/campaigns/:id/intelligence/opportunities` — current safe
  opportunities;
* `POST /api/campaigns/:id/evaluate` now accepts `{ "mode": "incremental" }`
  or `{ "mode": "full" }`.

The existing Phase 17D intelligence endpoint remains compatible. All endpoints
authenticate, enforce workspace permissions, validate UUIDs/enums/cursors,
apply rate limits, and return generic safe errors.

## Database, migration, and RLS

Drizzle schema and migration `0023_true_mathemanic.sql` add one table with
foreign keys, bounded counters, score/coverage checks, and indexes for
workspace/campaign history and fingerprints. `npm run db:generate` and
`npm run db:migrate` completed successfully against the configured database.

Supabase RLS migration `0019_campaign_intelligence_snapshots_rls.sql` enables
and forces RLS, revokes direct anonymous/authenticated table access, and allows
only workspace members. The SQL is prepared for deployment; applying the live
`REVOKE`/`FORCE RLS` operation requires explicit environment approval.

## Security and compatibility

Authorization remains server-side and uses the existing workspace permission
engine. Cursor scope is checked through the campaign workspace lookup. No new
permission model, cache of authorization, or secret-bearing payload exists.
Existing Phase 17D score, ranking, comparison, platform/format/timing,
goal-contribution, underperforming, recommendation, worker, notification,
webhook, approval, publishing, and campaign APIs remain additive-compatible.

There is no Redis derived-intelligence cache because the repository has no
existing cache abstraction; this avoids stale authorization or invalidation
risks. Derived results are bounded at query/worker boundaries instead.

## Tests and validation

Added unit coverage for opaque cursors, malformed cursors, deterministic
priority/fairness, snapshot trend/momentum primitives, and existing Phase 17D
intelligence behavior. Added integration coverage for snapshot creation,
deduplication, cursor history, and workspace isolation.

Required checks:

* `npm run lint` — PASS
* `npm run typecheck` — PASS
* `npm test` — PASS
* `npm run test:integration` — PASS
* `npm run build` — PASS
* `git diff --check` — PASS
* `npm run db:generate` — PASS
* `npm run db:migrate` — PASS

## Known limitations

The report engine still needs the complete campaign comparison set to calculate
cross-post normalization and global rankings, although database reads now
arrive in bounded batches. Future work can persist per-post derived summaries
or perform a second streaming pass for extremely large campaigns. Historical
resolution states remain conservative and do not auto-mark recommendations
resolved without explicit evidence.
