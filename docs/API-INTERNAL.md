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
| GET, POST | `/api/campaigns` | Session; POST + `campaigns:create` | List workspace campaigns with server-side pagination/filtering or create a campaign. |
| GET, PATCH, DELETE | `/api/campaigns/:id` | Session + campaign permission | Read, update, or delete one workspace campaign. Deletion detaches posts and keeps post history. |
| POST | `/api/campaigns/:id/activate`, `/complete`, `/archive`, `/restore` | Session + campaign permission | Execute one explicit campaign lifecycle transition. |
| GET, POST | `/api/campaigns/:id/posts` | Session; POST + `campaigns:manage_posts` | List campaign posts or attach an existing post from the active workspace. |
| DELETE | `/api/campaigns/:id/posts/:postId` | Session + `campaigns:manage_posts` | Detach a post without deleting it. |
| GET | `/api/campaigns/:id/available-posts` | Session + `campaigns:view` | List unassigned posts eligible for the campaign. |
| GET | `/api/campaigns/:id/activity?page=1&pageSize=20` | Session + `campaigns:view` | Read the workspace-scoped, paginated campaign activity feed. |
| GET | `/api/campaigns/:id/intelligence?page=1&pageSize=20&sort=score` | Session + `campaigns:view` | Read deterministic campaign content intelligence, rankings, platform/format/timing signals, recommendations, opportunities, momentum, and data quality. |
| GET | `/api/campaigns/:id/intelligence?postId=<id>&postId=<id>` | Session + `campaigns:view` | Compare two or three posts that belong to the campaign; returns per-metric winners and safe derived values. |
| GET | `/api/campaigns/:id/intelligence/history?limit=20&cursor=<opaque>&from=<iso>&to=<iso>` | Session + `campaigns:view` | Read bounded, cursor-paginated intelligence snapshots for up to a 90-day range. |
| GET | `/api/campaigns/:id/intelligence/opportunities` | Session + `campaigns:view` | Read current safe optimization opportunities from the latest snapshot. |
| GET | `/api/campaigns/:id/intelligence/rankings?type=performance&limit=20&cursor=<opaque>&platform=instagram&format=video&trend=rising&momentum=improving&minimumConfidence=medium&underperforming=false` | Session + `campaigns:view` | Read persisted post intelligence summaries with database keyset ranking. The response contains only derived scores, classification, freshness and safe IDs. |
| POST | `/api/campaigns/:id/intelligence/posts/:postId/evaluate` | Session + `campaigns:update` | Re-evaluate one campaign post using the existing campaign intelligence evaluator and persist its derived summary. |
| POST | `/api/campaigns/:id/evaluate` | Session + `campaigns:update` | Queue one idempotent evaluation; JSON `{ "mode": "incremental" | "full" }` selects the evaluation mode. Editors may evaluate only campaigns they created. |

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

### Campaign planning and coordination

Campaign create/update accepts optional `customObjective`, `targetMetric`, and
positive integer `targetValue`. `objective=other` requires
`customObjective`; `targetMetric` and `targetValue` must be supplied together.
Campaign post and available-post list endpoints support `status`,
`approvalStatus`, `platform`, `from`, `to`, `search`, `page`, and `pageSize`.
The campaign detail response includes derived `progress`, `health`, `timeline`,
`approvalSummary`, `publishingSummary`, and analytics coverage summaries.

`GET /api/reviews` accepts `campaignId` and applies the campaign ownership
check server-side. `GET /api/calendar?campaignId=<campaignId>` applies the same
active-workspace check and returns only matching posts.

Campaign detail also includes current performance metrics, platform breakdown,
analytics coverage, optional historical trend deltas, deterministic insights,
goal milestones, health status, and actionable alerts. The scheduled campaign
evaluator uses a job payload containing only `campaignId`, `workspaceId`, and a
trigger.

`GET /api/campaigns/:id/intelligence` is campaign-scoped and uses only internal
analytics snapshots; it never calls a provider API during the request. Supported
parameters are `page` (1–500), `pageSize` (1–50), `sort=score|views|engagement|published`,
and repeated `postId` parameters for a two- or three-post comparison. The
response contains safe post identifiers, status, platform/format summaries,
derived metrics, scores, confidence, freshness, rankings, goal contribution,
insights, recommendations, opportunities, momentum, and actionable comparison winners. Captions, media
URLs, credentials, provider payloads, queue internals, and stack traces are not
returned. Requests are rate-limited by the existing process limiter.

History cursors are opaque, UUID/date validated, workspace-bound by the server,
and pages are limited to 50 items. History ranges are capped at 90 days. Full
manual evaluations have a stricter rate limit than incremental evaluations.
Evaluation queue payloads contain only campaign/workspace identifiers, mode,
reason, trigger, and numeric priority; analytics payloads and credentials never
enter BullMQ.

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

### Review Inbox and advanced approval management

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | /api/reviews?page=1&pageSize=20&status=in_review&reviewer=me&platform=instagram&sort=priority | Session + posts:view | Workspace-scoped, server-paginated review queue with summary counts. Supports `in_review`, `changes_requested`, and `approved`, reviewer/author UUIDs, platform, ISO date range, caption search, and `priority`, `oldest`, `newest`, `scheduled`, `deadline`, or `updated` sorting. |
| PATCH | /api/posts/:id/reviewer | Session + content:review | Assign, change, or clear an owner/admin reviewer. The post creator and members from another workspace are rejected. |
| PATCH | /api/posts/:id/review/deadline | Session + content:review | Set or clear a future UTC review deadline. |
| POST | /api/posts/:id/withdraw-review | Session + posts:update | Return an `in_review` post to `draft`; the conditional transition and audit event are transactional and repeat-safe. |
| GET | /api/posts/:id/review/comments | Session + posts:view | List workspace-scoped plain-text review comments. |
| POST | /api/posts/:id/review/comments | Session + content:comment | Add a validated 1–2000 character plain-text comment while a post is in review or has changes requested. |

Review Inbox filtering, sorting, pagination, summary counts, reviewer
eligibility, and workspace isolation happen server-side. Queue priority is
overdue, deadline soon, scheduled soon, then waiting time. Deadline overdue is
computed from UTC timestamps and is only true for `in_review` posts. Deadline
approaching/overdue notifications are handled by the server-side BullMQ
`review-automation` queue and its idempotent five-minute Job Scheduler. Stale
jobs skip when a review is completed, withdrawn, reassigned, or its deadline
changes.

Advanced review events add reviewer assignment, deadline changes, comments, and
withdrawal to the existing timeline. Webhooks are emitted through the Phase 15
delivery pipeline as `post.review_withdrawn`, `post.reviewer_assigned`,
`post.reviewer_changed`, `post.reviewer_unassigned`,
`post.review_deadline_changed`, and `post.review_comment_added`. Payloads use
the existing safe envelope and never contain captions, media URLs, tokens,
credentials, secrets, or stack traces.

Phase 16C also adds `PATCH` and `DELETE` comment mutation endpoints plus
`POST /api/posts/:id/review/comments/:commentId/resolve` for root discussion
resolution/reopen. Replies are capped to one level, comments are soft-deleted,
and mentions are stored as validated workspace member IDs. Comment mutations
use the granular `content:comments:*` permissions and existing centralized
rate limit.

### Campaign optimization actions and experimentation

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET/POST | /api/campaigns/:id/optimization-actions | Session + campaigns:view/update | List or create a workspace-scoped optimization action. |
| GET | /api/campaigns/:id/optimization-actions/:actionId | Session + campaigns:view | Read one action after campaign and workspace ownership checks. |
| POST | /api/campaigns/:id/optimization-actions/:actionId/:action | Session + campaigns:update | Apply `accept`, `start`, `complete`, `dismiss`, `cancel`, `fail`, or `retry` through the guarded state machine. |
| GET/POST | /api/campaigns/:id/experiments | Session + campaigns:view/update | List or create a control-and-variant experiment. |
| GET | /api/campaigns/:id/experiments/:experimentId | Session + campaigns:view | Read an experiment with up to three variants and its latest result. |
| POST | /api/campaigns/:id/experiments/:experimentId/:action | Session + campaigns:update | Apply `plan`, `start`, `pause`, `resume`, `complete`, or `cancel`. |
| GET/POST | /api/campaigns/:id/experiments/:experimentId/variants | Session + campaigns:view/update | List or add a campaign post variant. |
| DELETE | /api/campaigns/:id/experiments/:experimentId/variants/:variantId | Session + campaigns:update | Remove a variant while the experiment is draft or planned. |
| GET/POST | /api/campaigns/:id/experiments/:experimentId/results | Session + campaigns:view/update | Read or evaluate a deduplicated result from post intelligence summaries. |
| POST | /api/campaigns/:id/experiments/:experimentId/evaluate | Session + campaigns:update | Rate-limited alias for manual evaluation. |
| GET | /api/campaigns/:id/experiments/:experimentId/statistics | Session + campaigns:view | Read the latest statistical snapshot: sufficiency, uplift, interval, MDE, power, duration, winner confidence, data quality, and recommendation. |
| GET | /api/campaigns/:id/experiments/:experimentId/history | Session + campaigns:view | Paginated statistical evaluation history (`page`, `pageSize`). |
| GET | /api/campaigns/:id/experiments/learning | Session + campaigns:view | Paginated workspace-scoped historical experiment learning and aggregate evidence summary. |

The Phase 17G API never accepts a frontend workspace ID. Server authorization
resolves the active workspace and verifies campaign, control-post, variant,
and action ownership. Experiment results contain only derived scores, sample
counts, confidence, status, winner ID, and fingerprints; captions, media,
provider responses, and credentials are excluded. Running experiments are also
evaluated by the existing campaign automation worker after fresh summaries
arrive. Statistical snapshots use algorithm version `17h-v1`, remain
idempotent by input fingerprint, and preserve the last successful snapshot if
a worker evaluation fails. Approval, scheduling, publishing, retry, and
cancellation remain post-level workflows.
