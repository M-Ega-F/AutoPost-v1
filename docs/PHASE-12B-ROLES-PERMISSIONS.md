# Phase 12B — Workspace Roles & Permission System

## Scope

Phase 12B adds reusable authorization for the existing workspace model. It does not add invitations, member onboarding, role-management UI, approvals, billing, custom roles, or per-user custom permissions.

## Roles

| Role | Capability summary |
| --- | --- |
| Owner | Full workspace, member, account, content, publishing, template, media, analytics, and settings permissions. |
| Admin | Full operational access to posts, publishing, accounts, templates, media, and analytics; no workspace ownership or member-management permissions. |
| Editor | Can view and create/update/delete drafts, create/update/use templates, create media, duplicate posts, and view accounts/analytics; cannot publish, schedule, cancel, retry, or manage accounts. |
| Viewer | Read-only access to dashboard, posts, history, calendar, templates, media, analytics, and accounts. |

The canonical definitions live in `src/lib/auth/permissions.ts`. The module exposes typed roles and permissions plus `hasPermission`, `hasAnyPermission`, and `hasAllPermissions`.

## Authorization architecture

`src/lib/auth/authorization.ts` resolves the authenticated user's membership from the selected workspace on every authorization check. The client never supplies a trusted role or permission. `requireWorkspacePermission` returns a server-side authorization context or throws a safe `forbidden` error.

Mutation enforcement is present in the domain layer so direct calls cannot bypass route/UI checks:

- posts: create, publish, schedule, cancel, retry, delete, and duplicate;
- drafts: create, update, and delete;
- accounts: connect, disconnect, and OAuth start/callback;
- templates: create, update, delete, and use;
- media: create and delete;
- analytics refresh;
- workspace creation.

Read queries remain membership- and workspace-scoped. Worker execution does not evaluate workspace roles; it operates on already-authorized queued jobs and still verifies resource workspace ownership.

## UI behavior

`WorkspacePermissionProvider` exposes the active workspace role to client components. Connect, disconnect, analytics refresh, retry, cancel, template mutations, reuse actions, and other restricted controls are hidden or disabled for roles without the required permission. UI checks are convenience only; domain authorization remains authoritative.

## Database and RLS

`workspace_members.role` now supports `owner`, `admin`, `editor`, and `viewer`. Existing owner memberships remain owners. Migrations `drizzle/0007_shocking_tyger_tiger.sql` and `supabase/migrations/0008_workspace_roles.sql` add the enum values. Existing membership-based RLS remains the resource isolation boundary; application permissions are intentionally not duplicated as a large RLS policy matrix.

The owner invariant remains: a workspace must always retain at least one owner. Phase 12B does not expose role-mutation or member-removal endpoints, and the Supabase migration revokes direct authenticated membership update/delete access, so no new mutation path can violate that invariant.

## Security checks

- Role is read from the server-side membership row, never trusted from request JSON or client state.
- Cross-workspace resources continue to be filtered by both user and active workspace membership.
- OAuth callback authorization is checked again before encrypted tokens are persisted.
- Existing rate limits and token/secret redaction are preserved.
- Worker paths do not receive a client-controlled role and continue their resource checks.

## Validation

Added unit coverage for the role matrix and integration coverage proving that the active role is recalculated after membership changes. Run the repository validation suite with `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, and `git diff --check`.

Live `npm run db:migrate` still depends on the configured Supabase connection. The generated migration is also exercised by the PGlite integration harness; a live connection failure should be reported separately from code/test validation.
