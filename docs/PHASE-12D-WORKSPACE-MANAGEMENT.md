# Phase 12D — Workspace Management

Status: implemented.

This document records the implementation details for the editable Workspace
Management phase. The master plan remains the product plan and stays editable;
future changes should be recorded here or in a new phase document.

## Scope

The active workspace can now be viewed and managed at
/workspace/settings. The page supports workspace profile metadata, a compact
overview, workspace creation, team access, ownership transfer, leaving, and
owner-confirmed deletion.

Workspace metadata is:

- name: trimmed, 2–80 characters.
- slug: lowercase URL-safe text, unique, with automatic collision suffixes
  during creation.
- description: optional, trimmed, maximum 500 characters.
- avatarUrl: optional HTTPS URL. A dedicated storage-backed avatar pipeline is
  intentionally deferred.
- timezone: validated IANA timezone, defaulting to UTC.
- createdAt and updatedAt: server-managed timestamps.

## Domain behavior

src/lib/domain/workspaces.ts is the server-side boundary for lifecycle
operations. Workspace creation is transactional: the owner workspace row,
owner membership, and active-workspace preference are committed together.
Creation is authenticated and rate limited.

The active workspace is always resolved through membership. If a saved active
workspace was removed or is no longer accessible, the personal workspace is
selected and the preference is repaired. This prevents a stale client or
deleted workspace from becoming an authorization source.

Overview counts are scoped to the active workspace and include members, posts,
drafts, scheduled posts, and connected accounts. Existing user timezone
preferences continue to control post scheduling; workspace timezone is
available as workspace metadata and is used as the workspace default surface.

Ownership transfer is owner-only and requires an existing active member in the
same workspace. The old owner becomes admin, the target becomes owner, and the
workspace owner reference changes inside one transaction.

Non-owners can leave. Owners must transfer ownership first. Deletion is
owner-only and requires typing the exact workspace name. Deletion blocks while
posts or platform targets are processing. Posts are removed before social
accounts because the platform foreign key is restrictive. Queue jobs and
storage objects are cleaned after the short database transaction; failures are
logged without exposing storage keys or credentials.

## API

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| GET | /api/workspace | workspace:view | Active workspace metadata and overview counts. |
| PATCH | /api/workspace | workspace:update | Update metadata. |
| DELETE | /api/workspace | workspace:delete | Delete after exact-name confirmation and lifecycle checks. |
| GET | /api/workspaces | Session | List memberships and active workspace. |
| POST | /api/workspaces | Session | Create and activate a workspace. |
| POST | /api/workspace/transfer-ownership | workspace:transfer | Transfer ownership to an active member. |
| POST | /api/workspace/leave | workspace:leave | Leave the active workspace when not owner. |

All routes use the internal API error shape with status mappings for
unauthenticated, forbidden, validation, conflict, rate limit, and server
errors. Responses are no-store. Request bodies never supply the workspace
scope; the server resolves it from the authenticated session and active
membership.

## Database and RLS

The Drizzle schema adds workspace description, avatar URL, timezone, and a
slug-format check constraint. The generated migration is
drizzle/0009_brainy_jamie_braddock.sql; the follow-up migration
drizzle/0010_aberrant_sentry.sql changes the personal-owner uniqueness rule
to a partial unique index so an owner can create multiple shared workspaces.

supabase/migrations/0010_workspace_management_rls.sql keeps workspace
membership reads restricted and grants authenticated clients update access
only to safe metadata columns. owner_id is not update-granted. Lifecycle
mutations remain in the server domain layer, so direct client updates cannot
transfer ownership, remove members, or delete a workspace.

## UI

The app header workspace switcher shows the active workspace and role and
links to /workspace/settings. The sidebar includes Workspace separately from
personal application Settings. Existing Team management remains at /team and
is linked from the workspace page.

The settings page uses existing semantic design tokens and components. It does
not expose controls the active role cannot perform; server authorization still
remains authoritative for every mutation.

## Verification

Added integration coverage includes creation and slug collisions, metadata
validation and role authorization, atomic ownership transfer with one-owner
invariant, non-owner leave and active fallback, and processing-safe deletion.
Run the repository checks before release:

    npm run typecheck
    npm run lint
    npm test
    npm run test:integration
    npm run build
    npm run db:generate
    npm run db:migrate
    git diff --check
