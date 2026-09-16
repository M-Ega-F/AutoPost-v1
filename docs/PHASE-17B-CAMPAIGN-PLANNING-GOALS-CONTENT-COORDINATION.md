# Phase 17B — Campaign Planning, Goals & Content Coordination

Status: implemented and validated on 2026-09-14.

This document records the implementation of the current master plan. Future
changes belong in a new phase document; the master plan remains the source of
intent and is not edited as implementation documentation.

## Scope

Phase 17B extends the Phase 17A campaign foundation with planning, measurable
goals, progress and health reporting, timeline/activity history, content
coordination, approval visibility, calendar and review filtering, and an
analytics-readiness summary.

## Campaign planning model

Campaigns now support an optional `customObjective`, `targetMetric`, and
positive integer `targetValue`. Built-in objectives remain backward compatible;
`objective=other` requires a 1–160 character custom objective. A target metric
and value must be supplied together. Campaign date ranges are validated so the
end cannot precede the start.

Progress is derived from attached posts and excludes cancelled posts from the
completion denominator. It reports total, relevant, published, scheduled,
processing, failed, draft, and cancelled counts plus a safe completion
percentage. A zero-content campaign is explicitly represented as 0%, never as
an undefined or NaN value.

Health is derived from operational signals: failed content, overdue review,
missing content, and an approaching or passed campaign end date. The result is
`healthy`, `attention`, or `at_risk`, with user-facing reasons. The timeline
derives planning, content creation, review, scheduling, publishing, and
completed phases from campaign dates and post state.

## Activity history

`campaign_activity` stores workspace-scoped, append-only campaign events with
optional post and actor references, safe JSON metadata, occurrence time, and a
dedupe key. Supported events include campaign lifecycle changes, goal updates,
post attach/detach, approval, publishing, and publishing failure.

`GET /api/campaigns/:id/activity?page=1&pageSize=20` returns a paginated,
workspace-authorized activity feed. Activity writes are server-generated and
never accepted from the browser.

## Content coordination

Campaign post queries support server-side pagination and filters for status,
approval status, platform, date range, and caption search. Available-post
queries return only active-workspace posts that are not already assigned to a
campaign. Attach and detach operations remain permission-protected and do not
delete post history.

The campaign detail view exposes the current post mix, goal/progress cards,
health, timeline, approval summary, publishing summary, analytics coverage, and
recent activity. It links directly to the filtered Review Inbox and Calendar.

## Approval and publishing visibility

The approval summary is derived from the active workspace's `approvalRequired`
setting and attached post approval states. Publishing summary separates
published, scheduled, processing, failed, draft, and cancelled work. Completion
blocks a campaign while posts are still processing or scheduled, preventing a
false terminal state.

Review Inbox accepts `campaignId` and applies the campaign scope on the server.
Calendar accepts `campaignId`, validates that the campaign belongs to the
active workspace, and preserves the filter while navigating between months.

## Analytics preparation

Campaign detail aggregates the latest available analytics snapshot for each
attached post/platform target. It reports metric totals for available values,
per-metric availability, and post-level coverage. Missing snapshots or null
provider metrics remain unavailable rather than being coerced to zero.

This is intentionally a read model over existing analytics snapshots. It does
not invent provider data or alter the analytics refresh pipeline.

## API surface

The complete endpoint contract is maintained in
`docs/API-INTERNAL.md`. Phase 17B adds or extends:

- campaign create/update fields for objectives, targets, and planning dates;
- campaign post filters and pagination;
- `GET /api/campaigns/:id/activity`;
- `campaignId` filtering for Review Inbox and Calendar;
- richer campaign detail progress, health, timeline, approval, publishing, and
  analytics summaries.

## Security, RLS, and permissions

All campaign and activity reads resolve the active workspace from the signed-in
session. Client-provided workspace IDs are not trusted. Campaign mutations use
the existing granular campaign permissions; activity has no browser mutation
endpoint.

The migration
`supabase/migrations/0017_campaign_planning_activity_rls.sql` enables and
forces RLS on `campaign_activity`, revokes direct client access, and allows
only active workspace members to read or write rows. Live verification after
application confirmed `relrowsecurity=true` and
`relforcerowsecurity=true` for both `campaigns` and `campaign_activity`.

The Drizzle migration `drizzle/0020_chief_aqueduct.sql` adds the campaign goal
columns, constraints, activity table, indexes, foreign keys, and notification
and webhook event enum values. It was generated and applied successfully with
`npm run db:generate` and `npm run db:migrate`.

## Notifications and webhooks

Goal updates use the `CAMPAIGN_GOAL_UPDATED` notification type and
`campaign.goal_updated` webhook event. Existing lifecycle, post, approval, and
publishing integrations remain compatible. Event payloads use the existing safe
envelope and do not expose credentials, provider tokens, media storage keys, or
stack traces.

## Compatibility and limitations

All new goal fields are nullable, so existing campaigns continue to work. The
analytics summary is limited to snapshots already present in the database and
does not yet calculate target attainment because provider metrics differ in
meaning and units. Activity writes are best-effort integrations and must not
make a successful campaign mutation fail; the campaign's source-of-truth state
remains transactional.

Future phases can add goal attainment policies, richer drag-and-drop planning,
bulk content assignment, and provider-specific analytics normalization without
changing the current campaign ownership model.
