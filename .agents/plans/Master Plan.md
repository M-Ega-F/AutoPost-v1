# TASK: AUTOPOST PHASE 4 — CALENDAR &amp; SCHEDULE MANAGEMENT

Project:

AutoPost-v1

Repository root:

C:\Users\aldis\Documents\Codex\AutoPost-v1

PRIMARY GOAL:

Implement a complete Calendar and Schedule Management system for AutoPost.

The Calendar must use REAL post data from the existing system.

DO NOT create fake calendar data.

DO NOT create a second scheduling system.

DO NOT duplicate existing post lifecycle logic.

The Calendar must integrate with:

- Auth

- Posts

- Draft System

- Existing scheduling

- Existing Service Layer

- Internal API

- Dashboard

- Connected Accounts

- Media architecture

- Queue

- Worker

- Timezone handling

IMPORTANT:

FIRST audit the existing repository.

FIRST understand the real post lifecycle.

FIRST inspect existing scheduling architecture.

THEN design.

THEN implement.

DO NOT make a git commit.

==================================================

CURRENT VERIFIED PROJECT STATUS

==================================================

Repository:

C:\Users\aldis\Documents\Codex\AutoPost-v1

Repository validation:

npm run lint

PASS

npm run typecheck

PASS

npm test

PASS — 255/255

npm run test:integration

PASS — 74/74

npm run build

PASS

git diff --check

PASS

==================================================

COMPLETED PHASES

==================================================

PHASE 1 — INTERNAL API

COMPLETE

Existing architecture includes:

Posts API

GET /api/posts

POST /api/posts

GET /api/posts/:id

POST /api/posts/:id/cancel

POST /api/posts/:id/retry

Accounts API

GET /api/accounts

GET /api/accounts/:id

DELETE /api/accounts/:id

Dashboard API

GET /api/dashboard

Architecture:

- Session authentication

- Ownership checks

- Safe DTO responses

- Validation

- Rate limiting

- Service Layer

Never expose:

- Access tokens

- Refresh tokens

- Provider secrets

- OAuth secrets

- Encrypted credentials

- Service role keys

==================================================

PHASE 2 — DASHBOARD

==================================================

COMPLETE

Dashboard currently includes:

- Real statistics

- Scheduled posts

- Publishing posts

- Published posts

- Failed posts

- Upcoming posts

- Recent activity

- Failed posts

- Retry actions

- Connected accounts summary

- Quick actions

Dashboard architecture:

UI

↓

Dashboard Service

↓

Domain / Data

DO NOT make Calendar bypass Service Layer if the

existing architecture does not do that.

==================================================

PHASE 2.5 — REPOSITORY HEALTH

==================================================

COMPLETE

Repository root verified.

Nested unrelated worktree is excluded from:

- ESLint

- TypeScript

- Build tooling

Full repository validation works.

DO NOT reintroduce nested repository scanning.

==================================================

PHASE 3 — DRAFT SYSTEM

==================================================

COMPLETE

Draft architecture:

Draft uses:

posts.status = "draft"

No new Draft table.

No migration required.

Draft capabilities:

- Create Draft

- Empty Draft

- Save Draft

- Edit Draft

- Continue Draft

- Update Draft

- Delete Draft

- Publish Draft

- Schedule Draft

Draft routes:

/drafts

/drafts/[id]

Draft API:

/api/drafts

/api/drafts/[id]

/api/drafts/[id]/publish

IMPORTANT:

Publish Draft keeps the SAME postId.

Example:

Create Draft

postId = abc

Edit Draft

postId = abc

Publish Draft

postId = abc

DO NOT create a new Post when publishing a Draft.

Composer:

Existing Create Post composer is reused.

DO NOT duplicate the composer.

==================================================

CURRENT POST LIFECYCLE

==================================================

IMPORTANT:

Do not assume statuses blindly.

Audit actual code first.

The known architecture includes at minimum:

draft

scheduled

publishing

published

failed

There may also be:

cancelled

or other lifecycle states.

FIRST inspect:

src/lib/domain/posts.ts

Also inspect:

- Database schema

- Migrations

- Post services

- Queue

- Worker

- Retry

- Cancellation

- Schedule logic

Document the REAL lifecycle before implementation.

==================================================

CURRENT MEDIA ARCHITECTURE

==================================================

CRITICAL — DO NOT REGRESS

Media selection:

Select File

↓

Browser Memory

↓

URL.createObjectURL()

↓

Local Preview

↓

NO Storage Request

Storage persistence only occurs during:

Save Draft

Publish

Schedule

IMPORTANT:

Selecting media MUST NOT upload.

Calendar media display must use persisted media

references only.

Calendar must NEVER trigger:

/api/media/upload

just because a Calendar item is rendered.

Do not load full-size media unnecessarily.

==================================================

CURRENT PUBLISHING ARCHITECTURE

==================================================

Existing architecture includes:

- Queue

- Worker

- Retry

- Cancellation

- Idempotency

- Partial failure handling

DO NOT:

Create another queue.

Create another worker.

Create another scheduling system.

Duplicate publish logic.

Duplicate retry logic.

Calendar must consume existing lifecycle.

Architecture:

Calendar Action

↓

Posts / Schedule Service

↓

Existing Domain Logic

↓

Existing Queue / Worker

NOT:

Calendar

↓

New Schedule Table

↓

New Queue

↓

New Worker

unless the audit proves such architecture already exists.

==================================================

PHASE 4 PRIMARY GOAL

==================================================

Implement:

CALENDAR

+

SCHEDULE MANAGEMENT

The user must be able to:

1. Open Calendar

2. View scheduled posts

3. Navigate dates

4. View posts by date

5. View scheduled time

6. View platforms/accounts

7. View post status

8. Open post details

9. Continue Draft when appropriate

10. Cancel scheduled post when supported

11. Retry failed post when supported

12. Navigate to editing flow

13. Understand timezone correctly

The Calendar must display REAL application data.

==================================================

CORE USER FLOW

==================================================

USER

↓

Dashboard

↓

View Calendar

↓

Calendar

USER CAN:

Navigate Month

Navigate Week

Navigate Day

↓

See Scheduled Posts

↓

Click Post

↓

View Details

Then:

Edit

or

Cancel

or

Retry

or

Continue Draft

depending on the actual lifecycle and permissions.

==================================================

CALENDAR DATA

==================================================

Calendar must use existing Post data.

Possible statuses:

draft

scheduled

publishing

published

failed

cancelled

DO NOT automatically display every status.

Define Calendar visibility based on actual product behavior.

Recommended behavior:

SCHEDULED

Appears on Calendar

PUBLISHING

May appear if currently relevant

PUBLISHED

May appear in history/calendar depending on current

product architecture

FAILED

May appear with failure indicator if relevant

DRAFT

Does NOT occupy a calendar time unless scheduled

UNSCHEDULED DRAFTS

May appear in:

Sidebar

or

Dedicated section

but must not pretend to have a schedule.

==================================================

REQUIRED AUDIT BEFORE IMPLEMENTATION

==================================================

FIRST inspect:

DATABASE

- posts table

- post status

- scheduled timestamp fields

- timezone fields

- publish jobs

- media tables

- connected account relationships

POST DOMAIN

Inspect:

src/lib/domain/posts.ts

Also inspect:

- Post types

- Status types

- Lifecycle transitions

- Create Post

- Publish

- Schedule

- Cancel

- Retry

SERVICE LAYER

Inspect:

- Posts Service

- Dashboard Service

- Existing DTOs

- Existing query methods

API

Inspect:

GET /api/posts

POST /api/posts

GET /api/posts/:id

POST /api/posts/:id/cancel

POST /api/posts/:id/retry

Also inspect Draft APIs.

SCHEDULING

Find the actual code responsible for:

- Schedule creation

- Schedule validation

- Scheduled timestamps

- Queue/job creation

- Worker execution

TIMEZONE

Find:

- default timezone

- timezone storage

- timezone conversion

- UTC usage

- display formatting

UI

Inspect:

- Existing Calendar route if any

- Dashboard Calendar quick action

- Post History

- Draft List

- Create Post

- Post cards

- Design system

==================================================

ARCHITECTURE DECISION

==================================================

Before implementation determine:

1.

Where Calendar data should come from.

Possible:

Posts Service

Calendar Service

Existing Dashboard aggregation

Internal API

DO NOT create duplicate query logic.

Preferred architecture:

UI

↓

Calendar Service / Existing Service Layer

↓

Posts Domain

↓

Database

OR:

UI

↓

Internal API

↓

Service Layer

↓

Domain

Follow the existing architecture.

==================================================

CALENDAR SERVICE

==================================================

If Calendar-specific aggregation is needed:

Create a Calendar Service ONLY if it adds clear

domain separation.

Possible conceptual responsibilities:

getCalendarRange()

getCalendarMonth()

getCalendarWeek()

getCalendarDay()

getUnscheduledDrafts()

BUT:

Do not blindly create these methods.

Follow repository conventions.

Avoid:

Calendar UI

↓

Direct Supabase query

if existing application architecture uses Service Layer.

==================================================

CALENDAR ROUTE

==================================================

Determine existing routing convention.

Preferred route:

/calendar

If it already exists:

Extend it.

Do not create duplicate Calendar routes.

Dashboard Quick Action:

View Calendar

must navigate to the real Calendar.

==================================================

CALENDAR VIEWS

==================================================

Implement at minimum:

MONTH VIEW

Example:

September 2026

MON  TUE  WED  THU  FRI  SAT  SUN

31   1    2    3    4    5    6

7    8    9    10   11   12   13

14   15   16   17   18   19   20

21   22   23   24   25   26   27

28   29   30

Each day may show:

Scheduled Posts

Platform indicators

Time

Post preview

==================================================

WEEK VIEW

==================================================

Implement Week View if compatible with current UI

scope without excessive complexity.

Example:

Monday

09:00

Facebook Post

14:00

Instagram Post

19:00

Facebook + Instagram

Week View must use REAL scheduled times.

==================================================

DAY VIEW

==================================================

Implement Day View only if it fits naturally with

existing Calendar architecture.

DO NOT over-engineer.

Priority order:

1. Month View

2. Week View

3. Day View

Month View is REQUIRED.

==================================================

DATE NAVIGATION

==================================================

Support:

Previous

Next

Today

Examples:

Previous Month

Next Month

Today

Week View:

Previous Week

Next Week

Today

Do not reload unnecessary data.

Use efficient range queries.

==================================================

DATE RANGE QUERY

==================================================

Calendar must NOT load:

All Posts

and filter them in browser.

Instead:

Calendar Range

↓

Server-side range query

↓

Only relevant Posts

Example:

Month:

2026-09-01

through

2026-10-01

Use correct inclusive/exclusive range logic.

Avoid:

N+1 queries.

==================================================

TIMEZONE — CRITICAL

==================================================

Calendar timezone must be audited before implementation.

Determine:

Where schedule timestamp is stored.

Possible:

UTC

or:

Timezone-aware timestamp

or:

Local time + timezone

DO NOT guess.

Preferred conceptual flow:

DATABASE

UTC

↓

SERVER

Normalize

↓

USER TIMEZONE

↓

CALENDAR DISPLAY

Example:

Database:

2026-09-10T09:00:00Z

User timezone:

Asia/Jakarta

Calendar:

2026-09-10 16:00 WIB

But use actual project conventions.

==================================================

TIMEZONE REQUIREMENTS

==================================================

Calendar must:

Display correct local date.

Display correct local time.

Handle month boundary correctly.

Handle day boundary correctly.

Example:

UTC:

September 30 18:00

Asia/Jakarta:

October 1 01:00

This must appear on:

October 1

not:

September 30.

==================================================

DEFAULT TIMEZONE

==================================================

Existing project previously used:

Asia/Jakarta

Audit actual implementation.

DO NOT hardcode Asia/Jakarta everywhere.

Use:

User preference

or:

Existing default timezone architecture.

==================================================

TIMEZONE TESTS

==================================================

Add tests for:

UTC → local conversion.

Month boundary.

Day boundary.

Calendar range.

Scheduled post appears on correct date.

Do not rely only on manual testing.

==================================================

CALENDAR POST CARD

==================================================

Each Calendar item should show concise information.

Possible:

Time

Platform icon

Caption preview

Status

Example:

09:00

Facebook

Launching our new feature...

Do not render full caption unnecessarily.

==================================================

CALENDAR MEDIA

==================================================

Optional media preview:

Use:

Small thumbnail

only if existing persisted media architecture supports it.

DO NOT:

Load full media.

Trigger upload.

Create object URL.

Access browser-selected files.

Calendar only uses persisted media.

==================================================

PLATFORM DISPLAY

==================================================

Reuse existing Connected Account abstraction.

Do not hardcode:

Facebook

Instagram

Calendar should work with future providers.

Display conceptually:

Facebook

Instagram

TikTok

Threads

etc.

Use existing platform enum/type.

==================================================

MULTI-ACCOUNT POSTS

==================================================

A Post may target multiple accounts.

Calendar must represent this correctly.

Example:

09:00

Facebook + Instagram

Do not duplicate the same Post visually if one Post

targets multiple accounts.

Preferred:

One Calendar Item

↓

Multiple platform indicators

unless existing product architecture represents

platform publishing separately.

Audit first.

==================================================

CALENDAR STATUS DISPLAY

==================================================

Use clear state.

SCHEDULED

Scheduled

PUBLISHING

Publishing

PUBLISHED

Published

FAILED

Failed

DRAFT

Draft

CANCELLED

Cancelled

Use existing status naming conventions.

Do not invent new lifecycle names.

==================================================

UNSCHEDULED DRAFTS

==================================================

Drafts without schedule must not occupy a fake

calendar slot.

Implement one of:

Option A:

Unscheduled Draft Sidebar

Option B:

Draft Section

Option C:

Link to Drafts page

Choose based on existing UI architecture.

Preferred:

Small sidebar/section:

Unscheduled Drafts

Example:

Product Launch

Edited 10 minutes ago

Continue Editing

Do not load excessive Draft data.

==================================================

CALENDAR POST CLICK

==================================================

Click Calendar Post.

Behavior should follow status.

SCHEDULED:

Open Post Detail

or

Schedule Management

DRAFT:

Continue Editing

FAILED:

Open Post Detail

PUBLISHED:

Open Post Detail / History

Do not create duplicate detail pages if Phase 5 has not

implemented them yet.

If a full detail page does not exist:

Use existing routes/actions safely.

Do not build Phase 5 prematurely.

==================================================

SCHEDULE MANAGEMENT

==================================================

Calendar must integrate with existing schedule

management.

Users should be able to safely perform existing

actions.

Possible actions:

Cancel Scheduled Post

Retry Failed Post

Continue Editing Draft

View Post

DO NOT implement actions that existing lifecycle

does not support.

==================================================

CANCEL SCHEDULE

==================================================

Existing API includes:

POST /api/posts/:id/cancel

Audit what it actually supports.

If it supports scheduled post cancellation:

Calendar may expose:

Cancel

Flow:

Calendar

↓

Cancel Action

↓

Existing API / Service

↓

Existing lifecycle

Do not create:

/api/calendar/cancel

unless existing architecture explicitly requires it.

==================================================

RETRY

==================================================

Existing API includes:

POST /api/posts/:id/retry

Audit supported statuses.

Calendar may expose Retry only when valid.

Do not show Retry for:

Draft

Published

unless actual architecture supports it.

Reuse existing retry logic.

==================================================

RESCHEDULE

==================================================

IMPORTANT:

Do NOT blindly implement rescheduling.

First audit whether existing architecture supports:

Scheduled Post

↓

Change Schedule Time

If it already exists:

Reuse it.

If it does NOT exist:

Do not silently implement a second scheduling system.

Reschedule may be:

OUT OF SCOPE

unless safely supported through existing Posts Service.

If implemented:

Must update:

- Schedule timestamp

- Queue/job

- Existing lifecycle

atomically.

Avoid:

Calendar shows new time

but worker still publishes old time.

==================================================

NO DRAG AND DROP BY DEFAULT

==================================================

Drag and Drop scheduling is NOT required.

Do NOT implement drag/drop unless existing project

already supports it.

Reason:

Drag/drop rescheduling can introduce:

- timezone bugs

- stale queue jobs

- duplicate jobs

- lifecycle inconsistencies

Phase 4 priority is correct scheduling visibility and

safe management.

==================================================

SCHEDULE DATA CONSISTENCY

==================================================

Calendar must reflect source of truth.

Avoid:

Calendar has cached schedule:

10:00

Database has:

12:00

Always define source of truth.

Prefer:

Posts Service / existing domain state.

==================================================

REAL-TIME

==================================================

Realtime Calendar updates are OUT OF SCOPE.

Do not add:

Supabase Realtime

WebSockets

Polling loops

unless existing architecture already uses them and the

Calendar can safely reuse them.

Normal refresh/navigation is sufficient.

==================================================

DASHBOARD INTEGRATION

==================================================

Existing Dashboard includes:

Upcoming Posts

Calendar should be consistent with it.

Same scheduled Post should show consistent:

- Date

- Time

- Status

- Platform

Do not implement separate date conversion logic in:

Dashboard

Calendar

Reuse shared formatting/helper/service if appropriate.

==================================================

CALENDAR ↔ DASHBOARD

==================================================

Flow:

Dashboard

↓

View Calendar

↓

Calendar

Calendar

↓

Click Post

↓

Existing Post/Draft flow

No dead links.

==================================================

INTERNAL API

==================================================

Determine whether Calendar requires a new API endpoint.

Possible:

GET /api/calendar

with:

start

end

timezone

BUT:

DO NOT create endpoint automatically.

If existing:

GET /api/posts

can safely support:

status filtering

date range

then reuse it if architecture allows.

However:

Do not expose database query complexity directly

to client.

API design must follow existing conventions.

==================================================

POSSIBLE CALENDAR API

==================================================

ONLY IF REQUIRED.

Example:

GET /api/calendar?start=...&amp;end=...

Server must:

Authenticate user.

Resolve ownership server-side.

Validate date range.

Validate timezone if accepted.

Limit maximum range.

Return safe DTO.

Never expose:

tokens

credentials

raw media storage internals

provider secrets

==================================================

DATE RANGE SECURITY

==================================================

Prevent abuse.

Do not allow:

start = 1900

end = 2100

without limit.

Validate range.

Example concept:

Maximum Calendar range:

reasonable application range.

Do not choose arbitrary limit without considering UI.

==================================================

CALENDAR DTO

==================================================

Use safe Calendar DTO.

Possible fields:

id

status

scheduledAt

captionPreview

platforms

mediaPreview

createdAt

updatedAt

DO NOT expose:

accessToken

refreshToken

credentials

encryptedToken

storage internals

provider secrets

Follow existing API DTO patterns.

==================================================

OWNERSHIP

==================================================

CRITICAL.

Calendar only returns current user's Posts.

Never trust:

userId from query

Use:

Authenticated session

↓

Current user

↓

Ownership scoped query

User A must NOT see:

User B Calendar

User B Drafts

User B Scheduled Posts

User B Failed Posts

==================================================

RLS

==================================================

Audit existing RLS.

Do not weaken it.

Calendar database/service query must remain

ownership-safe.

If new query or migration is required:

verify RLS behavior.

No migration should be added unless necessary.

==================================================

NO DATABASE REDESIGN

==================================================

Phase 4 should primarily be:

Read + Presentation

+

Existing lifecycle actions.

DO NOT redesign:

posts table

queue

worker

media

OAuth

accounts

unless audit proves a minimal change is required.

==================================================

CALENDAR UI REQUIREMENTS

==================================================

Use existing:

- Design system

- Components

- Cards

- Buttons

- Dialogs

- Alerts

- Typography

- Spacing

DO NOT introduce a second design system.

==================================================

MONTH VIEW UI

==================================================

Required:

Header:

Month

Year

Controls:

Previous

Today

Next

Calendar Grid:

7 days

Each day:

Date

Calendar Items

Current day:

Visually identifiable using existing design patterns.

Do not hardcode colors unless existing design system

already defines them.

==================================================

CALENDAR RESPONSIVENESS

==================================================

Desktop:

Full Month Grid

Tablet:

Compact Grid

Mobile:

Usable Calendar

Do not simply shrink desktop UI until unreadable.

Possible mobile behavior:

Agenda/List presentation

or:

Horizontally usable grid

Follow existing responsive patterns.

==================================================

MOBILE PRIORITY

==================================================

On mobile users must still be able to:

Navigate dates.

See scheduled posts.

Open posts.

Continue drafts.

Cancel valid scheduled posts.

Retry failed posts.

Do not hide critical actions permanently.

==================================================

CALENDAR EMPTY STATE

==================================================

If no scheduled posts:

No posts scheduled for this period.

Action:

Create Post

or:

Create Draft

Follow existing UX.

==================================================

UNSCHEDULED DRAFT EMPTY STATE

==================================================

If no Drafts:

No drafts to continue.

Do not render empty broken sidebar.

==================================================

LOADING STATE

==================================================

Calendar navigation should show proper loading.

Examples:

Loading calendar...

Skeleton

Existing loading components

Do not freeze UI.

==================================================

ERROR STATE

==================================================

Use safe error messages.

Examples:

We couldn't load your calendar.

We couldn't update this post.

We couldn't cancel this scheduled post.

We couldn't load posts for this date range.

Do not expose:

SQL

Supabase internals

Stack traces

Queue internals

Provider raw responses

==================================================

CANCEL CONFIRMATION

==================================================

If Calendar exposes Cancel:

Require confirmation if existing UI pattern supports it.

Example:

Cancel scheduled post?

This prevents accidental cancellation.

Do not implement destructive action without reasonable

UX protection.

==================================================

RETRY CONFIRMATION

==================================================

Retry may execute provider work.

Use existing UX conventions.

Do not create duplicate retry flow.

==================================================

ACCESSIBILITY

==================================================

Ensure:

Keyboard navigation.

Semantic buttons.

Accessible labels.

Calendar controls have labels.

Screen-reader readable dates.

Status indicators have text or aria labels.

Focus management for dialogs.

No critical icon-only action without accessible label.

==================================================

PERFORMANCE

==================================================

Calendar must not:

Load all Posts.

Load all media.

Load all connected accounts.

Run N+1 queries.

Use:

Date range queries.

Ownership scope.

Efficient aggregation.

Small DTOs.

Lazy media where appropriate.

==================================================

CAPTION PREVIEW

==================================================

Calendar item should show limited caption.

Example:

First 50-100 characters

Use existing text truncation patterns.

Do not send huge post content if Calendar does not

need it.

==================================================

MEDIA PREVIEW PERFORMANCE

==================================================

If thumbnail supported:

Use thumbnail.

Do not load original video.

Do not autoplay video.

Do not preload all media.

Calendar must remain fast.

==================================================

FAILED POSTS

==================================================

Decide based on UX.

Possible:

Failed posts shown on original scheduled date.

With:

Failed indicator.

Action:

Retry

Do not invent failure data.

Use existing failure lifecycle.

==================================================

PUBLISHED POSTS

==================================================

Decide based on existing Calendar scope.

Possible:

Show published posts historically.

Or:

Calendar only shows schedule lifecycle.

Do not overload Phase 4.

Priority:

Scheduled management.

==================================================

CALENDAR FILTERS

==================================================

Optional filters:

Status

Platform

Only implement if:

Existing data abstraction makes it simple.

UI benefits clearly.

Do NOT build a complex analytics filter system.

Possible:

All

Scheduled

Published

Failed

Platform:

All Platforms

Facebook

Instagram

Use existing platform abstraction.

==================================================

FILTER SECURITY

==================================================

Filters must never bypass ownership.

Example:

status=scheduled

still:

current user only.

==================================================

FILTER URL STATE

==================================================

If filters implemented:

Consider URL state.

Example:

/calendar?view=month

Do not create excessive URL complexity.

Keep navigation predictable.

==================================================

CALENDAR STATE

==================================================

Preferred concepts:

Current Date

View

Date Range

Filters

Avoid storing server data unnecessarily in global state.

Follow existing React/Next architecture.

==================================================

NEXT.JS ARCHITECTURE

==================================================

Audit current Next.js patterns.

Use:

Server Components

Server Actions

Route Handlers

according to existing architecture.

Do not introduce client-side database access.

Do not expose privileged server logic to browser.

==================================================

NO DIRECT SUPABASE FROM UI

==================================================

Calendar UI should NOT suddenly bypass architecture

and directly query Supabase.

Preferred:

UI

↓

Service/API

↓

Domain

↓

Supabase

Follow actual repository architecture.

==================================================

TESTING REQUIREMENTS

==================================================

Add comprehensive tests.

Do not reduce existing tests.

==================================================

TEST: CALENDAR RANGE

==================================================

Verify:

Correct Posts returned for date range.

Outside range not returned.

Ownership preserved.

No unnecessary statuses.

Correct boundaries.

==================================================

TEST: MONTH VIEW

==================================================

Verify:

Scheduled post appears on correct day.

Month navigation changes range.

Previous month.

Next month.

Today.

Month boundary.

==================================================

TEST: TIMEZONE

==================================================

Verify:

UTC conversion.

Asia/Jakarta or actual default timezone.

Day boundary.

Month boundary.

Correct display date.

Correct display time.

==================================================

TEST: OWNERSHIP

==================================================

User A creates Scheduled Post.

User B requests Calendar.

User B must NOT see User A Post.

==================================================

TEST: DRAFT

==================================================

Unscheduled Draft:

Does NOT occupy scheduled Calendar slot.

Draft can appear in Draft section if implemented.

Continue Draft action points to correct Draft.

==================================================

TEST: SCHEDULED POST

==================================================

Scheduled Post:

Appears in Calendar.

Correct time.

Correct date.

Correct platform.

Correct status.

==================================================

TEST: MULTI ACCOUNT

==================================================

One Post.

Multiple accounts/platforms.

Verify:

One logical Calendar Item.

Correct platform indicators.

No accidental duplicate visual data.

Follow actual domain model.

==================================================

TEST: CANCEL

==================================================

If Calendar exposes Cancel:

Scheduled Post

↓

Cancel

Verify:

Existing cancel service reused.

Correct lifecycle.

Calendar updates.

No duplicate cancel logic.

==================================================

TEST: RETRY

==================================================

If Calendar exposes Retry:

Failed Post

↓

Retry

Verify:

Existing retry service reused.

Correct lifecycle.

No duplicate retry architecture.

==================================================

TEST: API SECURITY

==================================================

Verify Calendar response never exposes:

Access tokens.

Refresh tokens.

OAuth secrets.

Encrypted credentials.

Service role keys.

Provider secrets.

Raw database errors.

==================================================

TEST: EMPTY STATE

==================================================

No Posts.

Calendar shows valid Empty State.

No crash.

==================================================

TEST: PERFORMANCE / QUERY

==================================================

Where testable verify:

Date range query used.

Ownership scope.

No unbounded all-post loading.

No N+1 obvious regression.

==================================================

TEST: DASHBOARD CONSISTENCY

==================================================

If same scheduled Post appears in:

Dashboard Upcoming Posts

and:

Calendar

Verify consistent:

Date.

Time.

Status.

Timezone.

==================================================

REGRESSION PROTECTION

==================================================

DO NOT BREAK:

AUTH

Login.

Signup.

Session.

Ownership.

MEDIA

Select File

↓

Browser Memory

↓

Object URL

↓

Preview

↓

NO Storage Request

Storage only:

Save Draft

Publish

Schedule

POSTS

Create Post.

Save Draft.

Edit Draft.

Publish.

Schedule.

DRAFT

Create.

Update.

Delete.

Publish.

Schedule.

Same postId.

PUBLISHING

Queue.

Worker.

Retry.

Cancellation.

Idempotency.

Partial failure.

OAUTH

Facebook.

Instagram.

Connected Accounts.

API

Existing endpoints.

DASHBOARD

Statistics.

Upcoming.

Recent Activity.

Failed Posts.

Retry.

Connected Accounts.

==================================================

OUT OF SCOPE

==================================================

DO NOT IMPLEMENT:

Drag and Drop scheduling.

Automatic rescheduling unless existing architecture

already safely supports it.

Calendar realtime.

WebSockets.

Supabase Realtime.

Polling loops.

Auto-save.

New Draft architecture.

New queue.

New worker.

New publishing system.

New scheduling system.

Analytics dashboard.

Templates.

Public API.

Webhooks.

Team collaboration.

Approval workflows.

Phase 5 full Post Detail redesign.

Phase 4 is:

CALENDAR

+

SCHEDULE MANAGEMENT

==================================================

DATABASE RULE

==================================================

Do not add migration unless necessary.

Before migration answer internally:

1.

Can existing scheduled timestamp be queried?

2.

Can existing posts status support Calendar?

3.

Can existing account relationships provide platforms?

4.

Can existing media references provide thumbnails?

5.

Can existing Services provide required data?

If YES:

No migration.

If migration required:

Keep minimal.

Preserve:

Existing data.

RLS.

Indexes.

Post lifecycle.

Queue.

Document exactly why.

==================================================

FULL FINAL AUDIT

==================================================

Before finishing verify:

ARCHITECTURE

1. Calendar uses real data.

2. No fake Calendar data.

3. Existing Service Layer reused.

4. No direct database logic duplication.

5. Existing schedule logic reused.

6. Existing cancel logic reused.

7. Existing retry logic reused.

8. No second queue.

9. No second worker.

10. One source of truth.

CALENDAR

11. Month View works.

12. Date navigation works.

13. Today works.

14. Correct Posts displayed.

15. Correct statuses displayed.

16. Correct platforms displayed.

17. Correct time displayed.

18. Correct timezone.

19. Empty state works.

20. Mobile usable.

DRAFT

21. Draft does not occupy fake Calendar slot.

22. Draft access remains available.

23. Continue Draft works.

SCHEDULE

24. Scheduled Post appears.

25. Cancel works if supported.

26. Retry works if supported.

27. No duplicate scheduling logic.

28. No queue duplication.

MEDIA

29. Calendar does not upload media.

30. Calendar does not call /api/media/upload.

31. Calendar only uses persisted media.

32. Large media not unnecessarily loaded.

SECURITY

33. Authentication enforced.

34. Ownership enforced.

35. RLS preserved.

36. Tokens hidden.

37. Secrets hidden.

38. Safe errors.

PERFORMANCE

39. Server-side date range.

40. No all-post loading.

41. No obvious N+1.

42. Efficient DTO.

REGRESSION

43. Create Post works.

44. Save Draft works.

45. Publish works.

46. Schedule works.

47. Dashboard works.

48. Media Preview works.

49. Internal API works.

50. OAuth/Accounts unaffected.

==================================================

VALIDATION

==================================================

Run ALL commands from:

C:\Users\aldis\Documents\Codex\AutoPost-v1

Verify root:

git rev-parse --show-toplevel

Then run:

npm run lint

npm run typecheck

npm test

npm run test:integration

npm run build

git diff --check

IMPORTANT:

Do not claim PASS without actually running command.

Do not use scoped validation instead of full validation.

All commands must run from actual repository root.

==================================================

VALIDATION FAILURE

==================================================

If any validation fails report:

1. Command.

2. Exact error.

3. File.

4. Pre-existing or introduced.

5. Relation to Phase 4.

6. Attempted fix.

7. Final status.

Do not hide failures.

==================================================

FINAL REPORT

==================================================

Provide the following.

==================================================

## 1. CALENDAR ARCHITECTURE

Explain:

Where Calendar data comes from.

Which Service/API is used.

Why this architecture was chosen.

How duplicate queries were avoided.

==================================================

## 2. REAL POST LIFECYCLE

List actual statuses discovered.

Show which statuses appear in Calendar.

Example:

Draft

↓

Not scheduled

Scheduled

↓

Calendar

Publishing

↓

Optional active display

Published

↓

Historical display if implemented

Failed

↓

Failure indicator / Retry

Use actual implementation.

==================================================

## 3. USER FLOW

Show:

Dashboard

↓

View Calendar

↓

Calendar

↓

Navigate Date

↓

View Scheduled Post

↓

Open Post

Then possible actions.

Also show:

Draft

↓

Draft Section

↓

Continue Editing

==================================================

## 4. CALENDAR VIEWS

State:

Month View.

Week View.

Day View.

Clearly mark:

Implemented.

Not implemented.

Reason.

==================================================

## 5. DATE NAVIGATION

Explain:

Previous.

Next.

Today.

Date range query.

==================================================

## 6. TIMEZONE

Explain:

Database timezone.

Application timezone.

Default timezone.

Calendar conversion.

Month boundary behavior.

Day boundary behavior.

==================================================

## 7. SCHEDULE MANAGEMENT

Explain:

Existing schedule architecture reused.

Cancel.

Retry.

Reschedule.

Clearly state:

Implemented.

Not implemented.

Reason.

==================================================

## 8. DRAFT INTEGRATION

Explain:

How unscheduled Drafts behave.

Where they appear.

How Continue Editing works.

==================================================

## 9. DASHBOARD INTEGRATION

Explain:

View Calendar Quick Action.

Upcoming Post consistency.

Date/time consistency.

==================================================

## 10. MEDIA

Explain:

Calendar media preview.

Persisted media only.

No browser blob dependency.

No upload during Calendar rendering.

==================================================

## 11. API

List:

New endpoints.

Modified endpoints.

Reused endpoints.

For each explain:

Authentication.

Ownership.

Validation.

Safe DTO.

==================================================

## 12. DATABASE

Explicitly state:

Migration:

YES / NO

Tables:

Changed / Not Changed

Columns:

Changed / Not Changed

Enums:

Changed / Not Changed

Indexes:

Changed / Not Changed

RLS:

Changed / Not Changed

Explain any changes.

==================================================

## 13. SECURITY

Explain:

Authentication.

Ownership.

Calendar isolation.

RLS.

Token protection.

Secret protection.

Safe errors.

==================================================

## 14. PERFORMANCE

Explain:

Date range query.

Pagination if any.

Media optimization.

N+1 prevention.

DTO optimization.

==================================================

## 15. TESTS

List:

New Unit Tests.

New Integration Tests.

Calendar Range Tests.

Timezone Tests.

Ownership Tests.

Schedule Tests.

Draft Tests.

Cancel Tests.

Retry Tests.

Report totals.

==================================================

## 16. VALIDATION

Show actual results:

npm run lint

npm run typecheck

npm test

npm run test:integration

npm run build

git diff --check

==================================================

## 17. FILES CREATED

List every file.

==================================================

## 18. FILES MODIFIED

List every file.

Explain why.

==================================================

## 19. OUT OF SCOPE

Explicitly confirm not implemented:

Drag and Drop.

Realtime.

New Queue.

New Worker.

New Publish System.

New Schedule System.

Analytics.

Templates.

Public API.

==================================================

## 20. NEXT PHASE

Do not implement.

Next Phase:

PHASE 5

POST DETAIL &amp; MANAGEMENT

Possible scope:

Post Detail.

Post Status.

Post Result.

Provider Result.

Media.

Platform Result.

Cancel.

Retry.

Management.

DO NOT implement Phase 5.

==================================================

## 21. GIT

State:

Commit created:

YES / NO

Expected:

NO

==================================================

FINAL CRITICAL RULE

==================================================

DO NOT over-engineer Calendar.

Audit first.

Use real Post data.

Reuse existing Service Layer.

Reuse existing scheduling.

Reuse existing queue.

Reuse existing worker.

Do not duplicate lifecycle.

Do not upload media when rendering Calendar.

Do not break browser media preview.

Do not weaken security.

Do not weaken RLS.

Do not create fake Calendar data.

Do not hide validation failures.

Validate from the real repository root.

DO NOT MAKE A GIT COMMIT.