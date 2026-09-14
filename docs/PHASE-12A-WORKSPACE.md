# Phase 12A — Workspace Foundation

Status: implemented in the working tree on 2026-09-14.

This file records implementation details separately from `Master Plan.md`, which remains the editable planning document.

## Delivered

- Added `workspaces` and `workspace_members` tables with owner membership, personal-workspace flag, unique slug, and indexed foreign keys.
- Added `active_workspace_id` to user-specific preferences; timezone and other preferences remain user-specific.
- Added workspace ownership to posts, social accounts, templates, and media assets.
- Added an idempotent personal-workspace provisioning flow and server-side active-workspace resolution with membership verification.
- Backfilled existing resource rows to each user's personal workspace, validated orphan rows, then applied `NOT NULL` and foreign-key constraints.
- Scoped the main posts, drafts, calendar, history, dashboard, accounts, templates, media, and analytics domain queries to the active workspace.
- Added `/api/workspaces` and `/api/workspaces/active` plus a header workspace switcher. The switcher is intentionally simple; no invitation or role-management UI was added.
- Carried workspace context inside signed OAuth state and verified membership again during callback before saving connected accounts.
- Added worker-side post/account workspace consistency validation. Queue payloads remain identifier-only.
- Added Supabase RLS migration `0007_workspace_foundation_rls.sql`, replacing the prior user-only policies with membership-based policies while preserving token-column protection for social accounts.

## Migration

Drizzle migration: `drizzle/0006_outgoing_quasimodo.sql`.

The migration order is: create workspace tables, add nullable resource columns, create personal workspaces and owner memberships, backfill resources, fail if any orphan remains, then enforce non-null and foreign-key constraints.

No previously applied migration was edited.

## Validation

- `npm run db:generate` — passed
- `npm run db:migrate` — migration execution was blocked by the configured Supabase Postgres connection in this sandbox; the command exited before returning a database error. The same Drizzle migration set was executed successfully by the PGlite integration harness.
- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm test` — 286 passed
- `npm run test:integration` — 99 passed
- `npm run build` — passed
- `git diff --check` — passed

Added integration coverage for idempotent personal provisioning, owner membership, active-workspace switching, and post isolation across workspaces.

## Notes

The current phase supports the `owner` role only. Additional workspace membership roles can be added later without moving user preferences or introducing a client-trusted workspace ID.
