# Phase 16C — Approval Automation, Reminders & Review Collaboration

## Summary

Phase 16C extends the Phase 16A approval state machine and Phase 16B review inbox with server-side reminders, overdue detection, owner/admin escalation, threaded comments, mentions, soft deletion, editing, and discussion resolution. Automation observes reviews only; it never approves, requests changes, publishes, or changes approval state.

## Architecture and lifecycle

`review-automation-worker` owns the `review-automation` BullMQ queue. On startup it idempotently upserts the `review-automation-scheduler` Job Scheduler and processes a bounded batch every five minutes by default. `REVIEW_AUTOMATION_INTERVAL_MS` can override the interval from 60 seconds to one hour.

The worker queries only `approval_status = in_review` posts with a current workspace member assigned and a deadline. Each event is claimed in `post_review_automation_events` with a unique workspace/event key, then written to the existing `post_review_events` timeline before notifications and webhook delivery are dispatched. Retries therefore do not duplicate automation events.

## Reminder, overdue, and escalation rules

The centralized policy emits:

- `deadline_approaching_24h`: once when the deadline is within 24 hours.
- `deadline_approaching_6h`: once when the deadline is within 6 hours.
- `overdue`: once when the deadline is reached.
- `escalated`: once after 24 hours overdue to active owner/admin members.

Keys include post, current reviewer, deadline instant, and event type. A changed deadline or reassignment therefore gets a fresh lifecycle, while a removed reviewer or completed/withdrawn review is skipped safely by the candidate query. `overdue` remains a derived state (`in_review` plus a passed deadline).

## Collaboration model

`post_review_comments` now supports `parent_comment_id` with maximum effective depth of one, `edited_at`, `deleted_at`, `deleted_by`, `resolved_at`, and `resolved_by`. Deleted comments remain in the thread and render as a safe placeholder. Root discussions can be resolved or reopened without changing approval state.

`post_review_comment_mentions` stores validated workspace member IDs with a unique `(comment_id, mentioned_user_id)` constraint. The server resolves `@DisplayName`/compact display name tokens against active members in the active workspace; unknown or cross-workspace members are rejected. A comment allows at most 20 mentions. Raw comment text is rendered as plain text.

## Permissions and API

Granular capabilities are available in addition to the existing `content:comment`: `content:comments:view`, `content:comments:create`, `content:comments:update`, `content:comments:delete`, and `content:comments:resolve`. Editors can manage their own comments; owners/admins can resolve discussions. Viewers can read comments but cannot mutate them.

Endpoints:

- `POST /api/posts/:id/review/comments` — create a root comment or reply with `parentCommentId`.
- `PATCH /api/posts/:id/review/comments/:commentId` — edit own comment.
- `DELETE /api/posts/:id/review/comments/:commentId` — soft-delete own comment.
- `POST /api/posts/:id/review/comments/:commentId/resolve` — resolve or reopen a root discussion.
- `GET /api/posts/:id/review/comments` — list safe comment data through the existing review detail boundary.

All routes authenticate, resolve the active workspace, validate membership/permission/post scope, apply rate limits, and return the existing safe API error format.

## Notifications and webhooks

Automation emits `REVIEW_DEADLINE_APPROACHING`, `REVIEW_OVERDUE`, or `REVIEW_ESCALATED`. Collaboration emits comment updated/deleted/resolved/reopened and mention notifications. Webhook events use the existing asynchronous delivery pipeline: `post.review_deadline_approaching`, `post.review_reminder_sent`, `post.review_overdue`, `post.review_escalated`, `post.review_comment_updated`, `post.review_comment_deleted`, `post.review_comment_resolved`, `post.review_comment_reopened`, and `post.review_mentioned`.

Payloads contain IDs, status, deadline, and event metadata only; they do not contain captions, media URLs, comment bodies, credentials, secrets, queue keys, or stack traces.

## Database and RLS

Drizzle migration `0018_watery_the_spike.sql` adds the automation enum/table, mention table, comment collaboration columns, indexes, and foreign keys. Supabase migration `0015_review_automation_collaboration_rls.sql` enables and forces RLS on the new tables. Policies require active workspace membership. Domain authorization remains mandatory because RLS is defense in depth, not a replacement for server-side permission checks.

## Reliability and compatibility

The reliability snapshot now includes `reviewAutomation`. The queue carries only `{ trigger: "scheduler" }`; it never carries post content or credentials. Existing publish queue, webhook retry worker, approval transitions, publish guard, withdraw behavior, and `approvalRequired = false` behavior remain unchanged.

## Tests and known limitations

Pure automation tests cover reminder windows, catch-up behavior, overdue/escalation, and deadline/reviewer key rotation. The existing integration suite exercises the real migrated schema and includes the new tables in its reset list. Comment mention suggestions are not yet a dedicated autocomplete control; the current UI documents the `@DisplayName` convention. Automation is periodic rather than event-driven, so a short delay up to the configured interval is expected.
