# Phase 16B — Review Inbox & Advanced Approval Management

## 1. Summary

Phase 16B extends the existing Phase 16A approval workflow with a workspace-
aware review inbox, queue priority, reviewer assignment, UTC deadlines,
withdrawal, discussion comments, richer timeline events, notifications, and
webhook events.

## 2. Architecture

`src/lib/domain/reviews.ts` owns query filtering, queue sorting, capabilities,
atomic mutations, and review metadata. Route handlers validate input and return
the existing safe API error format. `/reviews` renders server-loaded data and
uses the active workspace resolved by the existing authorization layer.

## 3. Phase 16A compatibility

The original approval statuses and endpoints remain unchanged. Legacy
`not_required` posts still publish normally, and Phase 16A submit/approve/request
changes/resubmit behavior remains the source of truth.

## 4. Review Inbox

The protected `/reviews` page shows Needs attention, Waiting for review,
Assigned to me, Changes requested, and Recently approved sections. Counts and
items come from server-side queries; empty states and pagination are included.

## 5. Review Queue

Default ordering is overdue, deadline soon, scheduled soon, waiting longest,
then recently updated. Alternate server-side sorts are priority, oldest,
newest, scheduled, deadline, and updated.

## 6. Reviewer assignment

Posts in `in_review` can be assigned to an owner or admin who is an active
member of the current workspace. Any reviewer, assign, change, and unassign
are represented by review events. Self-review remains forbidden.

## 7. Reviewer policy

The existing `content:review` permission is used for approval and management.
The new `content:comment` permission is granted to owner, admin, and editor;
viewers remain read-only.

## 8. Deadline and overdue

`posts.review_due_at` stores an optional UTC timestamp. Past deadlines are
rejected when set, displayed in the workspace timezone, and computed as
overdue only for `in_review` posts. No browser timer or in-memory cron changes
database state.

## 9. Withdraw review

The author with `posts:update`, or a reviewer-capable owner/admin, can move an
`in_review` post back to `draft`. The conditional update, metadata cleanup,
and `withdrawn` event are in one transaction, making duplicate requests safe.

## 10. Comments

`post_review_comments` provides flat chronological plain-text discussion. Body
length is limited to 2000 characters, React renders it as text, and comments
are workspace/post scoped. Create/list are implemented; edit/delete are a
documented follow-up because they are not required for the first inbox slice.

## 11. Timeline and audit

The existing `post_review_events` timeline now also records reviewer assigned,
changed, unassigned, deadline changed, comment added, and withdrawn events.
Member removal or loss of review permission unassigns active assignments.

## 12. Summary and API

`GET /api/reviews` returns items, pagination, active workspace timezone, and
Pending review, Assigned to me, Overdue, Changes requested, and Approved today
summary counts. Detail, reviewer, deadline, withdraw, and comment endpoints
are documented in `docs/API-INTERNAL.md`.

## 13. Notifications

Management events use the existing notification deduplication key and target
the post author, assigned reviewer, or workspace reviewers as appropriate.
Deadline approaching/overdue scheduling is intentionally not introduced until
a durable scheduler is available.

## 14. Webhooks

New events use the Phase 15 delivery queue and safe envelope. The allow-list
contains only IDs, status, timestamp-safe metadata, reviewer ID, deadline, or
comment ID; secrets, tokens, captions, and media URLs are excluded.

## 15. Database and migrations

Drizzle migration `0015_unique_bruce_banner.sql` adds reviewer/deadline columns,
review action enum values, comments, and queue indexes. Migration
`0016_clever_bloodstorm.sql` adds review-management notification enum values;
`0017_simple_starjammers.sql` adds the deadline-changed notification value.
The Supabase RLS migration is `supabase/migrations/0014_review_management_rls.sql`.

## 16. RLS and security

Comments and review events are forced through workspace membership policies.
All mutation routes authenticate, resolve the active workspace server-side,
check permissions, validate state, and use conditional updates. The live
Supabase database was verified with RLS enabled on every public table.

## 17. Testing

Unit coverage includes overdue computation and queue priority, plus the
existing permission, state-machine, API, and regression suites. Integration
coverage continues to use the repository PGlite harness; live schema and RLS
were separately verified with read-only metadata queries after migration.

## 18. Known limitations

- Deadline approaching/overdue notifications are computed in the inbox but are
  not emitted by a new scheduler.
- Comment editing and deletion are intentionally deferred.
- Reviewer labels use the existing workspace member display-name source; no
  new identity directory is introduced.
