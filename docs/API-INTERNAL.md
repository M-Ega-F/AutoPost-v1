# Internal Application API

This API is an internal application API for the authenticated AutoPost web
application. It is not yet a public developer API.

## Authentication

Requests use the existing Supabase application session cookie. There is no
API-key or bearer-token authentication in this phase. The server resolves the
user from the session; request bodies and query strings are never trusted for
ownership.

Every successful response is `Cache-Control: no-store`.

## Error format

Errors use one safe shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request."
  }
}
```

Known status mappings are `401` unauthenticated, `403` forbidden, `404` not
found, `410` expired/gone, `422` validation failure, `429` rate limited, `405` unsupported method,
and `500` unexpected server error. Database details, stack traces, provider
tokens, OAuth secrets, and encrypted values are not returned.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/posts?scope=history\|scheduled\|all&search=...` | Session | List the authenticated user's posts. Defaults to history. History supports server-side pagination and filters. |
| POST | `/api/posts` | Session | Create a post. `schedule: null` publishes now; a schedule object queues a scheduled post. |
| GET | `/api/posts/:id` | Session | Read one post, media metadata, platform targets, and safe execution summaries. |
| POST | `/api/posts/:id/duplicate` | Session | Create a new clean draft from reusable post content. No schedule, queue, execution or provider state is copied. |
| POST | `/api/posts/:id/save-as-template` | Session | Save reusable caption, media reference and valid platform/account preferences as a separate template. |
| POST | `/api/posts/:id/cancel` | Session | Cancel a scheduled post or processing post whose workers have not claimed a target. |
| POST | `/api/posts/:id/retry` | Session | Retry one failed platform target using `postPlatformId` in the body. |
| GET | `/api/accounts` | Session | List every owned account with safe connection health, token expiry date, publish usage, and platform capabilities. Credential fields are never returned. |
| GET | `/api/accounts/:id` | Session | Read one owned account's safe health and usage summary. |
| DELETE | `/api/accounts/:id` | Session | Disconnect an owned account; pending targets are failed safely, published history is preserved, and active processing blocks the action. |
| GET | `/api/dashboard` | Session | Return the existing dashboard service data. |
| GET | `/api/settings` | Session | Read the authenticated user's safe profile and posting preferences. Missing preferences are initialized once. |
| PATCH | `/api/settings` | Session | Update the authenticated user's display name, IANA timezone, or default schedule time. |
| GET, POST | `/api/templates` | Session | List owned templates or create a caption/platform template. |
| GET, PATCH, DELETE | `/api/templates/:id` | Session | Read, update or delete an owned template. |
| POST | `/api/templates/:id/use` | Session | Create a new clean draft from an owned template; the template is unchanged. |
| GET, POST | `/api/media` | Session | List owned media assets or upload a reusable image/video. Supports `page`, `pageSize`, `search`, and `type=image|video`. |
| GET, DELETE | `/api/media/:id` | Session | Read or delete one owned media asset. Delete returns `409` while content still references it. |
| GET | `/api/analytics` | Session | Read normalized performance overview. Supports `range=7d|30d|all` and an optional platform filter. |
| POST | `/api/analytics/refresh` | Session | Queue a safe analytics refresh for the user's published targets. Optional JSON body: `postId`, `platform`. |
| GET | `/api/posts/:id/analytics` | Session | Read the latest and historical analytics snapshots for an owned post. |
| GET | `/api/workspace/members` | Session + `members:view` | List safe member summaries for the active workspace. |
| PATCH, DELETE | `/api/workspace/members/:id` | Session + `members:update`/`members:remove` | Change a manageable member's role or remove them. Owner rows and self-mutations are protected. |
| GET, POST | `/api/workspace/invitations` | Session; POST + `members:invite` | List safe pending/expired invitations or create/replace one for the active workspace. |
| DELETE | `/api/workspace/invitations/:id` | Session + `members:invite` | Cancel a pending invitation. |
| POST | `/api/workspace/invitations/:id/resend` | Session + `members:invite` | Rotate the invitation token and expiry; returns the new link once. |
| GET | `/api/invitations/:token` | Public preview | Return only workspace name, invited role, and invitation status. Email, token hash, IDs, and creator are never returned. |
| POST | `/api/invitations/:token/accept` | Authenticated invited email | Atomically claim the invitation, create membership, and select the workspace. |
| GET | `/api/workspace` | Session + `workspace:view` | Read active workspace metadata and scoped overview counts. |
| PATCH | `/api/workspace` | Session + `workspace:update` | Update active workspace name, slug, description, avatar URL, or timezone. |
| DELETE | `/api/workspace` | Session + `workspace:delete` | Delete the active workspace after exact-name confirmation; processing content blocks deletion. |
| GET, POST | `/api/workspaces` | Session | List accessible workspaces or create and activate a new workspace. |
| POST | `/api/workspace/transfer-ownership` | Session + `workspace:transfer` | Transfer ownership to an existing active member; the old owner becomes admin. |
| POST | `/api/workspace/leave` | Session + `workspace:leave` | Leave the active workspace when the caller is not its owner. |
| GET | `/api/workspace/reliability` | Session + `workspace:view` | Return live Redis, publishing-service, queue activity, backlog, and workspace-scoped failed/stuck inspection. |
| GET, POST | `/api/webhooks` | Session + `webhooks:view`/`webhooks:create` | List or create workspace-scoped outbound webhooks. Create returns the generated secret once. |
| GET, PATCH, DELETE | `/api/webhooks/:id` | Session + webhook permission | Read, update, or soft-delete a webhook. Secrets are never included. |
| POST | `/api/webhooks/:id/test` | Session + `webhooks:test` | Enqueue a `webhook.test` delivery through the dedicated worker. |
| POST | `/api/webhooks/:id/rotate-secret` | Session + `webhooks:update` | Replace the encrypted signing secret and return the new value once. |
| POST | `/api/webhooks/:id/enable` or `/disable` | Session + `webhooks:update` | Enable or disable an endpoint. |
| GET | `/api/webhooks/:id/deliveries` | Session + `webhooks:view` | List safe delivery status/history without payload bodies. |
| GET | `/api/webhooks/:id/deliveries/:deliveryId` | Session + `webhooks:view` | Read one safe delivery record. |

Invitation creation/resend responses include `invitationUrl` because no email
provider is configured yet. The raw token is never stored or logged and is
returned only as part of that one authorized response; list/preview responses
never include it. Invitation acceptance requires the signed-in user's email to
match the normalized invitation email.

`PATCH /api/posts/:id`, `DELETE /api/posts/:id`, and publish/schedule routes for
an already-created post are intentionally not implemented. The current
architecture has no safe edit/delete-existing-post service, and publishing or
scheduling is performed as part of `POST /api/posts`; adding parallel state
transitions would create a duplicate pipeline.

Workspace lifecycle requests resolve the active workspace from the signed-in
session and membership. Creation commits the workspace, owner membership, and
active preference together. Ownership transfer, leave, and deletion are
server-domain transactions; workspace deletion also removes dependent posts
before restrictive social-account references and performs queue/storage cleanup
after commit.

## Create request example

```json
{
  "caption": "Hello from AutoPost",
  "media": {
    "kind": "upload",
    "storageKey": "user-id/file-id.mp4",
    "mediaType": "video",
    "mimeType": "video/mp4",
    "fileSize": 1200000,
    "width": 1080,
    "height": 1920,
    "duration": 12
  },
  "platforms": ["facebook"],
  "schedule": null
}
```

## Ownership and security

The service layer receives the authenticated user ID and delegates resource
ownership checks to the existing domain queries. Posts and account operations
cannot cross user boundaries. Inputs use the shared post validation schema;
create, retry, cancel, publish-now, and schedule actions reuse the existing
process-local rate limiter. Account DTOs never include access tokens, refresh
tokens, encrypted token values, provider secrets, passwords, or internal
encryption data. Template DTOs never expose storage keys; storage references
are resolved only on the server. Shared media is deleted only after neither a
post, draft, template, nor media library asset references it. Library responses
expose signed preview URLs, not storage keys. Composer reuse sends an asset ID
and resolves its storage key on the server.

## History query

`scope=history` accepts the following validated parameters:

```text
page=1&pageSize=20
status=draft|scheduled|processing|published|partial_failure|failed|cancelled
platform=instagram|facebook|tiktok|threads|linkedin|x
accountId=<owned account UUID>
from=YYYY-MM-DD&to=YYYY-MM-DD
search=<caption text>
sort=newest|oldest|scheduled|published
```

The response contains `posts` plus `pagination` metadata (`page`, `pageSize`,
`total`, and `totalPages`). Filtering, sorting, ownership checks, and
pagination happen in the service/domain query; the browser never loads the
complete post history to filter it locally.

The existing composer upload and URL flows remain browser-local until publish
or schedule. The Media Library upload flow persists a reusable asset immediately;
choosing one in the composer reuses that stored object without another upload.

## Settings

`GET /api/settings` and `PATCH /api/settings` use the session user as the only
ownership source. The response contains only `displayName`, `timezone`, and
`defaultScheduleTime`; credentials and provider data are never included.

Example PATCH body:

```json
{
  "displayName": "Ega",
  "timezone": "Asia/Jakarta",
  "defaultScheduleTime": "09:00"
}
```

`timezone` is validated as an IANA identifier. The setting supplies the default
timezone for Create Post, Calendar, History, Dashboard, and calendar API
requests. Scheduled posts retain their stored UTC instant when the preference
changes. `defaultScheduleTime` only pre-fills the existing schedule dialog; it
does not create a separate scheduling system.
### Notifications

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | /api/notifications?page=1&limit=20&unreadOnly=true&type=POST_FAILED | Session + notifications:view | List the signed-in recipient's notifications in the server-resolved active workspace, with pagination and unread count. |
| GET | /api/notifications/unread-count | Session + notifications:view | Return the unread count for the active workspace and recipient. |
| POST | /api/notifications/:id/read | Session + notifications:update | Idempotently mark one owned notification as read. |
| POST | /api/notifications/read-all | Session + notifications:update | Mark all owned notifications in the active workspace as read. |
| DELETE | /api/notifications/:id | Session + notifications:update | Delete one owned notification. |
| DELETE | /api/notifications/read | Session + notifications:update | Delete all read notifications in the active workspace. |

There is intentionally no notification-create endpoint. Notifications are
created by server-domain event integrations only. The table stores a
centralized type, priority, safe metadata, optional internal href, and an
unread-only dedupe key. Account reconnect alerts use that key to keep one
active unread alert per account/event.

Notification reads and mutations resolve the active workspace from the signed-in
session and membership on the server; a frontend workspaceId is never
accepted. RLS grants authenticated clients SELECT/UPDATE/DELETE but no INSERT,
and policies require both recipient ownership and workspace membership. Server
domain authorization remains mandatory because the production database
connection is privileged.

### Reliability

`GET /api/workspace/reliability` is a no-store, read-only endpoint. Redis and
BullMQ are queried at request time; there is no cached claim that a post has
published. The response includes queue counts (`waiting`, `active`, `completed`,
`failed`, `delayed`, `paused`, and `prioritized`), backlog age, worker heartbeat
status, and a bounded list of failed or stuck items.

Failed/stuck inspection is workspace-scoped by resolving the job's
`postPlatformId` through the authenticated workspace's posts. Queue totals are
operational aggregates and do not include payloads, job IDs, stack traces,
captions, media URLs, tokens, or provider responses. Failure items expose only
platform, safe state, retry counts, age, and timestamp.

The worker writes a Redis hash at
`autopost:worker-heartbeat:<workerId>` and refreshes its TTL every 30 seconds;
the key expires after 120 seconds. Health inspection discovers these keys with
`SCAN`, then reads the bounded result set through a pipeline. A worker is
considered stale after 90 seconds without a heartbeat.

Queue and worker degradation is surfaced as an operational health state. The
existing publishing notification events remain the source of user-facing
publish failure and recovery notifications; health polling does not create a
notification on every request.

### Content approval

The active workspace setting `approvalRequired` controls whether new posts
must be approved. It defaults to `false`, so existing posts keep the legacy
`not_required` behavior. Owners and admins can update it through
`PATCH /api/workspace`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | /api/posts/:id/review | Session + posts:view | Return the current approval status and immutable review timeline for a post in the active workspace. |
| POST | /api/posts/:id/submit-review | Session + drafts:update | Move a creator-owned draft to `in_review`; repeat submission is idempotent. |
| POST | /api/posts/:id/approve | Session + content:review | Owner/admin approval from `in_review`; requester self-approval is rejected. |
| POST | /api/posts/:id/request-changes | Session + content:review | Move `in_review` to `changes_requested`; body requires a 1–1000 character `comment`. |

The state machine is `not_required`, `draft`, `in_review`,
`changes_requested`, and `approved`. Publishing accepts only `not_required` or
`approved`; the worker repeats this check before calling a social provider.
Review actions use conditional updates inside a transaction and return a
conflict when another action has already changed the state. Review webhook
events contain only IDs and status (`post.review_requested`, `post.approved`,
`post.changes_requested`, `post.resubmitted`, and
`post.approval_invalidated`); captions, media URLs, credentials, comments,
and provider errors are excluded.
