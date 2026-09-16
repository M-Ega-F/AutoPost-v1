# Phase 17A — Campaign Foundation

Status: implemented incrementally on top of the existing workspace, post,
approval, notification, webhook, and reliability domains.

This document records the implementation contract. The editable roadmap remains
in `.agents/plans/Master Plan.md`; future changes should be recorded here or in
another phase document rather than rewriting the roadmap.

## Scope delivered

- Workspace-scoped campaign CRUD with `draft`, `active`, `completed`, and
  `archived` lifecycle states.
- Optional campaign objective, description, start date, and end date.
- One-to-many organization relationship: a post belongs to zero or one campaign.
- Server-side paginated campaign list, search, status filter, and post counts.
- Campaign detail with post-status and approval-status aggregation.
- Attach/detach existing posts and campaign entry points for creating posts or
  drafts.
- Explicit lifecycle transition routes with permission and state validation.
- Campaign notifications and outbound webhook event types.
- RLS enabled and forced for `public.campaigns` with workspace-membership policy.
- Rate limits for campaign creation, updates, deletion, and post organization.

## Data model

`campaigns` contains the workspace foreign key, name, optional description,
objective, lifecycle status, optional UTC date range, creator, and timestamps.
The name is constrained to 1–160 characters and the date range cannot have an
end before its start.

`posts.campaign_id` is nullable and references `campaigns.id` with
`ON DELETE SET NULL`. Campaign deletion therefore preserves every post,
execution, approval record, analytics record, and history row while removing
only the organizational relationship.

The migration is `drizzle/0019_bumpy_blue_marvel.sql`. The matching RLS
migration is `supabase/migrations/0016_campaign_foundation_rls.sql`.

## Lifecycle

```text
draft     -> active | archived
active    -> completed | archived
completed -> archived
archived  -> active
```

There is no arbitrary status patch. Transition endpoints map to explicit target
states and the domain rejects invalid transitions. Archived campaigns cannot be
edited or receive posts; completed campaigns remain historical and cannot
receive posts. Restore moves an archived campaign back to active.

## Authorization

Campaign permissions are workspace-role permissions:

| Permission | Owner | Admin | Editor | Viewer |
| --- | --- | --- | --- | --- |
| `campaigns:view` | yes | yes | yes | yes |
| `campaigns:create` | yes | yes | yes | no |
| `campaigns:update` | yes | yes | own campaigns | no |
| `campaigns:archive` | yes | yes | no | no |
| `campaigns:delete` | yes | no | no | no |
| `campaigns:manage_posts` | yes | yes | yes | no |

The server derives the active workspace and user from the authenticated session.
Campaign and post IDs supplied by the browser are re-checked for workspace
membership, lifecycle eligibility, and ownership. Editors may update only
campaigns they created. Campaign queries do not trust a workspace ID from the
client.

RLS is defense in depth for authenticated database access: `campaigns` has
`FORCE ROW LEVEL SECURITY` and a policy requiring membership in the row's
workspace. The server domain authorization remains mandatory because the
application database connection is privileged.

## API contract

### `GET /api/campaigns`

Supported query parameters:

```text
page=1&pageSize=20
status=draft|active|completed|archived
search=<campaign name or description>
sort=updated|created|name
order=asc|desc
```

The response contains `campaigns` and `pagination` metadata. Post counts are
aggregated in SQL for the returned page; the browser never downloads all
campaigns to filter locally.

### `POST /api/campaigns`

```json
{
  "name": "September Product Launch",
  "description": "Coordinate launch content across owned channels.",
  "objective": "promotion",
  "startAt": "2026-09-01T00:00:00.000Z",
  "endAt": "2026-09-30T23:59:59.000Z"
}
```

### `PATCH /api/campaigns/:id`

Accepts one or more of `name`, `description`, `objective`, `startAt`, and
`endAt`. The body is strict and must contain at least one supported field.
Dates are parsed server-side and the existing date range is revalidated when
only one boundary changes.

### Lifecycle routes

```text
POST /api/campaigns/:id/activate
POST /api/campaigns/:id/complete
POST /api/campaigns/:id/archive
POST /api/campaigns/:id/restore
```

### Post organization routes

```text
GET    /api/campaigns/:id/posts?page=1&pageSize=20&status=scheduled&search=launch
POST   /api/campaigns/:id/posts       { "postId": "..." }
DELETE /api/campaigns/:id/posts/:postId
GET    /api/campaigns/:id/available-posts
```

Attach accepts only an existing post in the active workspace that is not
already assigned to another campaign. The post domain remains responsible for
publishing, scheduling, cancellation, retries, media, analytics, and approval
state changes.

## UI and integration

- `/campaigns` provides search, status filtering, server pagination, creation,
  status/date/objective cards, and server-provided post counts.
- `/campaigns/:id` provides lifecycle actions, edit form, progress cards, post
  list, approval summary, attach/detach controls, and links to the existing
  composer/history/review flows.
- Create Post and Create Draft links carry campaign context, but the server
  validates the campaign before persisting the relationship.
- Post detail links back to its campaign when assigned.
- Calendar events show the campaign name as context while retaining the normal
  post calendar behavior; posts without a campaign remain unchanged.
- Existing approval states are read-only campaign aggregates. Campaign actions
  cannot approve, reject, or bulk-update posts.

Notifications and webhooks use dedicated campaign event types for create,
update, activate, complete, archive, delete, attach, and detach. Payloads use
the existing safe metadata allowlist and never expose credentials or raw
provider data.

## Security and operational safeguards

- Authenticated session is the only ownership source.
- Campaign and post operations are workspace scoped in domain queries.
- SQL aggregation and pagination prevent unbounded campaign-list fetches.
- Rate limits: create 20/minute, update 60/minute, delete 10/minute, and
  attach/detach 120/minute per user.
- Deleting a campaign detaches posts in a transaction before deleting the
  campaign. No post is deleted as a side effect.
- Notification/webhook failures are not allowed to turn a committed campaign
  mutation into a client-visible data-loss path.

## Deliberate non-scope / follow-up

The foundation does not add many-to-many campaigns, campaign slugs, bulk
approval, campaign analytics, content ideas, templates, AI generation,
cross-campaign reuse, or campaign-specific publishing queues. Dashboard cards
and a campaign filter in History remain follow-up work; Calendar currently
provides context only. These are intentionally separate increments so the
existing post and approval state machines stay authoritative.

## Verification

The Phase 17A domain suite covers creation/listing, summary aggregation,
transitions, deletion preserving posts, workspace isolation, and attach
authorization. The full project validation should be rerun after subsequent
campaign changes:

```text
npm run db:generate   # only after schema changes
npm run db:migrate    # never use drizzle push
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
git diff --check
```
