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
found, `422` validation failure, `429` rate limited, `405` unsupported method,
and `500` unexpected server error. Database details, stack traces, provider
tokens, OAuth secrets, and encrypted values are not returned.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/posts?scope=history\|scheduled\|all&search=...` | Session | List the authenticated user's posts. Defaults to history. |
| POST | `/api/posts` | Session | Create a post. `schedule: null` publishes now; a schedule object queues a scheduled post. |
| GET | `/api/posts/:id` | Session | Read one post, media metadata, platform targets, and safe execution summaries. |
| POST | `/api/posts/:id/cancel` | Session | Cancel a scheduled post or processing post whose workers have not claimed a target. |
| POST | `/api/posts/:id/retry` | Session | Retry one failed platform target using `postPlatformId` in the body. |
| GET | `/api/accounts` | Session | List safe connected-account summaries. |
| GET | `/api/accounts/:id` | Session | Read one safe connected-account summary. |
| DELETE | `/api/accounts/:id` | Session | Disconnect an owned account and clean up pending jobs through existing logic. |
| GET | `/api/dashboard` | Session | Return the existing dashboard service data. |

`PATCH /api/posts/:id`, `DELETE /api/posts/:id`, and publish/schedule routes for
an already-created post are intentionally not implemented. The current
architecture has no safe edit/delete-existing-post service, and publishing or
scheduling is performed as part of `POST /api/posts`; adding parallel state
transitions would create a duplicate pipeline.

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
encryption data.

Media selection remains browser-local until the existing publish flow persists
the media; the API foundation does not add a Storage request to preview.
