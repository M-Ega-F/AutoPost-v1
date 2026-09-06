# Multi-Social Auto Poster MVP — Implementation Specification

Use this document as the **source of truth** for building the **Multi-Social Auto Poster MVP** application.

Build the application using:

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Uptash Reddis
- BullMQ
- Meta Graph API
- TikTok Content Posting API

## Product Goal

> **Upload content once → select multiple platforms → publish now or schedule → the system processes everything automatically → the user sees the results.**

Priority:

> **Simple → Fast → Reliable → Time-saving.**

Implement **only the MVP scope** described in this document.

---

# Architecture Requirements

Use a **provider architecture** for social integrations.

Minimum abstraction:

```text
SocialProvider

```

With separate providers for:

- Meta / Instagram
- Meta / Facebook Page
- TikTok

The core posting system **must not depend directly on API-specific implementations**.

### Access Tokens &amp; Refresh Tokens

Access tokens and refresh tokens must:

- Exist only on the backend/worker
- Be encrypted at rest
- Never be sent to the frontend
- Never be included in BullMQ job payloads
- Never appear in logs

BullMQ jobs must contain **only the required resource IDs**.

---

# Database

Implement the following tables:

- `social_accounts`
- `posts`
- `post_media`
- `post_platforms`
- `post_executions`

Requirements:

- Foreign keys
- Indexes
- Unique constraints
- Supabase RLS
- Ownership validation

---

# Worker

Publishing must **always be performed by a background worker**.

Do not execute social API publishing synchronously inside an HTTP request.

The worker must support:

- Idempotency
- Failure isolation
- Retry policy
- Exponential backoff
- Stalled job recovery
- Cancellation checks
- Sanitized logging

If one platform fails, other platforms must continue processing.

**Retry only the failed execution**, not the entire post.

---

# Media

Use **persistent object storage**.

Do not rely on temporary media URLs for scheduled posts.

Support:

- File upload
- HTTPS media URL

Pasted URLs must have:

- SSRF protection
- Server-side validation

---

# Scheduling

Use:

```text
scheduled_at = UTC
timezone = IANA timezone

```

Use **BullMQ delayed jobs** for scheduling.

The database remains the **source of truth**.

Scheduled posts must be cancellable.

Before publishing, the worker must check the **latest database state** to ensure the post is still valid and has not been cancelled.

---

# Statuses

## Post Status

```text
draft
scheduled
processing
published
partial_failure
failed
cancelled

```

## Platform Status

```text
pending
processing
success
failed

```

## Execution

`post_executions` must store **every execution attempt**.

---

# UX

The UI must be **extremely simple**.

Primary flow:

```text
Create Post
    ↓
Upload
    ↓
Caption
    ↓
Select Platforms
    ↓
Publish Now / Schedule

```

Do not add features outside the MVP without a clear reason.

Do **not** build:

- Analytics
- Team management
- Bulk posting
- AI features
- Complex content calendar
- Inbox
- Comments
- Other social-management features outside the MVP scope

---

# Testing

Before considering the application complete, test at minimum:

1. Login
2. Connect social account
3. Create post
4. Upload media
5. Paste media URL
6. Publish Now
7. Schedule
8. Worker execution
9. Multi-platform publishing
10. Partial failure
11. Retry failed platform
12. Token expiration
13. Account reconnect
14. Cancel scheduled post
15. Duplicate execution prevention
16. Worker crash/recovery
17. RLS/ownership
18. Timezone conversion

---

# Critical Scenario

Example:

```text
Instagram → FAIL
Facebook  → SUCCESS
TikTok    → SUCCESS

```

Expected result:

```text
Post → partial_failure

```

Platform statuses:

```text
Instagram → failed
Facebook  → success
TikTok    → success

```

When the user performs a retry:

```text
Retry → Instagram only

```

Only the failed Instagram execution must be processed again.

**Do not reprocess Facebook or TikTok.**

---

# Asynchronous API Processing

Do **not** assume that an API response with HTTP `200` always means the post has been successfully published.

Providers must properly handle **asynchronous processing** when required by the platform API.

For example, if a platform returns a processing/container ID instead of an immediately published post, the provider/worker must handle the required follow-up status checking before marking the execution as successful.

---

# Production Quality

Implement a **production-quality MVP**, but **do not over-engineer** beyond the requirements defined in this document.

Keep the architecture:

> **Simple → Fast → Reliable → Time-saving.**

