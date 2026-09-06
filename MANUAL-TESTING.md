# AutoPost — Manual Testing Runbook

This runbook covers the 18 manual scenarios from `Prompt.md` section "Testing" (numbering is identical), plus the
environment setup, the simulation recipes for the scenarios that cannot happen naturally yet, a troubleshooting
table, and a sign-off sheet.

Scope note: the automated suites prove the domain, worker and provider logic
(`npm test` — 202 unit tests, `npm run test:integration` — 70 integration tests against Postgres in WASM).
They do **not** prove that a real Supabase project, a real Meta app and a real TikTok app are wired up
correctly. That is what this runbook is for.

Do not run database migrations from this runbook. If tables are missing, the schema has not been applied yet —
see [1.3](#13-database-schema-read-only-check).

---

## 1. Before you start

### 1.1 Toolchain

| Prerequisite | How to verify | Expected |
| --- | --- | --- |
| Node 20.9 or newer | `node -v` | `v20.9.x` or higher (Next.js 16 requires it) |
| Dependencies installed | `node -e "console.log(require('next/package.json').version)"` | `16.x` |
| Repo is clean and green | `npm run typecheck && npm run lint && npm test && npm run test:integration` | all four exit `0` |

### 1.2 `.env.local`

`src/lib/env.ts` is the source of truth for variable names and fallbacks. `scripts/seed-user.ts` and
`src/workers/publish-worker.ts` both load `.env.local` via `dotenv`.

Verify which keys are present **without printing values**:

```powershell
Get-Content .env.local | Where-Object { $_ -match '^\s*[A-Z0-9_]+\s*=' } |
  ForEach-Object { ($_ -split '=', 2)[0].Trim() } | Sort-Object
```

macOS / Linux:

```bash
cut -d= -f1 .env.local | grep -v '^\s*$' | sort
```

| Group | Variable | Read by | Required | Notes |
| --- | --- | --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` (fallback `SUPABASE_URL`) | `serverConfig.supabaseUrl` | yes | |
| Supabase | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback `SUPABASE_ANON_KEY`) | `serverConfig.supabaseAnonKey`, `src/proxy.ts`, `src/lib/auth/client.ts` | yes | |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` (fallback `SERVICE_ROLE_KEY`) | `serverConfig.supabaseServiceRoleKey`, storage, seeding | yes | never sent to the browser |
| Database | `DATABASE_URL` | `serverConfig.databaseUrl` (Drizzle) | yes | use the pooled/connection-string value from the Supabase dashboard |
| Redis | `UPSTASH_REDIS_URL` (fallback `REDIS_URL`) | `serverConfig.redisUrl` (BullMQ, TCP) | yes | must be a `rediss://` URL — BullMQ needs TCP, not the REST API |
| Redis | `UPSTASH_REDIS_REST_URL` | not read by the app | optional | listed in Plan §39; harmless to keep |
| Redis | `UPSTASH_REDIS_REST_TOKEN` | not read by the app | optional | listed in Plan §39; harmless to keep |
| Encryption | `ENCRYPTION_KEY` | `serverConfig.encryptionKey` (AES-GCM token vault) | yes | rotating it makes stored tokens undecryptable |
| Meta | `META_CLIENT_ID` (fallback `FACEBOOK_CLIENT_ID`) | `serverConfig.meta.clientId` | optional at boot, **required for scenarios 2, 6–9, 11, 13, 14** | |
| Meta | `META_CLIENT_SECRET` (fallback `FACEBOOK_CLIENT_SECRET`) | `serverConfig.meta.clientSecret` | optional at boot, required for the same scenarios | |
| Meta | `META_GRAPH_API_VERSION` | `serverConfig.meta.graphVersion` | optional | defaults to `v23.0` |
| TikTok | `TIKTOK_CLIENT_KEY` | `serverConfig.tiktok.clientKey` | optional at boot, **required for scenarios 2, 6–9, 11, 13, 14** | |
| TikTok | `TIKTOK_CLIENT_SECRET` | `serverConfig.tiktok.clientSecret` | optional at boot, required for the same scenarios | |
| App URL | `APP_URL` (or `NEXT_PUBLIC_APP_URL`; falls back to `VERCEL_URL`) | `resolveAppUrl()`, OAuth redirect URI | **required for OAuth** | see 1.5 |
| Storage | `SUPABASE_MEDIA_BUCKET` (fallback `MEDIA_BUCKET`) | `serverConfig.mediaBucket` | optional | defaults to `post-media` |

Notes:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may be present in `.env.local`; nothing in `src/` reads it. The app only
  reads `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `APP_URL` is **not** in `.env.local` today. Add it before running scenarios 2 and 13.
- The worker refuses to start without `DATABASE_URL`, `UPSTASH_REDIS_URL`/`REDIS_URL` and `ENCRYPTION_KEY`
  (`assertConfigured()` in `src/workers/publish-worker.ts:33`). That is your verification for those three.

### 1.3 Database schema (read-only check)

Two migration files must already exist in the project:

- `drizzle/0000_loud_gwen_stacy.sql` — tables: `social_accounts`, `posts`, `post_media`, `post_platforms`,
  `post_executions`, plus indexes and unique constraints.
- `supabase/migrations/0001_rls_policies.sql` — RLS enable/force, grants and policies.

Read-only confirmation (no commands that change anything):

1. Supabase dashboard → **Table Editor**. All five tables above must be listed.
2. Supabase dashboard → **SQL Editor** → run:
   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
   order by tablename;
   ```
   Every one of the five tables must appear with `rowsecurity = true`.
3. Supabase dashboard → **Authentication** → **Policies**: each table shows the policies from
   `0001_rls_policies.sql`.

If the tables are missing, the schema has not been applied to this project yet — stop and have it applied before
continuing. Do not run `drizzle-kit` as part of this runbook.

### 1.4 Supabase Storage

- Expected bucket: `post-media` (override with `SUPABASE_MEDIA_BUCKET` / `MEDIA_BUCKET`).
- `ensureMediaBucket()` in `src/lib/storage/index.ts:27` creates the bucket on the first upload with
  `public: false` and `fileSizeLimit: "100MB"`. So the bucket may legitimately not exist until scenario 4 runs.
- It must end up **private**: media is served to providers through signed URLs
  (`createSignedMediaUrl()`, 1 hour TTL). Verify after the first upload: Storage → `post-media` → the bucket is
  not marked public.

### 1.5 Meta and TikTok apps

Register the OAuth redirect URI **exactly** as:

```text
https://<your-domain>/api/oauth/<platform>/callback
```

with `<platform>` one of `instagram`, `facebook`, `tiktok`. Locally, with `APP_URL=http://localhost:3000`:

```text
http://localhost:3000/api/oauth/instagram/callback
http://localhost:3000/api/oauth/facebook/callback
http://localhost:3000/api/oauth/tiktok/callback
```

The URI is built in `src/app/api/oauth/[platform]/start/route.ts:71` from `resolveAppUrl(...)`, so it always equals
`<APP_URL>/api/oauth/<platform>/callback`. A mismatch shows up as scenario 2 failing at the provider's
consent screen.

With placeholder credentials:

- `provider.isConfigured()` is false, so `listAccountSummaries()` reports `configured: false`.
- The Connect / Reconnect button is disabled and the card shows the note
  "Instagram isn't set up on this server yet." (`src/components/social-accounts/account-card.tsx:141`).
  This string is not defined in `Design.md`; it is the current implementation copy.
- Clicking through anyway (or hitting `/api/oauth/<platform>/start` directly) redirects back with
  `?error=not_configured` and a destructive toast using the same sentence
  (`src/components/social-accounts/connection-toasts.tsx:32`).

Therefore **scenarios 2 and 9 cannot be completed until real credentials exist**, and every scenario that needs a
connected account (6, 7, 8, 11, 13, 14, 18) is downstream of scenario 2.

### 1.6 Two logins for scenario 17

Scenario 17 needs two seeded users. See section 3 for the seed command.

---

## 2. How to run the app

You need **two** terminals — the web app and the worker are separate processes.

| Terminal | Command | What it is |
| --- | --- | --- |
| 1 | `npm run dev` | Next.js app on <http://localhost:3000>. Publishing is only **enqueued** here — the HTTP request never talks to a social API. |
| 2 | `npm run worker` | The BullMQ worker (`src/workers/publish-worker.ts`). Concurrency 5, recovery sweep every 60 s. |

> **Nothing is ever published without `npm run worker` running.** This is the single most common cause of
> "my post is stuck on Processing". If terminal 2 is not open, a Publish now or a scheduled post just sits in
> `pending`/`queued` forever.

Startup check for terminal 2 — the worker logs JSON lines and must print:

```json
{"level":"info","time":"…","message":"worker started","queue":"publish","concurrency":5}
```

If it instead prints `publish worker failed to start` with
`Missing environment configuration: …`, one of `DATABASE_URL`, `UPSTASH_REDIS_URL`/`REDIS_URL`, `ENCRYPTION_KEY`
is missing. Restart the worker after every `.env.local` edit.

Production-style check (optional): `npm run build && npm start` instead of `npm run dev`.

Other scripts:

| Command | Use |
| --- | --- |
| `npm test` | 202 unit tests (time, limits, errors, status, crypto, media probe, SSRF, provider validation) |
| `npm run test:integration` | 70 integration tests against Postgres in WASM (`tests/*.test.ts`) |
| `npm run test:all` | both suites |
| `npm run lint` | `eslint .` |
| `npm run typecheck` | `tsc --noEmit` |

---

## 3. Create your login

There is no sign-up screen in the MVP (`Design.md` 6.1 — "No sign-up or password-reset screens in MVP").
Accounts are created out of band:

```bash
npm run seed:user -- --email you@example.com --password 'at-least-8-chars'
```

Reset the password of an existing user:

```bash
npm run seed:user -- --email you@example.com --password 'new-password' --reset-password
```

What the script does (`scripts/seed-user.ts`, read it before running):

- Talks only to Supabase Auth. It never runs a migration, never touches `public.*`, never writes to the
  application tables.
- Creates the user with `email_confirm: true`, so the account is usable immediately — no confirmation email.
- Requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in the environment or
  `.env.local`. The service role key is read from the environment and **never printed**; the script only echoes the
  project host, the email and the mode.
- Password must be at least 8 characters. Use a throwaway value, never a real secret of yours.

Expected output:

```text
  Supabase project : <project>.supabase.co
  User             : you@example.com
  Mode             : create

  Created and confirmed.

  Log in at /login with the email and password above.
```

If the user already exists it prints
`<email> already exists in this project.` and tells you to re-run with `--reset-password`.

---

## 4. The 18 scenarios

Status legend:

| Status | Meaning |
| --- | --- |
| `Runnable now` | works with the current build; no real OAuth credentials required |
| `Needs real credentials` | blocked until the Meta / TikTok app credentials are configured |
| `Simulate` | cannot happen naturally yet — use the recipe in section 5 |
| `Covered by automated test` | an automated test already proves the behaviour; manual run is optional |

**How to read the quoted copy.** `Design.md` sections 5.6 and 6 write most error and status sentences with **TikTok**
as the example platform, and its rules state that copy always names the platform. So when this runbook says
"Instagram rejected this media format." or "Reconnect Instagram before retrying.", the expected string is the
`Design.md` sentence with the platform name substituted — the mapping is
`humanErrorMessage(platform, code)` in `src/lib/errors.ts:78`. Badge labels, button labels, empty-state titles,
dialog titles and toast strings are quoted exactly as `Design.md` defines them.

### 1. Login

**Goal.** A seeded user can log in and land in the app shell.

**Prerequisites.** `npm run dev` running; at least one seeded user (section 3).

**Steps.**

1. Open <http://localhost:3000>. The landing page `/` is public.
2. Go to `/login`. Card header: app name `AutoPost` and "Log in to schedule and publish your posts."
3. Submit an invalid email → inline error under the field: "Enter a valid email address."
4. Clear the password and submit → "Password is required."
5. Enter the seeded email with a wrong password and click `Log in` (the label becomes "Logging in…" while
   pending) → destructive alert "Incorrect email or password. Try again."
6. Enter the correct credentials and click `Log in`.

**Expected result.** You land on `/dashboard`: page header `Dashboard` with the primary action "Create post", the
six-item sidebar, and the three cards — "Upcoming posts" (empty state "No scheduled posts", body
"Create a post and choose a date to see it here.", action "Create post"), "Recent activity" (empty state
"No activity yet", body "Posts you publish will appear here.") and "Failed posts" (empty state
"No failed posts", body "Everything you published went through.").

**Status.** `Runnable now`

---

### 2. Connect social account

**Goal.** Instagram, Facebook Page and TikTok can each be connected through OAuth.

**Prerequisites.** Real Meta and TikTok app credentials in `.env.local`; `APP_URL` set; the three redirect URIs
registered exactly as in section 1.5.

**Steps.**

1. Log in → sidebar → **Connected Accounts**.
2. Three cards must always render, in the order Instagram, Facebook, TikTok. Before connecting: status badge
   `Not connected`, identity row "Not connected", action `Connect`.
3. Click `Connect` on Instagram. The button shows "Connecting…" with a spinner while the redirect is in flight.
4. Complete the Meta consent screen and return.
5. Repeat for Facebook and TikTok.

**Expected result.**

- `?connected=tiktok` renders the toast "TikTok connected." (Design.md 6.6) and the card flips to the `Connected`
  badge with the account identity (`@username` for Instagram and TikTok, the page name for Facebook Page) and the
  actions `Reconnect` and `Disconnect`.
- A rejected or failed grant renders a destructive toast "We couldn't connect TikTok. Try again."
- No token, scope list or expiry date is ever shown on the card (`Design.md` 6.6).

**Status.** `Needs real credentials` — `META_CLIENT_ID` + `META_CLIENT_SECRET` for Instagram and Facebook,
`TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` for TikTok.

---

### 3. Create post

**Goal.** The composer accepts one caption, one media item and a platform selection, and refuses invalid input.

**Prerequisites.** Logged in. Without a connected account you can still exercise every validation below.

**Steps.**

1. `/create-post` → page header `Create post`, `Card` at `max-w-2xl` with Caption, Media, Publish to and the footer
   buttons `Schedule` (secondary) and `Publish now` (default).
2. Type a caption. The counter under the field reads `1,234 / 2,200` and the hint
   "Instagram and TikTok allow up to 2,200 characters." appears when those platforms constrain the limit.
3. Clear the caption and click `Publish now` → the button is disabled with the reason "Write a caption to continue."
   (helper text above the footer; tooltip on the button).
4. Leave the media empty and click `Publish now` → helper "Add media to continue."; after a submit attempt each
   connected platform row shows "Add media before publishing."
5. Uncheck every platform → helper "Select at least one platform."
6. Type a caption longer than the limit → the counter turns destructive, and the footer is disabled with
   "Caption is too long." (the field-level sentence names the constraining platform).
7. With no connected account: the "Publish to" group renders the warning alert "Connect an account to publish."
   with the link `Connect account` → `/connected-accounts`, and both footer buttons are disabled.

**Expected result.** Every disabled state states its reason next to or on the control; no toast is fired for
validation; the field errors are inline `text-xs text-destructive` under the offending control.

**Status.** `Runnable now` — all validation above is reachable without credentials. Completing a submit (steps that
end in `Publish now` or `Schedule post` succeeding) requires at least one connected account, i.e. scenario 2.

---

### 4. Upload media

**Goal.** A file upload is validated, stored persistently in Supabase Storage and previewed.

**Prerequisites.** Logged in; `npm run dev` running. No OAuth credentials needed.

**Steps.**

1. `/create-post` → Media → tab "Upload file". The dropzone reads
   "Drag and drop an image or video, or click to browse" and "JPEG, PNG, WebP, MP4 or MOV · up to 100 MB".
2. Drag an accepted file (JPEG/PNG/WebP image, or MP4/MOV video) onto the dropzone — or click and pick, or focus the
   dropzone and press Enter/Space.
3. While it uploads the meta line is replaced by a progress bar reading "Uploading… 42%".
4. Try a `.txt` file → inline "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV."
5. Try a file over 100 MB → inline "This file is too large. Maximum size is 100 MB."
6. Rename a `.txt` file to `.jpg` and upload it → still rejected (magic bytes are sniffed server-side by
   `sniffMimeType()` in `src/lib/media/probe.ts`).
7. Press the `X` on the preview (`aria-label="Remove media"`) → the preview disappears and the dropzone returns.

**Expected result.** A preview row with a thumbnail, the filename, meta in the form
"2.4 MB · 1920x1080 · 0:14", and a working remove control. In Supabase Storage the `post-media` bucket now exists,
is private, and holds the object under `<user-id>/<stamp>-<random>-<name>`.

**Status.** `Runnable now`

---

### 5. Paste media URL

**Goal.** A public HTTPS media URL is fetched server-side, validated, and stored the same way as an upload.

**Prerequisites.** Logged in. No OAuth credentials needed.

**Steps.**

1. `/create-post` → Media → tab "Paste URL". Placeholder `https://…`, helper
   "The URL must be publicly accessible and use HTTPS."
2. Paste `http://example.com/image.jpg` (plain HTTP) and add it → inline "Only HTTPS URLs are supported."
3. Paste `not a url` → inline "Invalid media URL."
4. Paste `https://169.254.169.254/latest/meta-data/` (cloud metadata) → rejected by the SSRF gate
   (`isBlockedAddress()` in `src/lib/media/fetch-url.ts`).
5. Paste `https://localhost:3000/anything` → rejected (loopback).
6. Paste a real public HTTPS image URL (for example a raw asset URL from a public CDN) and add it.

**Expected result.** The accepted URL produces the same preview row as an upload, and the object is stored in
`post-media` — the post never depends on the temporary URL (`src/app/api/media/url/route.ts:89`). An unreachable
or non-media URL renders "We couldn't reach this URL. Check that it's publicly accessible." or
"This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV."

**Status.** `Runnable now`

---

### 6. Publish Now

**Goal.** `Publish now` enqueues one job per platform and returns immediately; the worker publishes.

**Prerequisites.** Scenarios 2, 4 (or 5); **terminal 2 running `npm run worker`**.

**Steps.**

1. `/create-post`, write a caption, add media, keep at least one connected platform checked.
2. Click `Publish now`. The label becomes "Publishing…" and both footer buttons are disabled.
3. Watch terminal 2 for `job started` / `job completed`.

**Expected result.**

- You are navigated to `/history?post=<id>` with the post's detail panel open and every platform row showing a
  `Processing` badge (spinner). The client polls every 5 s and never shows `Published` before the worker confirms it
  (`Design.md` 8.4).
- The row flips to `Published` only when `post_platforms.status` is `success`. Successful rows also show
  `External ID: <value>` with a copy button (`aria-label="Copy external ID"`).
- No "Publishing to 3 platforms…" toast is used — `Design.md` 6.3 explicitly forbids it.

**Status.** `Needs real credentials` (a connected account). Worker-side behaviour is proven by
`tests/publish-worker.test.ts` → "a successful publish records one execution and clears the lock".

---

### 7. Schedule

**Goal.** A post can be scheduled for a future instant in a chosen IANA timezone.

**Prerequisites.** Scenarios 2, 4 (or 5); worker running.

**Steps.**

1. `/create-post`, fill in caption + media + platforms, click `Schedule`.
2. In the dialog titled "Schedule post" pick a future date, a time (15-minute steps) and a timezone.
3. Read the helper under the timezone select: "Publishes at Sep 5, 2026, 1:00 PM UTC · 8:00 PM your time
   (Asia/Jakarta)."
4. Set a date/time in the past → inline "Choose a time in the future." and the confirm button is disabled.
5. Click `Schedule post` (label becomes "Scheduling…").

**Expected result.** Toast "Post scheduled for Sep 5, 2026, 8:00 PM." and navigation to `/scheduled`, where the
row shows the scheduled time (`Sep 5, 2026, 8:00 PM`) and the IANA identifier (`Asia/Jakarta`) underneath, with a
`Scheduled` badge and a `Cancel` action. The empty state, if there is nothing scheduled, is "Nothing scheduled".
A delayed BullMQ job exists and `posts.scheduled_at` holds the UTC instant.

**Status.** `Needs real credentials`. Covered in part by `tests/posts-domain.test.ts` → "stores the IANA timezone
and the UTC instant" and "enqueues delayed jobs that land on the scheduled instant".

---

### 8. Worker execution

**Goal.** The worker, not the HTTP request, performs the publish and records every attempt.

**Prerequisites.** Scenario 6 or 7; worker running with a working Redis connection.

**Steps.**

1. With a post in flight, watch terminal 2: `job started`, then `job completed` with `durationMs`, or `job failed`
   with `code` / `retryable`.
2. Kill the worker (Ctrl+C) and publish another post.
3. Restart `npm run worker`.

**Expected result.**

- With the worker down, the post stays `Processing` (or `Scheduled` if its time has not come) and no platform row
  changes. Nothing is published.
- After the restart, the sweeps pick it up: `requeueDuePlatforms()` (due pending targets) and
  `recoverStalledPlatforms()` run from `runRecoverySweep()` (`src/lib/publishing/recovery.ts:166`) every 60 s.
- `post_executions` gains exactly one row per attempt, with a `bullmqJobId` and no token in `response_log`
  (`sanitize()` redacts anything matching `/token|secret|…/i`).
- Worker logs never contain an access token, refresh token or cookie.

**Status.** `Needs real credentials` for a real publish. The mechanics are proven by
`tests/publish-worker.test.ts` → "worker execution (Plan 18, 19, 22, 38)".

---

### 9. Multi-platform publishing

**Goal.** One post can target Instagram, Facebook and TikTok and each target is executed independently.

**Prerequisites.** All three accounts connected (scenario 2); media compatible with all three; worker running.

**Steps.**

1. `/create-post`, add a short video (within every platform's limits), check Instagram, Facebook and TikTok.
2. Click `Publish now` and open `/history?post=<id>`.

**Expected result.** Three platform rows, each with its own badge from section 5.2 of `Design.md`
(`Pending` → `Processing` → `Success`, or `Failed`). When all three succeed the post badge is `Published`. The
post status is derived from the children (`recomputePostStatus`), never guessed by the client.

**Status.** `Needs real credentials` — `META_CLIENT_ID`, `META_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`,
`TIKTOK_CLIENT_SECRET`.

---

### 10. Partial failure

**Goal.** Instagram fails while Facebook and TikTok succeed, and the post becomes `Partial failure`.

**Prerequisites.** Scenarios 2 and 9; an asset only one platform rejects (see the recipe in section 5.2).

**Steps.**

1. `/create-post`, select all three platforms, attach the deliberately incompatible media.
2. If the compatibility check (`/api/media/compatibility`) already knows the media is bad, the incompatible
   platform is disabled, unchecked and labelled "Media format is not supported." — a post is never scheduled to a
   platform known to be incompatible (`Design.md` 7.3). To reach the worker-level partial failure, use media the
   client accepts but one platform rejects at publish time (recipe 5.2).
3. Click `Publish now` and watch `/history?post=<id>`.

**Expected result.**

- Instagram row: `Failed` badge plus the mapped sentence "Instagram rejected this media format."
  (or "This video is longer than Instagram allows." for a duration failure).
- Facebook and TikTok rows: `Success` with `External ID: <value>`.
- The post badge reads `Partial failure`.
- The dashboard "Failed posts" card lists one row per **failed platform**, showing the platform badge, a `Failed`
  badge, the human sentence and a `Retry Instagram` button (labelled "Retry" when the post targets a single
  platform).

**Status.** `Simulate` — see recipe 5.2. The exact scenario is proven by `tests/critical-scenario.test.ts` →
"Instagram fails, Facebook and TikTok succeed -> partial_failure; retry only hits Instagram".

---

### 11. Retry failed platform

**Goal.** Retrying re-runs only the failed platform, never the successful ones.

**Prerequisites.** Scenario 10 (a `Partial failure` post with at least one `Failed` platform).

**Steps.**

1. `/history?post=<id>` → on the failed platform row click `Retry Instagram`.
2. The label becomes "Retrying…", then the row returns to `Processing` and the poller reports the result.
3. Also check the dashboard "Failed posts" card — the same action is offered there.

**Expected result.**

- Only the failed target moves to `pending` and gets a new job. Facebook and TikTok keep their `Success` badge,
  their `External ID`, and their attempt count — they are never re-published
  (`retryPlatform()` in `src/lib/domain/posts.ts:536`, which refuses anything whose status is not `failed`).
- After a successful retry the post badge becomes `Published`; attempt history under the row reads
  "Attempt 1 of 3 failed · Attempt 2 of 3 succeeded".
- Retrying an authentication failure is refused with "Instagram needs reconnection. Reconnect the account, then
  retry." and the button is disabled with "Reconnect Instagram before retrying." plus a link to
  `/connected-accounts`.

**Status.** `Needs real credentials` (needs a failed platform, which needs a real publish). Proven by
`tests/posts-domain.test.ts` → "retries a failed target and enqueues exactly one job for it",
"refuses to retry a platform that already succeeded", "refuses to retry an auth failure and asks for a reconnect".

---

### 12. Token expiration

**Goal.** An expired or revoked token fails the execution instead of looping, and the account is flagged.

**Prerequisites.** Scenario 2 (a connected account) plus the simulation in section 5.1.

**Steps.**

1. Run recipe 5.1 to force the account into `needs_reconnect` (or expire its token).
2. Retry a failed platform, or let a scheduled post run.
3. Open `/connected-accounts` and `/dashboard`.

**Expected result.**

- The account card shows the `Needs reconnect` badge and the in-card warning alert
  "TikTok needs reconnection. Scheduled posts to this account will fail until you reconnect." with a `Reconnect`
  button.
- The dashboard shows the banner "TikTok needs reconnection." with a `Reconnect` link to `/connected-accounts`.
- On the post detail, `Retry` is disabled with "Reconnect TikTok before retrying."
- The failed platform row shows "TikTok needs reconnection. Reconnect the account, then retry."
- No token appears in the UI, in a log line, or in `post_executions.response_log`.

Code path: `resolveAccessToken()` refreshes when the token expires within 5 minutes
(`TOKEN_REFRESH_SKEW_MS`, `src/lib/publishing/execute.ts:45`); if the refresh fails, `markAccountNeedsReconnect()`
flags the account and a non-retryable `ProviderError` is thrown, so there is no infinite retry.

**Status.** `Simulate` — see recipe 5.1. Also proven by `tests/publish-worker.test.ts` →
"an auth failure fails the target and marks the account needs_reconnect" and
"an expired token is refreshed before publishing and persisted".

---

### 13. Account reconnect

**Goal.** A `Needs reconnect` account can be reconnected without creating a duplicate account row.

**Prerequisites.** An account in `needs_reconnect` (recipe 5.1); real credentials.

**Steps.**

1. `/connected-accounts` → on the flagged card click `Reconnect` (label becomes "Connecting…").
2. Complete the provider consent screen.
3. Confirm the card flips back to `Connected` and the dashboard banner disappears.
4. Retry the failed platform that was blocked in scenario 12.

**Expected result.** Toast "TikTok connected."; the card returns to the `Connected` badge with the same identity and
now offers `Reconnect` (outline) and `Disconnect` (danger). The previously disabled `Retry` becomes enabled and
succeeds. No duplicate row is created — `saveConnectedAccounts()` re-points the existing
`(user_id, platform, platform_account_id)` row (`src/lib/domain/accounts.ts:153`).
A failed reconnect renders "We couldn't connect TikTok. Try again."

**Status.** `Needs real credentials` — the OAuth round trip cannot be completed with placeholders. Account reuse is
proven by `tests/posts-domain.test.ts` → "re-points an existing account instead of duplicating it".

---

### 14. Cancel scheduled post

**Goal.** A scheduled post can be cancelled and is never published afterwards.

**Prerequisites.** Scenario 7 (a post in `Scheduled`); worker running.

**Steps.**

1. `/scheduled` → click `Cancel` on the row.
2. In the dialog titled "Cancel scheduled post?" read the body
   "This post will not be published. You can create it again." and confirm with `Cancel post` (destructive), or
   dismiss with `Keep scheduled`.
3. Confirm.
4. Wait past the original scheduled time with the worker running.

**Expected result.**

- Immediately: the row disappears (optimistic) and the toast reads "Post cancelled." with an Undo action.
- After the scheduled instant passes: the post is still `Cancelled` and no platform was published. The worker's
  final state check refuses to publish a cancelled post (`claimPlatformForPublish()` returns
  `post-cancelled`, `src/lib/domain/executions.ts:100`).
- On a failed cancel the row returns and a destructive toast reads "Couldn't cancel this post. Try again."
- If the post already started processing, cancelling is refused with "This post can no longer be cancelled."
  (this sentence is not defined in `Design.md`; it is the current implementation copy).

**Status.** `Needs real credentials`. Proven by `tests/idempotency-cancellation.test.ts` →
"cancel marks the post and every target cancelled and removes the jobs",
"a cancelled post is never published (target still claimable)",
"a post cancelled while queued is never published",
"a cancelled post is not picked up by the recovery sweep".

---

### 15. Duplicate execution prevention

**Goal.** Two workers cannot publish the same platform target twice.

**Prerequisites.** Redis reachable; a connected account; recipe 5.3.

**Steps.** Run recipe 5.3 (two worker processes against the same Redis, one publish).

**Expected result.**

- The social provider is called exactly once. There is one post on the platform, one `post_executions` row for the
  target (or one per attempt, never two concurrent ones), and one `Success` row per platform.
- The losing worker logs `{"message":"job skipped","reason":"already-claimed-or-terminal"}`.

Guard: `claimPlatformForPublish()` performs a single atomic `UPDATE … RETURNING` on `post_platforms`
(`src/lib/domain/executions.ts:54`). Only the worker whose update matched a row gets a context; everyone else gets
`{ claimed: false, reason: "already-claimed-or-terminal" }`. A row left in `processing` is only reclaimable once
`locked_at` is older than `STALE_LOCK_MINUTES` (5).

**Status.** `Simulate` — see recipe 5.3. Also proven by `tests/idempotency-cancellation.test.ts` →
"only one worker can claim a target", "concurrent claims: exactly one worker wins the target",
"a second executePublishJob for the same target never publishes twice".

---

### 16. Worker crash / recovery

**Goal.** A worker killed mid-flight does not strand a post in `processing` and does not duplicate it.

**Prerequisites.** A connected account; recipe 5.4.

**Steps.** Run recipe 5.4 (publish, kill the worker mid-flight, restart it).

**Expected result.**

- BullMQ's own stalled handling reacts first (worker options: `stalledInterval: 30_000`,
  `maxStalledCount: 2`, `lockDuration: 60_000`), so a kill within the first minutes is usually redelivered by
  BullMQ itself.
- If the row is left `processing` with a `locked_at`, the recovery sweep reclaims it:
  `findStalledPlatformIds()` selects rows whose `locked_at` is older than `STALE_LOCK_MINUTES` (5 minutes), and
  `recoverStalledPlatforms()` releases the claim and re-enqueues
  (`src/lib/publishing/recovery.ts:89`). `runRecoverySweep()` runs every 60 s, so recovery happens within roughly
  60 seconds **after** the lock turns stale — about 5–6 minutes after the crash.
- The post reaches a terminal status and is published exactly once. If an earlier attempt had already handed the
  post to the provider, the next attempt resumes through `getPublishStatus` instead of publishing again
  (`readResumeHandle()` / `awaitAsyncPublish()`, `src/lib/publishing/execute.ts`).

**Status.** `Simulate` — see recipe 5.4. Also proven by `tests/idempotency-cancellation.test.ts` →
"a lock older than the stale window is reclaimable", "a lock just inside the stale window is not reclaimable",
"a fresh lock (30 seconds old) is not reclaimable", and `src/lib/domain/executions.test.ts` →
"a crashed worker's lock is reclaimable after 5 minutes".

---

### 17. RLS / ownership

**Goal.** User B cannot see or change user A's posts, platforms or accounts.

**Prerequisites.** Two seeded users (section 3) and at least one post created by user A (scenario 6 or 7).

**Steps.** Run recipe 5.5.

**Expected result.**

- `GET /api/posts/<user-A-post-id>` as user B returns **404** with `{"message":"We couldn't find that post."}` —
  not 403, because the query is scoped by `user_id`, so a foreign post simply does not exist
  (`src/app/api/posts/[id]/route.ts` → `getPostSummary(userId, id)`).
  This sentence is not defined in `Design.md`; it is the current implementation copy.
- `/history`, `/scheduled` and the dashboard show only user B's rows.
- Retrying or cancelling user A's target as user B fails with the same "We couldn't find that post." message.
- The policies live in `supabase/migrations/0001_rls_policies.sql` (direct ownership via
  `social_accounts.user_id` / `posts.user_id`; derived ownership for `post_media`, `post_platforms`,
  `post_executions`). The worker uses the service-role key, which bypasses RLS by design.

**Status.** `Simulate` — see recipe 5.5. Domain-level ownership is proven by `tests/posts-domain.test.ts` →
"getPostSummary and getPostDetail return null", "listScheduledPosts only returns the owner's scheduled posts",
"listHistoryPosts only returns the owner's posts", "retryPlatform rejects a target that is not the caller's",
"disconnectAccount rejects an account that is not the caller's", and
`tests/idempotency-cancellation.test.ts` → "cancelScheduledPost rejects a post owned by another user",
"claiming one target never touches another user's rows".

---

### 18. Timezone conversion

**Goal.** A wall-clock time is stored as UTC with the IANA identifier kept, and rendered back in the user's zone.

**Prerequisites.** At least one connected account (the schedule dialog is disabled while
"Connect an account to publish." is showing).

**Steps.** Run recipe 5.6 — schedule the same wall-clock time in `Asia/Jakarta` and in `America/New_York`.

**Expected result.**

- Under the timezone select, the helper always reads:
  "Publishes at Sep 5, 2026, 1:00 PM UTC · 8:00 PM your time (Asia/Jakarta)."
  and, for the other zone, the equivalent UTC instant for 8:00 PM in `America/New_York`.
- `/scheduled` shows each post's wall clock in its own zone with the IANA identifier underneath
  (`Sep 5, 2026, 8:00 PM` / `Asia/Jakarta`).
- `posts.scheduled_at` holds the UTC instant and `posts.timezone` holds the IANA identifier — never `GMT+7` or
  `UTC+7`. Confirm read-only in the Supabase Table Editor.
- A date/time in the past is refused inline with "Choose a time in the future."

**Status.** `Simulate` — see recipe 5.6. The conversion itself is proven by `src/lib/time.test.ts` →
"Asia/Jakarta 20:00 is 13:00 UTC (GMT+7)", "the same wall clock maps to a different instant per timezone",
"DST is honoured rather than a fixed offset (EST in January)", and by `tests/posts-domain.test.ts` →
"stores the IANA timezone and the UTC instant".

---

## 5. Simulation recipes

> **Local / dev project only.** Every recipe below changes **data** rows (never schema) in the project you are
> pointing at. Do not run them against a project with real users' data.

### 5.1 Token expiration (scenario 12)

1. Log in, connect the account (scenario 2), confirm the card reads `Connected`.
2. Supabase dashboard → **Table Editor** → `social_accounts` → pick the row for your user and the platform you
   want to break.
3. Either:
   - set `token_expires_at` to a timestamp in the past (for example `2020-01-01T00:00:00+00:00`), **or**
   - set `status` to `needs_reconnect`.
4. Save.
5. Back in the app: `/connected-accounts` → the card shows the `Needs reconnect` badge and the warning alert
   "TikTok needs reconnection. Scheduled posts to this account will fail until you reconnect."
6. Trigger a publish to that platform (publish now, or wait for a scheduled post, or retry a failed platform).

Expected: the execution fails with "TikTok needs reconnection. Reconnect the account, then retry.", the account is
flagged, `Retry` is disabled with "Reconnect TikTok before retrying.", and nothing is retried in a loop.

Variation for the refresh path: set `token_expires_at` 2 minutes in the future. `resolveAccessToken()` sees the
token expiring within `TOKEN_REFRESH_SKEW_MS` (5 minutes) and refreshes it before publishing; the row's
`token_expires_at` moves forward and the post publishes normally.

### 5.2 Partial failure (scenario 10)

Pick media that one platform rejects and the others accept, using `PLATFORM_LIMITS` in
`src/lib/validation/limits.ts:45`:

| Limit | Instagram | Facebook | TikTok |
| --- | --- | --- | --- |
| video `maxDurationSec` | **90** | 600 | 600 |
| video `minDurationSec` | 3 | 1 | 3 |
| `captionLength` | 2,200 | 63,206 | 2,200 |
| `maxWidth` / `maxHeight` | 4,096 | — | — |
| `minWidth` / `minHeight` | 320 | 200 | 200 |

Recipe A — duration (cleanest, reaches the worker):

1. Upload a video between 91 and 600 seconds long (for example 120 s).
2. Select Instagram + Facebook + TikTok and publish now.
3. The compatibility endpoint may already flag Instagram — if the Instagram row shows
   "Media format is not supported." and is unchecked, unblock it by publishing Instagram + Facebook + TikTok from a
   scheduled post instead, or use recipe B.

Recipe B — caption length (only trips at publish time):

1. Start with a caption comfortably under 2,200 characters and media every platform accepts.
2. Before the worker picks it up, edit `posts.content_text` in the Table Editor to a caption longer than 2,200
   characters but shorter than 63,206.
3. Instagram and TikTok fail with "This caption is too long for Instagram." / "…for TikTok."; Facebook succeeds
   (if it is selected). The post becomes `Partial failure`.

Expected in both cases: the failing platform shows `Failed` plus the mapped sentence, the others show `Success`
with an `External ID`, and the post badge reads `Partial failure`.

Per-platform validation is unit-tested: `src/providers/social/validate-content.test.ts` →
"a 500 second video: Instagram refuses it, Facebook and TikTok accept it",
"a 5,000 character caption: Instagram and TikTok refuse it, Facebook accepts it".

### 5.3 Duplicate execution prevention (scenario 15)

1. Terminal 2: `npm run worker`. Terminal 3: `npm run worker` (a second process, same Redis, same database).
2. Both must print `{"message":"worker started",…}`.
3. Publish one post to one platform.
4. Watch both terminals: one logs `job started` → `job completed`; the other logs
   `{"message":"job skipped","reason":"already-claimed-or-terminal"}` (or gets no job at all).
5. Verify on the platform: exactly one post. Verify in the Table Editor: `post_executions` has one row for that
   `post_platforms` id per attempt, not two concurrent ones.

If you want to force the race, stop both workers, set the target row back to `pending` with `locked_at = null` in
the Table Editor, then start both workers at the same time.

### 5.4 Worker crash / recovery (scenario 16)

1. Terminal 2: `npm run worker`.
2. Publish a post (Publish now) to a real connected account.
3. While the job is in flight, kill the worker process hard:
   - Windows, PowerShell — find the PID first, then kill it:
     ```powershell
     Get-Process node | Select-Object Id, StartTime, Path
     taskkill /F /PID <pid>
     ```
     (Or Task Manager → Details → right-click the `node.exe` running `publish-worker.ts` → End task. Do **not**
     use `taskkill /F /IM node.exe` — that also kills `npm run dev`.)
   - macOS / Linux: `kill -9 <pid>`.
4. Confirm in the Table Editor that the row is `post_platforms.status = 'processing'` with a non-null `locked_at`
   (that is the stalled lock).
5. Restart: `npm run worker`.
6. Wait up to ~6 minutes. The sweep runs every 60 s
   (`RECOVERY_INTERVAL_MS`, `src/workers/publish-worker.ts:31`) and only reclaims locks older than
   `STALE_LOCK_MINUTES` = 5. Look for `{"message":"stalled target re-queued",…}` in the new worker's log.

Expected: the target is re-queued once, finishes, and the platform shows exactly one post. Killing before the
5-minute window is usually handled by BullMQ's own stalled detection
(`stalledInterval: 30_000`, `maxStalledCount: 2`, `lockDuration: 60_000`) before the sweep ever sees it.

### 5.5 RLS / ownership (scenario 17)

1. Seed two users: `npm run seed:user -- --email a@example.com --password 'password-a'` and
   `npm run seed:user -- --email b@example.com --password 'password-b'`.
2. In a normal browser window log in as `a@example.com` and create a post (scenario 6 or 7).
3. From `/history?post=<id>` copy the post id out of the URL.
4. Open a **private window**, log in as `b@example.com`, and request:
   ```
   GET http://localhost:3000/api/posts/<a-post-id>
   ```
   (paste the URL in the address bar, or `curl -s -o - -w "\n%{http_code}\n" <url>` with the session cookie).

Expected: HTTP `404` and `{"message":"We couldn't find that post."}` — not `403`. `/history` and `/scheduled` for
user B are empty (empty states "No posts yet" and "Nothing scheduled"). In the Supabase Table Editor the row still
exists and still belongs to user A.

Note: the policies are in `supabase/migrations/0001_rls_policies.sql`. The automated suites run on PGlite and do
not apply that migration, so only this manual check proves the RLS layer itself.

### 5.6 Timezone conversion (scenario 18)

1. Schedule post 1: date `Sep 5, 2026`, time `8:00 PM`, timezone `Asia/Jakarta`.
   The helper must read "Publishes at Sep 5, 2026, 1:00 PM UTC · 8:00 PM your time (Asia/Jakarta)."
   Confirm with `Schedule post`.
2. Schedule post 2: the same wall clock — date `Sep 5, 2026`, time `8:00 PM`, timezone `America/New_York`.
   The helper must show the New York instant:
   "Publishes at Sep 6, 2026, 12:00 AM UTC · 8:00 PM your time (America/New_York)."
   (New York is UTC-4 in September, so 8:00 PM there is 00:00 UTC the next day — same wall clock, different
   instant, which is the whole point.)
3. Confirm with `Schedule post` and open `/scheduled`.
4. Table Editor → `posts`: `scheduled_at` is the UTC instant (different for the two posts) and `timezone` is the
   IANA identifier (`Asia/Jakarta`, `America/New_York`).

Expected: each row in `/scheduled` shows `Sep 5, 2026, 8:00 PM` with its own zone underneath, and the two posts
have different `scheduled_at` values. `scheduled_at` is always UTC; `timezone` is always the IANA identifier
(`Prompt.md` "Scheduling", Plan §16).

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Post stuck on `Processing` | `npm run worker` is not running (terminal 2), or Redis is unreachable | Start the worker. Check it printed `worker started`. Verify `UPSTASH_REDIS_URL` is a `rediss://` TCP URL; BullMQ cannot use the REST endpoint |
| `Connect` disabled, card shows "… isn't set up on this server yet." | `META_CLIENT_ID` / `META_CLIENT_SECRET` or `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` missing or still placeholders | Fill them in `.env.local`, restart **both** `npm run dev` and `npm run worker` |
| OAuth redirect mismatch at the provider consent screen | The registered redirect URI is not exactly `<APP_URL>/api/oauth/<platform>/callback` | Set `APP_URL` and register `https://<domain>/api/oauth/{instagram,facebook,tiktok}/callback` (locally `http://localhost:3000/...`) |
| "Still publishing. We'll keep trying — refresh to check the latest status." | Polling stopped after 2 minutes (24 attempts × 5 s). The status on screen is still the truth | Refresh the page. The post is not failed — check the worker log for `job completed` / `job failed` |
| `401` with "Please log in to continue." from `/api/media/upload`, `/api/media/url`, `/api/media/compatibility` or `/api/posts/[id]` | Session expired | Log in again at `/login`. Route Handlers answer `401` instead of redirecting (`src/proxy.ts` leaves `/api/*` alone on purpose) |
| Upload rejected as unsupported | Only JPEG, PNG, WebP, MP4 and MOV up to 100 MB are accepted | Convert the file. Renaming it does not help — `sniffMimeType()` reads magic bytes server-side |
| Media URL rejected | Not `https://`, not publicly reachable, or a private/metadata address | Use a public HTTPS URL. `localhost`, `127.0.0.1`, private ranges and cloud metadata endpoints are blocked on purpose (SSRF gate in `src/lib/media/fetch-url.ts`) |
| Worker exits immediately with `publish worker failed to start` | `DATABASE_URL`, `UPSTASH_REDIS_URL`/`REDIS_URL` or `ENCRYPTION_KEY` missing | The error names the missing variables. Add them and restart |
| "Too many posts at once. Wait a moment and try again." / "Too many attempts. …" | Rate limit hit (create post, publish now, schedule, retry, upload, OAuth callback) | Wait the window out (5 minutes for login and OAuth callback) and retry |
| Every publish fails with "… needs reconnection. Reconnect the account, then retry." | The account is `needs_reconnect`, or the stored token cannot be decrypted | Reconnect from `/connected-accounts`. If you rotated `ENCRYPTION_KEY`, the stored tokens are unreadable — reconnect every account |
| Post stays `Scheduled` past its time | No worker, or Redis lost the delayed job | Start the worker; the recovery sweep re-queues due targets within 60 s (`requeueDuePlatforms()`) |
| "We couldn't prepare media storage. Try again." on upload | The service-role key cannot create the `post-media` bucket | Create the bucket manually as private with a 100 MB limit, or check `SUPABASE_SERVICE_ROLE_KEY` |

---

## 7. Sign-off

| # | Scenario | Status | Verified by (automated test file/name, or manual) | Date | Tester | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Login | `Runnable now` |  |  |  |  |
| 2 | Connect social account | `Needs real credentials` |  |  |  |  |
| 3 | Create post | `Runnable now` |  |  |  |  |
| 4 | Upload media | `Runnable now` |  |  |  |  |
| 5 | Paste media URL | `Runnable now` |  |  |  |  |
| 6 | Publish Now | `Needs real credentials` |  |  |  |  |
| 7 | Schedule | `Needs real credentials` |  |  |  |  |
| 8 | Worker execution | `Needs real credentials` |  |  |  |  |
| 9 | Multi-platform publishing | `Needs real credentials` |  |  |  |  |
| 10 | Partial failure | `Simulate` |  |  |  |  |
| 11 | Retry failed platform | `Needs real credentials` |  |  |  |  |
| 12 | Token expiration | `Simulate` |  |  |  |  |
| 13 | Account reconnect | `Needs real credentials` |  |  |  |  |
| 14 | Cancel scheduled post | `Needs real credentials` |  |  |  |  |
| 15 | Duplicate execution prevention | `Simulate` |  |  |  |  |
| 16 | Worker crash/recovery | `Simulate` |  |  |  |  |
| 17 | RLS/ownership | `Simulate` |  |  |  |  |
| 18 | Timezone conversion | `Simulate` |  |  |  |  |

---

## Appendix — copy used above that is not defined in `Design.md`

These strings are the current implementation copy. They are quoted verbatim from the code so testers recognise
them, but `Design.md` does not define them, so they may change:

| String | Source |
| --- | --- |
| "Instagram isn't set up on this server yet." | `src/components/social-accounts/account-card.tsx:141`, `connection-toasts.tsx:32` |
| "We couldn't find that post." | `src/app/api/posts/[id]/route.ts:29`, `src/lib/domain/posts.ts:492` and `:562` |
| "Please log in to continue." | `src/app/api/media/upload/route.ts:26`, `src/app/api/media/url/route.ts:17`, `src/app/api/media/compatibility/route.ts:74`, `src/app/api/posts/[id]/route.ts:19` |
| "Add media" (Paste URL submit button) | `src/components/posts/media/media-url-input.tsx:73` |
| "Write a caption to continue." | `src/components/posts/composer/create-post-form.tsx:339` |
| "This post can no longer be cancelled." | `src/lib/domain/posts.ts:497` |
| "This post was cancelled and can't be retried." | `src/lib/domain/posts.ts:567` |
| "This platform is already being retried or has succeeded." | `src/lib/domain/posts.ts:574` |
| "We couldn't load your posts." | `src/components/posts/history-list.tsx:107` |
| "Too many posts at once. Wait a moment and try again." | `src/lib/actions/posts.ts:68` |
| "Too many attempts. Wait a moment and try again." | `src/lib/actions/posts.ts:152` and `:177`, `src/app/api/media/url/route.ts:16` |
| "Too many uploads. Wait a moment and try again." | `src/app/api/media/upload/route.ts:25` |
| "We couldn't prepare media storage. Try again." | `src/lib/storage/index.ts:41` |
| "External ID copied." / "We couldn't copy this ID. Copy it manually." | `src/components/posts/post-detail.tsx:45` and `:47` |
| "Attempt 2 of 3 failed · Attempt 3 of 3 succeeded" (rendered from attempts) | `src/components/posts/post-detail.tsx:73` — `Design.md` 6.5 quotes the shorter "Attempt 2 of 3 failed · Attempt 3 succeeded" |

Also computed, not literal: the schedule helper "Publishes at Sep 6, 2026, 12:00 AM UTC · 8:00 PM your time
(America/New_York)." in recipe 5.6 is the `Design.md` 7.4 pattern
"Publishes at Sep 5, 2026, 1:00 PM UTC · 8:00 PM your time (Asia/Jakarta)." rendered for a different slot.
