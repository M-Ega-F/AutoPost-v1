# Phase 17F — Scalable Post Intelligence, Derived Summaries & Advanced Ranking

Status: implemented in the application and Drizzle database migration.

## 1. Scope

Phase 17F adds persisted, workspace-scoped post intelligence summaries. Campaign ranking reads those summaries with database ordering and opaque keyset cursors instead of reconstructing a complete campaign report for every ranking request.

## 2. Derived summary model

`post_intelligence_summaries` stores only safe derived values: performance, engagement, reach, views and goal scores; trend, momentum, classification, confidence, freshness, state, coverage, sample size, algorithm version, input fingerprint and evaluation timestamps. Captions, raw analytics, access tokens and provider payloads are not persisted in this table or returned by the ranking API.

Each row is unique by `(workspace_id, campaign_id, post_id)`. Campaign and post foreign keys use cascade deletion. Detaching a post removes its campaign summary; analytics changes mark the existing summary stale before the existing campaign evaluation job refreshes it.

## 3. Evaluation and idempotency

`persistPostIntelligenceSummaries` consumes the existing `evaluateCampaignIntelligence` output. It does not implement a second scoring algorithm. Upserts are guarded by `evaluated_at <= excluded.evaluated_at`, so an older retry cannot overwrite a newer result. A failed evaluation leaves the last known good summary intact.

The existing `campaign-evaluation` queue and Redis campaign lock remain the only evaluation path. A manual post endpoint uses the same permission boundary and evaluator; it does not create a new queue or expose arbitrary job payloads.

## 4. Ranking API

`GET /api/campaigns/:id/intelligence/rankings` supports `performance`, `engagement`, `reach`, `views` and `goal_contribution`, plus platform, format, trend, momentum, confidence, minimum confidence and underperforming filters. It returns `{ items, nextCursor, hasMore, algorithmVersion, dataFreshness, evaluatedAt }`.

The sort column is selected from a fixed allow-list. Ordering is descending metric value followed by ascending `post_id`; the cursor contains the ranking type, last metric value and tie-breaker ID in base64url JSON. Cursor type mismatches and malformed values are rejected. No offset pagination or full campaign ranking load is used.

## 5. UI and post detail

Campaign intelligence now includes a scalable ranking card with metric tabs and cursor-based “Load more”. Post detail prefers a persisted summary and falls back to the existing campaign calculation when no summary exists. Stale summaries remain visible with their state so the user can distinguish last-known-good data from a fresh evaluation.

## 6. Security and RLS

All domain reads require `campaigns:view`; manual post evaluation requires `campaigns:update`. Campaign ownership is checked against the active workspace before ranking. The separate Supabase migration `0020_post_intelligence_summaries_rls.sql` enables and forces RLS with a workspace-member policy and revokes direct anonymous/authenticated table grants. It is prepared for the Supabase migration workflow; the local Drizzle migration was applied successfully.

## 7. Backfill and limitations

Existing campaign evaluation populates summaries for the report page it evaluates. New or changed posts are refreshed through the existing incremental evaluation path. A dedicated mass backfill is intentionally not introduced in this phase; production should run a bounded, resumable backfill using campaign/post identifiers and the same queue lock before treating ranking coverage as complete for historical campaigns.

## 8. Validation

Validated with `npm run db:generate`, `npm run db:migrate`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, and `git diff --check`. Integration coverage includes ranking order, keyset page uniqueness, stale invalidation and workspace isolation.
