# Phase 13 — Persistent Notification System

## Delivered

- Added workspace-scoped notifications with recipient ownership, actor,
  priority, safe metadata, internal href, read state, timestamps, and
  unread-only deduplication.
- Added the centralized notification type catalog for post, account,
  invitation, membership, ownership, and system events.
- Added the server-only notification domain service for create/list/count,
  mark-read, mark-all-read, delete-one, and delete-read operations.
- Added recipient policy helpers. Post events target the post creator, account
  events target the account owner, membership events target the workspace
  owner, and invitations target an existing invited user only.
- Added event hooks for published, failed, partial, scheduled, cancelled,
  expired/reconnect-required, invitation, member, and ownership-transfer
  flows. Notification failures are logged and never fail the source operation.
- Added internal API routes, strict action rate limits, a header notification
  bell, unread badge, recent dropdown, full history page, filters, pagination,
  mark-all, and delete actions.
- Added Drizzle migration 0011 plus the generated follow-up 0012, and
  Supabase RLS migration 0011. Client INSERT is revoked; reads/updates/deletes
  require recipient ownership and workspace membership.

## Security rules

The active workspace is resolved from the authenticated session and membership
on the server. The API never trusts a frontend workspace ID. Notification
creation has no public route. Internal links must begin with one slash, and
metadata is size-limited and rejects sensitive key names.

## Validation

- npm run db:generate passed.
- npm run db:migrate passed against the configured live database.
- Unit tests: existing suite passed after updating the permission count.
- Integration tests: 111 passed.
- Remaining validation: rerun lint, typecheck, unit tests, integration tests,
  build, and git diff --check after the final small cleanup.

## Known limitation

The current phase deliberately uses initial fetch/manual refresh and does not
add realtime subscriptions. Invitation notifications are persisted only for
existing invited auth users; unregistered email addresses continue to use the
existing invitation-link flow.
