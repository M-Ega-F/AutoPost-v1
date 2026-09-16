# Phase 17D — Campaign Content Intelligence & Optimization

## Status

Implemented incrementally on top of Phase 17A–17C. The Master Plan remains the
editable plan; this file is the implementation record.

## Overview and architecture

Campaign intelligence is calculated on demand from the existing normalized
analytics snapshots:

`analytics snapshots → batch retrieval → pure intelligence engine → API/UI`

The engine is in `src/lib/domain/campaign-intelligence.ts`. Retrieval loads
campaign posts, platform targets, media format, workspace timezone, and all
relevant snapshots in bounded batch queries. It never calls Instagram, TikTok,
Threads, or another provider from a page request. No intelligence table or
second queue was added.

## Metrics, score, and data quality

The normalized metrics are views, likes, comments, shares, saves, reach, and
impressions. Engagement is the sum of available interaction metrics and keeps
partial coverage visible. Engagement rate uses the first available denominator
in this order: reach, impressions, views; zero or missing denominators produce
an unavailable value.

The comparative content score is 0–100 and is campaign-scoped. Its explicit
weights are engagement 35%, reach 20%, views 20%, trend 10%, goal contribution
10%, and publishing outcome 5%; unavailable factors are removed and the
remaining weights are normalized. A campaign with fewer than two comparable
posts does not receive a misleading winner or score classification.

Every result exposes confidence, metric coverage, sample size, freshness, and
one of `fresh`, `aging`, `stale`, or `unavailable`. Freshness thresholds are
centralized in the engine. Malformed values remain null rather than becoming
zero.

## Ranking, comparison, and content intelligence

The report provides top performers, rising content, underperformers, most
engaging, highest reach, highest views, and goal contributors. Top and
underperformer classifications require explicit minimum samples; newly
published posts remain `insufficient_observation_time` until the observation
window passes. Comparison accepts at most three unique posts, validates campaign
membership server-side, and returns per-metric leaders with unavailable values
preserved.

Platform intelligence includes post count, analytics coverage, average score,
engagement, engagement rate, trend, and confidence. Format intelligence uses
the existing image/video data and treats posts without media as text. Posting
time intelligence groups published posts into three-hour windows using the
workspace IANA timezone and stays unavailable when the sample is too small.

Goal contribution uses the existing campaign target metric and target value;
unavailable metrics remain null. Insights include performance, platform,
format, timing, goal, and data-quality evidence. Recommendations cover
coverage, underperformance, format, platform, timing, goal concentration, and
safe content reuse candidates. Recommendations are deterministic suggestions;
they never duplicate, publish, pause, delete, reschedule, approve, or mutate a
post automatically.

## Automation and integrations

The existing `campaign-evaluation` scheduler and worker run intelligence as an
additional evaluation stage. State fingerprints use the existing
`campaign_automation_events` registry, so repeated 15-minute runs do not spam
activity, notifications, or webhooks. Meaningful changes can emit
`intelligence_updated`, `content_underperforming`, or
`recommendation_created`; the existing notification and webhook delivery
workers handle delivery, signing, retry, and SSRF protections.

Campaign activity records use the same deduplication index and are only written
when an intelligence state changes. Reliability continues to report the
existing campaign queue and worker health. Intelligence failures are logged and
retried without changing campaign, post, approval, or analytics states.

## API, permissions, and security

`GET /api/campaigns/:id/intelligence` supports pagination, safe sorting, and a
two- or three-post comparison through repeated `postId` parameters. It requires
authentication, the active workspace, `campaigns:view`, and the existing
campaign ownership/workspace checks. Comparison IDs are UUID-validated and
must belong to the campaign; invalid comparisons return 400, cross-scope
resources return 404, and unauthorized access returns 401/403 according to the
existing API contract. The endpoint uses the existing `campaignIntelligence`
rate-limit rule.

No new permission or secret was introduced. Responses exclude captions, media
URLs, OAuth tokens, refresh tokens, encrypted credentials, webhook secrets,
raw provider errors, raw analytics payloads, queue internals, and stack traces.
Post detail receives only its safe derived campaign context and remains
workspace-authorized.

## Database and migration

The intelligence calculation is on-demand and reuses existing analytics,
campaign activity, and automation tables. Migration
`drizzle/0022_curious_purple_man.sql` adds only the activity, automation,
notification, and webhook enum values required for meaningful state-change
events. It was generated, reviewed, and applied with `npm run db:migrate`.
No new table, index, RLS policy, or Supabase Data API surface was required;
existing workspace RLS remains in force.

## Tests and limitations

Unit coverage includes score normalization, partial/null metrics, denominator
priority, freshness, single-post handling, trends, comparison winners, and
format/timing behavior. Existing integration coverage verifies campaign
automation idempotency and regression behavior. Cross-workspace campaign and
comparison reads remain blocked by the same domain authorization path.

Known limitations: cross-platform metrics are not perfectly comparable;
posting-time and format signals need enough published samples; historical trend
needs at least two snapshots; analytics freshness depends on provider sync;
recommendations are suggestions only. The API response is paginated, while the
current deterministic engine loads the campaign post set in one batch; very
large campaigns should be monitored and may need a future paged-retrieval
optimization.
