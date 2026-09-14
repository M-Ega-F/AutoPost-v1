# Phase 11 — Post analytics & performance insights

Implementation report completed on 2026-09-14.

## Implemented

- Capability-based analytics extension without changing publish semantics.
- Append-only `post_analytics_snapshots` storage with latest-per-target aggregation and historical detail.
- Range filtering (`7d`, `30d`, `all`) and platform filtering.
- Analytics queue and worker alongside the existing publish worker.
- Publish success queues a delayed analytics sync; queue failure cannot fail a published target.
- `GET /api/analytics`.
- `POST /api/analytics/refresh` for manual refresh.
- `GET /api/posts/:id/analytics`.
- Protected `/analytics` page with overview, platform status, top posts, empty state, and manual refresh.
- Dashboard Performance card and per-post Analytics section.

## Provider status

Instagram, Facebook, TikTok, Threads, LinkedIn, and X are currently marked
`Unavailable`. Existing OAuth grants are publish/profile grants, so no provider
adapter was added without an approved analytics permission. Metrics remain
`null` rather than using invented values.

TikTok's video metrics query requires the `video.list` scope, which is not part
of the current consent set. See the [TikTok Video Query API](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query).

## Flow and failure safety

`Published target → analytics queue job → analytics worker → optional provider capability → normalized metrics → immutable snapshot → analytics UI`.

Analytics failures, unavailable providers, expired accounts, and refresh queue
failures never change `posts.status` or `post_platforms.status`. Authentication
failures use the existing reconnect health flow only.

## Database and security

- Migration generated and applied: `drizzle/0005_familiar_patch.sql`.
- Supabase RLS policy: `supabase/migrations/0006_post_analytics_snapshots_rls.sql`.
- New table: `post_analytics_snapshots`.
- Indexes cover user/time, target/time, and user/platform lookups.
- API routes authenticate and scope all queries to the session user.
- Queue payloads contain only `postPlatformId`; credentials remain server-side.

## Validation

- Unit tests: 286 passed.
- Integration tests: 97 passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run db:generate` and `npm run db:migrate` passed.
- `git diff --check` passed.
