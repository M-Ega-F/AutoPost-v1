# Phase 12C — Secure team invitations and member management

## Scope

This phase implements the updated master-plan scope for inviting people to a
workspace and managing existing members. It is documented here so the
master-plan file remains editable without becoming an implementation log.

The existing roles remain `owner`, `admin`, `editor`, and `viewer`. Invitation
and member-management mutations can target only `admin`, `editor`, or `viewer`;
the owner is never selectable, downgraded, or removed by these endpoints.

## Authorization policy

The canonical policy remains in `src/lib/auth/permissions.ts` and is checked
again in `src/lib/domain/invitations.ts`. The new permissions are:

| Permission | Owner | Admin | Editor | Viewer |
| --- | --- | --- | --- | --- |
| `members:view` | Yes | Yes | Yes | Yes |
| `members:invite` | Yes | Yes, editor/viewer only | No | No |
| `members:update` | Yes | Yes, editor/viewer only | No | No |
| `members:remove` | Yes | Yes, editor/viewer only | No | No |

The explicit `canManageRole` rule protects owners and prevents admins from
managing other admins. A role or workspace ID supplied by the browser is never
trusted for authorization; every mutation resolves the active workspace and
membership on the server.

## Invitation lifecycle

`workspace_invitations` stores the normalized target email, role, SHA-256 token
hash, status, expiry, creator, and lifecycle timestamps. It has a unique
partial index for one pending invitation per workspace and normalized email,
plus a database check that rejects the owner role.

The raw token is generated with 32 random bytes, returned only once in the
authorized create/resend response as a link, and never stored or logged.
Invitations expire after seven days. Creating an invitation for an email that
already has a pending invitation replaces that row's token, role, creator, and
expiry, invalidating the old link. Resend performs the same token rotation.
Cancelled and accepted invitations cannot be resent; a new create request is
required after cancellation.

Preview is intentionally public but limited to workspace name, invited role,
and status. It never reveals the target email, creator, internal IDs, or token
hash. Acceptance is an explicit button, requires an authenticated Supabase
user whose email matches the invitation, and runs in one database transaction:
the pending row is claimed, membership is inserted under the existing
workspace/user uniqueness constraint, the invitation is marked accepted, and
the active workspace pointer is updated. A second request or concurrent
replay fails safely.

## API and UI

The internal API is documented in `docs/API-INTERNAL.md`. The new routes are:

- `GET /api/workspace/members`
- `PATCH` and `DELETE` `/api/workspace/members/:id`
- `GET` and `POST` `/api/workspace/invitations`
- `DELETE /api/workspace/invitations/:id`
- `POST /api/workspace/invitations/:id/resend`
- `GET /api/invitations/:token`
- `POST /api/invitations/:token/accept`

The authenticated `/team` page shows safe member summaries to every workspace
member. Invite, resend, cancel, role-change, and remove controls are only
rendered when the active role has the matching permission. Existing pending
invitation rows do not show a copy button because the plaintext token cannot
be recovered; create/resend displays the fresh link once and offers copy.
Because no mail provider is configured, the UI says “Invitation link created”
and never claims that an email was sent.

An unauthenticated visitor to `/invite/:token` is redirected to login with the
safe invitation path as `next`. The page never auto-accepts. Expired,
cancelled, accepted, invalid, and wrong-email states are rendered explicitly.

## Database and RLS

`drizzle/0008_fearless_mantis.sql` creates the invitation enum/table, indexes,
foreign keys, and owner-role check. `supabase/migrations/0009_team_invitations_rls.sql`
enables and forces RLS and revokes `anon`/`authenticated` table access because
the invitation table contains sensitive email and token-hash material. The
server domain connection performs the filtered authorization checks. Existing
membership-based resource RLS remains in force; member lists are returned by
the server endpoint rather than exposing all membership rows through the Data
API.

Applied migrations were not edited. `npm run db:generate` was run after the
schema change. `npm run db:migrate` must still be run against the configured
Supabase database before deployment; local integration tests use the generated
DDL in the PGlite harness.

## Security and validation coverage

Covered by the domain integration tests:

- case-insensitive email normalization and seven-day expiry;
- owner-role rejection and admin role-escalation prevention;
- one pending invitation per workspace/email with old-token invalidation;
- wrong-email rejection, acceptance, active-workspace selection, and replay;
- expired invitation handling, resend token rotation, cancellation, and
  accepted/cancelled resend rejection;
- owner/self protection and member role update/removal;
- no plaintext token in stored invitation data;
- active-workspace and membership authorization through the existing authz
  context.

Out of scope remains email delivery, passwordless authentication, bulk import,
open join links, approval workflows, audit/activity feeds, custom roles,
custom permissions, ownership transfer, workspace deletion, and leave-workspace
flows.
