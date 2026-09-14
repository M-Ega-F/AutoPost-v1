# Phase 16A — Content Approval Workflow

## Scope

Approval is an optional, workspace-scoped gate before publishing. Existing
workspaces default to disabled and existing posts are backfilled as
`not_required`, preserving the current publish and schedule lifecycle.

## Workflow

1. A new draft in an approval-enabled workspace starts as `draft`.
2. The creator submits the same `postId` for review.
3. An owner or admin approves it, or requests changes with a required comment.
4. A creator can resubmit after changes.
5. An edit to an approved draft invalidates approval and returns it to `draft`.

Valid transitions are enforced in the domain layer and repeated by the
publishing worker. Duplicate submit and approve requests are idempotent and do
not create duplicate history, notifications, or webhook deliveries.

## Data and security

`posts` stores the current approval state and safe reviewer timestamps/IDs.
`post_review_events` is append-only application audit history and is protected
by workspace-membership RLS in `supabase/migrations/0013_content_approval_rls.sql`.
The application database connection remains privileged; server authorization is
still mandatory for every route.

Review webhooks use the existing delivery queue and safe envelope allowlist.
Review notifications are routed to workspace reviewers or the post creator as
appropriate, with a per-event dedupe key.

## API and UI

The internal API is documented in `docs/API-INTERNAL.md`. The reusable review
components live under `src/components/posts/review/` and are shown on draft and
post detail surfaces. Workspace settings expose the approval toggle.

## Validation

The state-machine unit test and integration coverage exercise the submit,
request-changes, resubmit, approval, self-approval rejection, idempotency, and
workspace role paths. Run the project validation commands from the Phase 16A
master-plan checklist before deployment.
