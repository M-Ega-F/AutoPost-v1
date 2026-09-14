# Phase 14 — Reliability and Observability

## Scope

Phase 14 adds visibility around the existing BullMQ publishing and analytics
queues. It does not replace enqueueing, retries, idempotency, provider
execution, or the recovery sweep.

## Architecture

- Redis health uses the existing shared ioredis client and a bounded `PING`.
- Queue metrics use BullMQ's real `getJobCounts()` and bounded `getJobs()` calls.
- Worker liveness is represented by a short-lived Redis hash heartbeat. The
  publish worker reports both queue names and refreshes the key every 30
  seconds; a missing heartbeat after 90 seconds is stale.
- Worker discovery uses incremental `SCAN`, never `KEYS`, and reads the
  discovered hashes with a pipeline.
- Failed and stuck inspection is limited to 50 recent observations per queue.
  An active item older than 10 minutes or an overdue delayed item older than 5
  minutes is classified as stuck. A failed item is final when its retry budget
  is exhausted.
- The API maps job payload IDs back to `post_platforms` through the requested
  workspace before returning inspection details. Raw job payloads, IDs,
  stacktraces, provider responses, captions, media URLs, and credentials are
  never returned.

## API and UI

`GET /api/workspace/reliability` requires an authenticated session and the
active workspace's `workspace:view` permission. The Dashboard renders the
result as “Publishing health”, refreshes it every 30 seconds, and shows
waiting, active, attention, deferred, service, and safe failed/stuck summaries.
Redis or queue outages render as unavailable/degraded rather than as an
incorrect healthy or empty state.

## Notification integration

The existing Phase 13 publishing events continue to create user-facing
notifications for confirmed publish, partial failure, and final failure. The
reliability endpoint is read-only and deliberately does not create alerts while
being polled, preventing notification spam. Retry and recovery behavior remains
owned by BullMQ and the existing database recovery sweep.

## Database and migration status

No schema, RLS, or migration changes are required for Phase 14. Workspace
isolation is enforced in the service layer by the existing authorization
context and workspace-filtered post query.

## Validation checklist

- `npm run lint`
- `npm run typecheck`
- `npm run test:all`
- `npm run test:integration`
- `npm run build`
- `git diff --check`
