# Phase 15 — Webhook & External Integration System

Phase 15 adds outbound, workspace-scoped webhooks for internal integrations.
It does not add a public developer API, API keys, OAuth applications, inbound
automation or an app marketplace.

## Delivery flow

```text
domain event → dispatcher → delivery row → BullMQ webhook queue → dedicated worker → HTTPS POST
```

The dispatcher stores a versioned, explicit event envelope and places only
`webhookId` and `deliveryId` in Redis. The worker loads the encrypted secret
and payload from the database, signs the exact serialized body and sends it
asynchronously. Publishing never waits for an external endpoint.

Delivery is at-least-once. Consumers must deduplicate using the stable event
ID in the envelope and `X-AutoPost-Event-Id`. Exactly-once delivery is not
claimed.

## Events and envelope

Supported events are defined centrally in `src/lib/webhooks/types.ts`, including
post lifecycle, account lifecycle, workspace membership/invitation changes,
analytics updates and `webhook.test`.

Every body has this shape:

```json
{
  "id": "event-uuid",
  "type": "post.published",
  "version": "2026-09-01",
  "createdAt": "2026-09-14T00:00:00.000Z",
  "workspace": { "id": "workspace-uuid", "name": "Example" },
  "data": { "postId": "post-uuid", "status": "published" }
}
```

Payloads are explicit DTOs. They never contain access tokens, credentials,
private storage URLs, provider responses, stack traces or queue metadata.

## Signing and consumer verification

Headers:

```text
X-AutoPost-Event-Id: event-uuid
X-AutoPost-Event: post.published
X-AutoPost-Version: 2026-09-01
X-AutoPost-Timestamp: 1726272000
X-AutoPost-Signature: v1=<hex-hmac>
```

The signature is HMAC-SHA256 over the exact raw request body, prefixed with the
timestamp and a dot:

```text
HMAC_SHA256(secret, timestamp + "." + rawBody)
```

Consumers should reject timestamps outside a short replay window, compare the
signature in constant time, and deduplicate the event ID. A retry can use a
new timestamp while retaining the same event ID.

## Security

- Secrets are generated with cryptographically secure random bytes and stored
  encrypted at rest. They are returned only once during create or rotate.
- URLs must be HTTPS in production. Local HTTP is allowed only in development.
- `localhost`, loopback, private/link-local/reserved IP ranges and cloud
  metadata hostnames are rejected. DNS results are checked before each request.
- Redirects are disabled.
- The current fetch guard cannot fully prevent a DNS answer changing between
  validation and the platform's socket resolution; this limitation is kept in
  the deployment notes and should be addressed with a pinned custom resolver
  before allowing untrusted destinations at scale.

## Retry and reliability

2xx responses are delivered. Network errors, timeouts, 429 and 5xx responses
retry up to five total attempts with centralized delays of 1 minute, 5 minutes,
15 minutes and 1 hour. `Retry-After` is honored and capped at one hour.
400, 401, 403, 404, 410, 422 and malformed destinations are final failures.
After ten consecutive final failures the endpoint is disabled and the owner is
notified. Retry notifications are deduplicated to avoid notification spam.

`npm run webhook-worker` starts the dedicated worker. Its heartbeat uses the
same reliability helper as publishing and analytics. The reliability snapshot
also reports the webhook queue's waiting, active, completed, failed and delayed
counts.

## API and permissions

All routes use the existing authenticated session and server-side workspace
authorization. The permission set is `webhooks:view`, `webhooks:create`,
`webhooks:update`, `webhooks:delete` and `webhooks:test`. Owners and admins can
manage endpoints; editors/viewers can view only. No endpoint returns an
encrypted secret, signature, raw payload or internal worker error.

The UI lives at `/integrations` and supports create, enable/disable, test,
rotate secret, delete and delivery history. Create and rotate show the secret
once in memory so it can be copied into the receiving service.

## Verification example

```ts
const rawBody = await request.text();
const timestamp = request.headers.get("X-AutoPost-Timestamp")!;
const received = request.headers.get("X-AutoPost-Signature")!;
const expected = `v1=${createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`, "utf8")
  .digest("hex")}`;
// Check timestamp freshness, then compare expected and received in constant time.
```

Retention is intentionally conservative in this phase: delivery history is
preserved and no automatic cleanup job is enabled. A future phase can add a
workspace-configurable retention policy after confirming audit requirements.
