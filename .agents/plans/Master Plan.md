Anda bekerja pada repository:

C:\Users\aldis\Documents\Codex\AutoPost-v1

Tugas Anda adalah mengimplementasikan:

# PHASE 16A — CONTENT APPROVAL & REVIEW WORKFLOW

Implementasi harus disesuaikan dengan arsitektur AutoPost-v1 yang sudah selesai sampai Phase 15.

==================================================
1. KONTEKS PRODUK
==================================================

AutoPost-v1 adalah SaaS Multi-Social Auto Poster.

Tujuan utama:

Upload konten sekali
→ pilih beberapa platform
→ publish sekarang atau schedule
→ background worker memproses
→ user melihat hasil.

Produk sekarang sudah berkembang menjadi workspace-based SaaS dengan:

- Multi workspace
- Team collaboration
- Roles & permissions
- Draft system
- Templates
- Calendar
- Scheduling
- Media Library
- Analytics
- Notifications
- Queue reliability
- Webhooks

Phase 16A bertujuan menambahkan:

CONTENT APPROVAL & REVIEW WORKFLOW

Agar content tidak langsung:

Draft
→ Published

Tetapi dapat melalui proses:

Draft
↓
In Review
↓
Approved
↓
Scheduled / Publishing
↓
Published

Atau:

Draft
↓
In Review
↓
Changes Requested
↓
Draft
↓
In Review

==================================================
2. KONDISI REPOSITORY SAAT INI
==================================================

Repository sudah memiliki:

PHASE 1
Internal API dan service layer.

PHASE 2
Dashboard.

PHASE 3
Draft System.

PHASE 4
Calendar & Schedule Management.

PHASE 5
History.

PHASE 6
Content Reuse, Duplicate & Templates.

PHASE 7
Connected Accounts & Account Health.

PHASE 8
Threads integration.

PHASE 9
User Settings & Preferences.

PHASE 10
Media Library.

PHASE 11
Analytics.

PHASE 12A
Workspace isolation.

PHASE 12B
Roles & Permissions.

PHASE 12C
Team Invitations & Member Management.

PHASE 12D
Workspace Management.

PHASE 13
Notification System.

PHASE 14
Reliability & Observability.

PHASE 15
External Webhooks.

JANGAN merusak implementasi yang sudah ada.

==================================================
3. ARSITEKTUR EXISTING YANG HARUS DIPERTAHANKAN
==================================================

Gunakan pola existing.

Domain:

src/lib/domain/

Authorization:

src/lib/auth/permissions.ts

src/lib/auth/authorization.ts

Database:

src/lib/db/schema.ts

Drizzle migrations:

drizzle/

Supabase RLS:

supabase/migrations/

API:

src/app/api/

Components:

src/components/

Notifications:

gunakan sistem Phase 13.

Queue:

BullMQ existing.

Worker:

src/workers/

Workspace:

workspace-aware.

Semua resource harus tetap:

workspace-scoped

dan

server-authorized.

==================================================
4. TUJUAN PHASE 16A
==================================================

Tambahkan workflow approval agar workspace dapat melakukan review content sebelum publish.

Workflow dasar:

DRAFT

↓

IN REVIEW

↓

APPROVED

↓

SCHEDULED

↓

PUBLISHING

↓

PUBLISHED


Alternative flow:

DRAFT

↓

IN REVIEW

↓

CHANGES REQUESTED

↓

DRAFT

↓

IN REVIEW


Approval workflow harus:

- workspace-aware
- role-aware
- permission-based
- notification-aware
- audit-friendly
- aman terhadap race condition
- tidak merusak queue existing
- tidak mengubah publish worker secara tidak perlu

==================================================
5. PENTING — JANGAN LANGSUNG MENGUBAH posts.status
==================================================

Audit terlebih dahulu status post existing.

Cari:

posts.status

dan seluruh state yang sudah digunakan.

Contoh kemungkinan existing:

draft
scheduled
processing
published
failed
partial_failure
cancelled

JANGAN asal menambahkan status baru jika:

status existing memiliki dependency pada:

- worker
- queue
- dashboard
- analytics
- history
- calendar
- retry
- cancel
- webhook
- notification

Tentukan arsitektur paling aman.

Prioritas:

JANGAN merusak lifecycle publishing existing.

==================================================
6. REKOMENDASI ARSITEKTUR APPROVAL
==================================================

Gunakan approval state terpisah dari publishing status.

Contoh:

posts.status

tetap menangani publishing lifecycle.

Tambahkan:

approval_status

atau

review_status

Contoh:

draft

in_review

changes_requested

approved

approval_not_required


Tentukan nama yang paling konsisten dengan existing codebase.

Tujuan:

Publishing lifecycle:

draft
scheduled
processing
published
failed

tetap terpisah dari:

review lifecycle:

draft
in_review
changes_requested
approved

Jangan mencampur dua state machine jika tidak diperlukan.

==================================================
7. APPROVAL STATE MACHINE
==================================================

Implementasikan state machine eksplisit.

Contoh:

DRAFT

→ submit_for_review

IN_REVIEW


IN_REVIEW

→ approve

APPROVED


IN_REVIEW

→ request_changes

CHANGES_REQUESTED


CHANGES_REQUESTED

→ edit

DRAFT


APPROVED

→ content modified

DRAFT

atau

APPROVAL_INVALIDATED

Tentukan behavior yang paling aman.

==================================================
8. CONTENT MODIFICATION RULE
==================================================

Ini sangat penting.

Jika content sudah:

APPROVED

kemudian diubah:

caption
media
accounts
platform
schedule

Approval harus dipertimbangkan kembali.

Implementasikan behavior yang aman.

Rekomendasi:

APPROVED

+

content modification

↓

DRAFT

atau:

APPROVAL INVALIDATED

↓

DRAFT


Jangan membiarkan content yang sudah berubah tetap approved.

Contoh:

Reviewer approve:

Caption A

Kemudian editor mengubah menjadi:

Caption B

Post tidak boleh tetap:

approved.

==================================================
9. REVIEW REQUEST
==================================================

Tambahkan kemampuan:

Submit for Review.

Editor dapat:

Draft

↓

Submit for Review.

Review request harus menyimpan:

- post_id
- workspace_id
- requester
- requested_at

Jika perlu reviewer dapat ditentukan.

Namun Phase 16A harus tetap simple.

Minimum:

review request terbuka kepada user yang memiliki permission review.

Optional:

assign reviewer.

Jangan membuat assignment system terlalu kompleks jika belum diperlukan.

==================================================
10. REVIEWER
==================================================

Reviewer adalah user yang memiliki permission:

content:review

atau permission equivalent.

Tambahkan permission baru secara terpusat.

Contoh:

content:view

content:create

content:update

content:delete

content:submit_review

content:review

content:approve

content:request_changes


Namun jangan duplikasi permission yang sudah tersedia.

Audit:

permissions.ts

terlebih dahulu.

Tambahkan hanya permission yang diperlukan.

==================================================
11. ROLE MATRIX
==================================================

Gunakan existing role:

owner

admin

editor

viewer


Rekomendasi default:

OWNER

- create
- edit
- submit review
- review
- approve
- request changes
- publish
- schedule


ADMIN

- create
- edit
- submit review
- review
- approve
- request changes
- publish
- schedule


EDITOR

- create
- edit
- submit review

Tidak boleh:

- approve own review jika policy melarang
- approve content lain jika tidak memiliki permission


VIEWER

- view only

==================================================
12. SELF APPROVAL POLICY
==================================================

Implementasikan policy secara eksplisit.

Tentukan apakah:

Editor boleh approve content sendiri.

Rekomendasi default:

SELF APPROVAL = FALSE

Artinya:

user yang membuat review request

tidak boleh approve request tersebut sendiri.

Namun:

Owner/Admin dapat override.

Atau implementasikan setting policy sederhana.

Jangan membuat workspace configuration terlalu besar.

Minimum:

server-side enforcement.

Jangan hanya menyembunyikan tombol UI.

==================================================
13. REVIEW COMMENTS
==================================================

Tambahkan reviewer comment.

Saat:

Request Changes

reviewer dapat memberikan:

comment.

Contoh:

"Tolong perbaiki caption bagian CTA."

Data harus:

- persistent
- workspace-aware
- ownership-safe

Tambahkan tabel jika diperlukan.

Contoh:

content_reviews

atau:

post_reviews


Struktur kemungkinan:

id

workspace_id

post_id

action

comment

actor_id

created_at


Action:

submitted

approved

changes_requested

resubmitted


Audit trail sangat direkomendasikan.

==================================================
14. REVIEW HISTORY
==================================================

Setiap action review harus dapat dilihat.

Contoh:

Muhammad

Submitted for review

14 Sep 2026


Admin

Requested changes

"Tolong perbaiki CTA"

14 Sep 2026


Muhammad

Resubmitted

15 Sep 2026


Admin

Approved

15 Sep 2026


Implementasikan timeline.

Jangan expose:

- internal token
- secret
- credential
- stack trace

==================================================
15. DATABASE DESIGN
==================================================

Audit schema existing terlebih dahulu.

Jangan membuat migration tanpa alasan.

Tentukan desain minimal.

Kemungkinan:

A.

Tambah field pada posts:

approval_status

review_requested_at

approved_at

approved_by


dan tabel:

post_review_events


ATAU:

B.

Tabel approval terpisah.

Pilih berdasarkan arsitektur existing.

Prioritas:

- sederhana
- normalized
- mudah di-query
- audit-friendly
- workspace-aware

==================================================
16. REKOMENDASI DATABASE
==================================================

Kemungkinan desain:

posts

approval_status


post_review_events

id

workspace_id

post_id

actor_id

action

comment

created_at


Action:

submitted

approved

changes_requested

resubmitted

approval_invalidated


Jika menggunakan enum PostgreSQL:

pastikan migration aman.

Jika codebase menggunakan text + validation:

ikuti existing convention.

Jangan memperkenalkan pattern database baru tanpa alasan.

==================================================
17. WORKSPACE ISOLATION
==================================================

Semua approval resource harus memiliki:

workspace_id

atau ownership relationship yang dapat diverifikasi.

Tidak boleh:

Workspace A

mengakses review:

Workspace B.

Semua domain query harus memverifikasi:

workspace membership.

==================================================
18. AUTHORIZATION
==================================================

Gunakan:

permissions.ts

authorization.ts

Jangan membuat authorization logic tersebar.

Contoh:

requireWorkspacePermission()

atau helper existing.

Semua API harus server-side authorized.

UI permission check hanya tambahan UX.

==================================================
19. SUBMIT FOR REVIEW
==================================================

Tambahkan API.

Contoh:

POST

/api/posts/:id/submit-review


Behavior:

1.

Authenticate user.

2.

Resolve active workspace.

3.

Verify post belongs workspace.

4.

Verify permission.

5.

Verify post editable.

6.

Verify post belum:

scheduled
processing
published

7.

Verify review state valid.

8.

Create review event.

9.

Update approval status.

10.

Create notification.

11.

Emit webhook event jika registry Phase 15 mendukung.

12.

Return safe response.

==================================================
20. APPROVE
==================================================

Tambahkan:

POST

/api/posts/:id/approve


Behavior:

1.

Authenticate.

2.

Resolve workspace.

3.

Verify permission.

4.

Verify post status.

5.

Verify approval status:

in_review.

6.

Verify self approval policy.

7.

Atomic update.

8.

Create review event.

9.

Create notification.

10.

Emit webhook event.

11.

Return result.

==================================================
21. REQUEST CHANGES
==================================================

API:

POST

/api/posts/:id/request-changes


Payload:

comment


Validation:

comment wajib.

Trim whitespace.

Maximum length.

Gunakan schema validation existing.

Behavior:

in_review

↓

changes_requested

Create review event.

Notify requester.

Webhook event.

==================================================
22. RESUBMIT
==================================================

Editor dapat:

changes_requested

↓

edit

↓

submit review

Gunakan API submit review existing jika memungkinkan.

Jangan membuat endpoint duplicate tanpa alasan.

Review event:

resubmitted.

==================================================
23. EDITING DURING REVIEW
==================================================

Tentukan policy eksplisit.

Rekomendasi:

Jika:

in_review

Editor tidak boleh mengubah content langsung.

Atau:

Editing otomatis menarik content kembali menjadi:

draft.

Saya merekomendasikan:

Edit

saat:

in_review

↓

approval invalidated

↓

draft


Dengan review event:

review_cancelled_by_edit

atau:

approval_invalidated.

Namun audit existing composer terlebih dahulu.

Jangan membuat UX membingungkan.

==================================================
24. APPROVED CONTENT
==================================================

Jika:

approved

maka content dapat:

Publish

atau

Schedule.

Tentukan apakah approval wajib.

Phase 16A sebaiknya:

tidak langsung memaksa approval untuk semua workspace.

Karena existing user flow sudah:

Draft

→ Publish

Harus tetap compatible.

==================================================
25. APPROVAL MODE
==================================================

Implementasikan default compatibility:

Approval workflow tidak wajib secara global.

Contoh:

approval_status:

not_required

draft

in_review

changes_requested

approved


Existing post:

not_required

Dengan demikian:

existing Publish

tetap bekerja.

Content yang masuk workflow:

harus approved sebelum:

Schedule

atau Publish.

==================================================
26. PUBLISH GUARD
==================================================

Jika post menggunakan approval workflow:

approval_status != approved

maka:

Publish

harus ditolak.

Schedule

harus ditolak.

Error aman:

"This post must be approved before publishing."

atau equivalent.

Enforcement harus:

server-side.

Jangan hanya UI.

==================================================
27. APPROVAL ENABLEMENT
==================================================

Jangan langsung membuat workspace settings besar.

Implementasikan cara minimal.

Kemungkinan:

approval workflow digunakan ketika user:

Submit for Review.

Jika belum pernah submit:

approval_status = not_required.

Jika submit:

approval becomes required.

Ini menjaga backward compatibility.

==================================================
28. CREATE POST COMPATIBILITY
==================================================

Existing flow harus tetap:

Create Post

→ Publish Now

→ Success


dan:

Create Post

→ Schedule

→ Success


tanpa approval wajib.

Approval adalah workflow tambahan.

==================================================
29. DRAFT INTEGRATION
==================================================

Integrasikan dengan Phase 3 Draft.

Draft dapat:

Save Draft.

Kemudian:

Submit for Review.

Review request harus menggunakan:

postId existing.

Jangan membuat post baru.

==================================================
30. TEMPLATE INTEGRATION
==================================================

Template:

Use Template

↓

Draft

↓

optional Submit for Review.

Template sendiri tidak membutuhkan approval.

Jangan menambahkan approval ke:

content_templates

kecuali benar-benar diperlukan.

==================================================
31. DUPLICATE INTEGRATION
==================================================

Duplicate post:

harus menghasilkan:

Draft.

Approval:

not_required

atau reset.

Jangan copy:

approved state.

Jangan copy:

review history.

==================================================
32. MEDIA INTEGRATION
==================================================

Media Library existing harus tetap.

Jika approved content media berubah:

approval invalidated.

Pastikan media reference tetap aman.

==================================================
33. SCHEDULE INTEGRATION
==================================================

Schedule behavior:

NOT_REQUIRED

→ existing behavior.

APPROVED

→ boleh schedule.

IN_REVIEW

→ reject.

CHANGES_REQUESTED

→ reject.

DRAFT

→ reject jika approval workflow aktif.

Server-side guard.

==================================================
34. CALENDAR
==================================================

Calendar existing tidak perlu menampilkan review sebagai schedule event.

Namun jika berguna:

tambahkan indicator pada detail.

Contoh:

Approval:

Approved

atau:

In Review.

Jangan memasukkan:

draft review

sebagai calendar event.

==================================================
35. HISTORY
==================================================

History existing harus tetap.

Detail post dapat menampilkan:

Approval status.

Contoh:

Approval

Approved

by Admin

15 Sep 2026


Review timeline.

Jangan membuat History utama terlalu kompleks.

==================================================
36. DASHBOARD
==================================================

Tambahkan approval summary secara minimal.

Contoh:

Pending Review

3

Changes Requested

2


Hanya jika data tersedia dengan query efisien.

Jangan membuat dashboard query mengambil semua post.

Gunakan aggregation server-side.

==================================================
37. NOTIFICATION INTEGRATION
==================================================

Gunakan Phase 13 notification system.

Tambahkan event:

CONTENT_SUBMITTED_FOR_REVIEW

CONTENT_APPROVED

CONTENT_CHANGES_REQUESTED

CONTENT_RESUBMITTED

APPROVAL_INVALIDATED


Notification recipients harus sesuai role dan context.

==================================================
38. NOTIFICATION RECIPIENTS
==================================================

Submit Review:

notify users yang memiliki:

content:review

dalam workspace.

Approved:

notify requester / creator.

Changes Requested:

notify requester.

Resubmitted:

notify reviewer jika reviewer assigned.

Jika reviewer tidak assigned:

hindari spam seluruh workspace jika memungkinkan.

Gunakan recipient resolution aman.

==================================================
39. NOTIFICATION DEDUPLICATION
==================================================

Gunakan deduplication Phase 13.

Jangan membuat notification setiap polling.

Tidak ada polling event baru.

Hanya event action.

==================================================
40. WEBHOOK INTEGRATION
==================================================

Gunakan Phase 15 event registry.

Tambahkan event:

post.review_requested

post.approved

post.changes_requested

post.resubmitted

post.approval_invalidated


Payload harus aman.

Contoh:

event_id

event_type

workspace_id

post_id

actor_id

timestamp


Jangan expose:

caption

media URL

token

secret

credential

stack trace.

==================================================
41. WEBHOOK DELIVERY
==================================================

Jangan membuat webhook queue baru jika Phase 15:

deliver-webhook

sudah generic.

Gunakan event registry existing.

==================================================
42. QUEUE INTEGRATION
==================================================

Approval action sendiri tidak membutuhkan BullMQ.

Jangan memasukkan approval request ke queue tanpa alasan.

Queue hanya digunakan jika existing architecture membutuhkan background processing.

Approval harus:

transactional / synchronous domain action.

Publish queue tetap:

existing.

==================================================
43. WORKER SAFETY
==================================================

Publish worker harus memverifikasi:

approval requirement.

Defense in depth.

Jika post somehow masuk queue tetapi:

approval belum valid,

worker tidak boleh publish.

Namun jangan merusak existing posts:

approval_status = not_required.

==================================================
44. RACE CONDITION
==================================================

Tangani concurrency.

Contoh:

Reviewer A

approve.

Reviewer B

request changes.

Secara bersamaan.

Gunakan:

conditional update

atau transaction.

Transition hanya valid jika:

current status sesuai.

Contoh:

UPDATE

WHERE:

approval_status = in_review.


Jika zero rows:

return conflict.

Gunakan HTTP:

409 Conflict.

==================================================
45. IDEMPOTENCY
==================================================

Submit review harus aman terhadap duplicate request.

Approve harus tidak menghasilkan:

multiple review events.

Gunakan state transition guard.

Jangan mengandalkan frontend.

==================================================
46. REVIEW EVENT SECURITY
==================================================

User tidak boleh:

mengubah actor_id.

workspace_id.

created_at.

Action harus ditentukan server.

==================================================
47. API ENDPOINTS
==================================================

Implementasikan minimal:

GET

/api/posts/:id/review


POST

/api/posts/:id/submit-review


POST

/api/posts/:id/approve


POST

/api/posts/:id/request-changes


Opsional:

POST

/api/posts/:id/withdraw-review


Hanya implement jika diperlukan oleh UX.

==================================================
48. GET REVIEW
==================================================

Response:

approval status.

review history.

requested by.

timestamps.

comment.

permission hints jika diperlukan.

Jangan expose unnecessary internal data.

==================================================
49. API RESPONSE
==================================================

Ikuti format API existing.

Audit:

API-INTERNAL.md.

Gunakan:

consistent error format.

Contoh:

401

Unauthorized.

403

Permission denied.

404

Post not found.

409

Invalid review state.

422

Validation failed.

==================================================
50. API DOCUMENTATION
==================================================

Update:

docs/API-INTERNAL.md

Tambahkan:

approval endpoints.

permissions.

state transition.

example response.

error response.

security notes.

==================================================
51. UI ROUTE
==================================================

Jangan membuat page baru jika tidak diperlukan.

Integrasikan approval ke:

Draft detail.

Create Post editor.

History detail.

Post detail existing.

Namun jika UX membutuhkan:

gunakan component reusable.

==================================================
52. COMPOSER UI
==================================================

Tambahkan action:

Save Draft

Submit for Review

Publish

Schedule


Action visibility berdasarkan:

approval status

permission.

Contoh:

EDITOR

Draft

→ Save Draft

→ Submit for Review.


ADMIN

In Review

→ Approve

→ Request Changes.

==================================================
53. REVIEW PANEL
==================================================

Buat component reusable.

Contoh:

src/components/posts/review/

review-panel.tsx

review-status-badge.tsx

review-timeline.tsx

review-actions.tsx


Ikuti naming convention existing.

==================================================
54. REVIEW STATUS UI
==================================================

Tampilkan:

Draft

In Review

Changes Requested

Approved

Not Required


Gunakan badge existing.

Jangan membuat design system baru.

Gunakan:

shadcn/ui

existing Tailwind convention.

==================================================
55. REQUEST CHANGES UI
==================================================

Gunakan dialog.

Textarea:

Comment.

Validation client:

minimum.

Validation server:

authoritative.

Jangan mengirim empty comment.

==================================================
56. APPROVE UI
==================================================

Approve dapat:

langsung action.

Atau confirmation kecil.

Tidak perlu dialog besar.

Setelah success:

refresh state.

Notification:

server generated.

==================================================
57. REVIEW TIMELINE UI
==================================================

Contoh:

● Submitted for review

Muhammad

14 Sep 2026 14:00


● Changes requested

Admin

"Tolong perbaiki CTA."

14 Sep 2026 14:20


● Resubmitted

Muhammad

15 Sep 2026 10:00


● Approved

Admin

15 Sep 2026 10:15

==================================================
58. EDITOR EXPERIENCE
==================================================

Jika:

changes_requested.

Tampilkan:

review comment.

CTA:

Edit Draft.

Setelah edit:

Save Draft.

Kemudian:

Submit for Review.

==================================================
59. REVIEWER EXPERIENCE
==================================================

Reviewer melihat:

content preview.

caption.

selected platforms.

accounts.

media.

schedule information.

Review history.

Actions:

Approve.

Request Changes.

==================================================
60. SECURITY UI
==================================================

Jangan mengandalkan UI.

Semua endpoint:

server authorization.

UI hanya menyembunyikan action.

==================================================
61. RLS
==================================================

Tambahkan Supabase RLS.

Semua tabel baru:

workspace membership aware.

User hanya dapat:

SELECT

review resource dalam workspace.

INSERT:

server/domain policy sesuai membership.

UPDATE:

sesuai authorization.

Namun ingat:

complex role permission biasanya di server.

RLS minimal harus:

mencegah cross-workspace access.

==================================================
62. RLS MIGRATION
==================================================

Buat migration:

supabase/migrations/

dengan nomor sesuai repository.

Jangan hardcode nomor.

Audit migration terakhir.

==================================================
63. DRIZZLE MIGRATION
==================================================

Buat migration baru.

Gunakan:

npm run db:generate

jika existing workflow menggunakan Drizzle generate.

Jangan edit migration lama.

==================================================
64. EXISTING DATABASE
==================================================

Pastikan migration:

compatible existing data.

Existing posts harus tetap bekerja.

Default:

approval_status = not_required

atau equivalent.

Jangan membuat existing post menjadi:

in_review.

==================================================
65. BACKFILL
==================================================

Migration harus menangani:

existing rows.

Gunakan safe default.

Jika column:

NOT NULL,

pastikan existing data dapat dimigrate.

==================================================
66. INDEXES
==================================================

Tambahkan index hanya jika diperlukan.

Kemungkinan:

workspace_id + approval_status

post_id + created_at

workspace_id + created_at

Jangan over-index.

==================================================
67. DOMAIN LAYER
==================================================

Tambahkan domain module.

Contoh:

src/lib/domain/reviews.ts

atau:

src/lib/domain/post-approvals.ts


Gunakan naming sesuai existing code.

Domain menangani:

submit.

approve.

request changes.

get history.

state transition.

authorization integration.

notification event.

webhook event.

==================================================
68. JANGAN TARUH LOGIC DI ROUTE
==================================================

API route hanya:

authenticate.

parse input.

call domain/service.

return response.

Business logic:

domain layer.

==================================================
69. STATE TRANSITION HELPER
==================================================

Implementasikan state transition explicit.

Contoh conceptual:

canTransitionReviewState()

submitForReview()

approveReview()

requestChanges()

invalidateApproval()


Jangan menggunakan:

if chain besar tersebar di banyak file.

==================================================
70. VALIDATION
==================================================

Gunakan validation schemas existing.

Tambahkan:

submitReviewSchema

requestChangesSchema


Comment:

trim.

min length.

max length.

Reject:

empty whitespace.

==================================================
71. CONTENT SNAPSHOT
==================================================

Pertimbangkan review snapshot.

Namun jangan membuat kompleksitas tidak perlu.

Minimum requirement:

approval invalidated jika content berubah.

Optional:

content hash.

Jika implement hash:

harus deterministic.

Jangan menyimpan media binary.

Jika tidak diperlukan:

gunakan update hooks/domain transition.

==================================================
72. CONTENT CHANGE DETECTION
==================================================

Audit semua jalur edit post:

Create Post composer.

Draft edit.

Duplicate.

Template.

API.

Schedule.

Pastikan perubahan content utama dapat:

invalidate approval.

==================================================
73. FIELDS YANG INVALIDATE APPROVAL
==================================================

Minimum:

caption.

media.

platform.

account.

schedule.

content data.

Jangan invalidate hanya karena:

analytics update.

notification update.

publish result.

internal metadata.

==================================================
74. APPROVAL + SCHEDULE
==================================================

Jika post approved:

Schedule.

Setelah schedule:

approval tetap:

approved.

Jangan reset approval hanya karena scheduling.

Namun jika schedule/content diubah:

tentukan policy.

Rekomendasi:

schedule time sendiri merupakan workflow change.

Jika reviewer approval termasuk schedule:

invalidate.

Jika tidak:

tetap approved.

Untuk Phase 16A:

pilih policy eksplisit dan konsisten.

Dokumentasikan.

==================================================
75. CANCEL
==================================================

Existing cancel harus tetap.

Cancel scheduled post tidak mengubah review history.

Approval dapat tetap:

approved.

Atau reset sesuai policy.

Jangan menghapus review history.

==================================================
76. RETRY
==================================================

Retry publish existing harus tetap.

Jika previously approved post gagal:

Retry tidak perlu approval ulang.

Karena content sama.

==================================================
77. PARTIAL FAILURE
==================================================

Approval tidak berubah karena:

partial failure.

Retry tetap existing.

==================================================
78. ACCOUNT DISCONNECT
==================================================

Phase 7 behavior tetap.

Approval tidak boleh bypass:

account health.

==================================================
79. DASHBOARD AGGREGATION
==================================================

Jika menambahkan:

Pending Review.

Gunakan server aggregation.

Jangan:

fetch all posts client-side.

Filter:

active workspace.

==================================================
80. NOTIFICATION EVENT REGISTRY
==================================================

Audit Phase 13 event architecture.

Tambahkan event tanpa duplicate.

Gunakan naming consistent.

==================================================
81. WEBHOOK EVENT REGISTRY
==================================================

Audit Phase 15 registry.

Tambahkan:

review events.

Pastikan payload:

versionable.

safe.

minimal.

==================================================
82. RELIABILITY
==================================================

Approval tidak membutuhkan monitoring queue.

Namun jika publish guard worker menolak:

unapproved post,

error harus:

safe.

observable.

Tidak expose:

caption.

token.

media URL.

==================================================
83. AUDIT LOG
==================================================

Review history berfungsi sebagai audit log.

Setiap event:

actor.

action.

timestamp.

comment jika ada.

Jangan membuat audit system kedua.

==================================================
84. DELETE POST
==================================================

Jika post deleted:

Review events harus:

cascade

atau existing cleanup strategy.

Audit foreign key behavior.

Jangan meninggalkan orphan.

==================================================
85. WORKSPACE DELETE
==================================================

Review resources harus ikut cleanup workspace.

Gunakan existing workspace delete strategy.

==================================================
86. MEMBER REMOVE
==================================================

Review history tetap.

Actor yang sudah keluar workspace:

historical identity tetap dapat direferensikan secara aman.

Jangan menghapus review history.

==================================================
87. TRANSFER OWNERSHIP
==================================================

Tidak memengaruhi review state.

Permission resolution harus menggunakan role baru.

==================================================
88. INVITATION
==================================================

Tidak memengaruhi review state.

Jangan menambah approval logic ke invitation.

==================================================
89. API RATE LIMIT
==================================================

Audit existing rate limit.

Tambahkan protection jika perlu:

submit review.

approve.

request changes.

Jangan membuat rate limit berlebihan.

Gunakan existing helper.

==================================================
90. CSRF / AUTH
==================================================

Ikuti API security existing.

Jangan membuat auth bypass.

==================================================
91. ERROR SAFETY
==================================================

Jangan expose:

database errors.

SQL.

stack trace.

internal IDs jika existing API tidak expose.

Gunakan safe error.

==================================================
92. LOGGING
==================================================

Jangan log:

caption.

media URL.

token.

credential.

secret.

Log hanya:

event type.

workspace context jika existing logging aman.

post identifier hanya jika existing policy mengizinkan.

==================================================
93. TESTING — UNIT
==================================================

Tambahkan test.

Minimum:

Review state transition.

Draft → In Review.

In Review → Approved.

In Review → Changes Requested.

Changes Requested → Draft / Resubmit.

Approved modification invalidation.

Invalid transition rejected.

==================================================
94. TESTING — AUTHORIZATION
==================================================

Test:

Owner.

Admin.

Editor.

Viewer.


Verify:

Editor submit.

Viewer reject.

Editor approve reject jika policy.

Admin approve.

Owner approve.

Cross workspace reject.

==================================================
95. TESTING — SELF APPROVAL
==================================================

Test:

Creator submit review.

Creator attempts approve.

Expected:

403

atau policy error.

Admin other user approve:

success.

==================================================
96. TESTING — OWNERSHIP
==================================================

Workspace A:

post.

Workspace B:

review request.

Expected:

404 atau 403 sesuai existing security convention.

Tidak boleh leak existence.

==================================================
97. TESTING — RACE CONDITION
==================================================

Test conceptual concurrency.

Contoh:

Approve.

Request Changes.

Current state berubah.

Second transition:

409.

==================================================
98. TESTING — IDEMPOTENCY
==================================================

Submit review dua kali.

Tidak boleh menghasilkan:

duplicate review event.

Approve dua kali.

Tidak boleh menghasilkan:

duplicate approval event.

==================================================
99. TESTING — PUBLISH GUARD
==================================================

Post:

in_review.

Attempt Publish.

Expected reject.

Attempt Schedule.

Expected reject.

Post:

approved.

Publish allowed.

Post:

not_required.

Existing publish allowed.

==================================================
100. TESTING — EDIT INVALIDATION
==================================================

Approved post.

Edit caption.

Expected:

approval invalidated.

Approved post.

Edit media.

Expected:

approval invalidated.

Approved post.

Change account.

Expected policy result.

==================================================
101. TESTING — NOTIFICATIONS
==================================================

Test:

Submit review notification.

Approval notification.

Changes requested notification.

Dedup behavior jika applicable.

No duplicate spam.

==================================================
102. TESTING — WEBHOOK
==================================================

Test:

review requested event.

approved event.

changes requested event.

Payload safe.

Webhook queue existing digunakan.

==================================================
103. TESTING — RLS
==================================================

Test atau verify:

Workspace A cannot read review:

Workspace B.

Workspace member access sesuai policy.

==================================================
104. TESTING — REGRESSION
==================================================

Pastikan existing:

Draft.

Publish.

Schedule.

Calendar.

History.

Retry.

Cancel.

Template.

Duplicate.

Media.

Analytics.

Notifications.

Webhooks.

Workspace.

Accounts.

OAuth.

Queue.

Worker.

tetap bekerja.

==================================================
105. UI TESTING
==================================================

Jika project memiliki component test:

tambahkan:

Review status.

Submit button.

Approve button permission.

Request changes dialog.

Timeline rendering.

==================================================
106. TYPE SAFETY
==================================================

Jangan gunakan:

any

tanpa alasan.

Gunakan inferred types.

Drizzle types.

Schema validation.

==================================================
107. FILE ORGANIZATION
==================================================

Kemungkinan struktur:

src/lib/domain/

reviews.ts


src/lib/validation/

review-schemas.ts


src/components/posts/review/

review-panel.tsx

review-status-badge.tsx

review-timeline.tsx

review-actions.tsx


src/app/api/posts/[id]/

review/

submit-review/

approve/

request-changes/


Sesuaikan dengan existing route convention.

Jangan duplicate architecture.

==================================================
108. DOKUMENTASI
==================================================

Buat:

docs/PHASE-16A-CONTENT-APPROVAL-WORKFLOW.md


Dokumentasi harus menjelaskan:

Architecture.

State machine.

Permissions.

API.

Database.

RLS.

Notifications.

Webhooks.

Security.

Approval invalidation.

Backward compatibility.

Known limitations.

==================================================
109. API DOCS
==================================================

Update:

docs/API-INTERNAL.md

Tambahkan:

GET review.

Submit review.

Approve.

Request changes.

Errors.

Permissions.

State rules.

==================================================
110. MASTER PLAN
==================================================

Jangan mengubah:

Master Plan

kecuali user secara eksplisit meminta.

Master Plan dianggap:

planning document.

==================================================
111. MIGRATION SAFETY
==================================================

Sebelum migration:

Audit migration terakhir.

Gunakan nomor berikutnya.

Jangan rename migration lama.

Jangan edit applied migration.

==================================================
112. LIVE DATABASE
==================================================

Jika:

db:migrate

gagal karena:

environment.

sandbox.

connection.

Jangan mengklaim migration sudah diterapkan live.

Laporkan:

- migration generated
- local/PGlite validation
- live migration status

secara jujur.

==================================================
113. JANGAN MELAKUKAN INI
==================================================

Jangan:

- rewrite seluruh posts domain
- rewrite worker
- rewrite queue
- rewrite notification system
- rewrite webhook system
- mengganti permission architecture
- mengganti database ORM
- mengubah RLS existing tanpa alasan
- membuat approval system terpisah dari workspace
- menyimpan token
- expose credential
- membuat approval wajib untuk existing post
- membuat frontend authorization sebagai satu-satunya protection
- membuat status publishing baru jika approval state terpisah lebih aman

==================================================
114. IMPLEMENTATION ORDER
==================================================

Kerjakan dengan urutan:

STEP 1

Audit existing:

posts.

draft.

permissions.

authorization.

workspace.

notifications.

webhooks.

queue.

worker.

schema.

migrations.


STEP 2

Tentukan:

approval architecture.


STEP 3

Implement:

database schema.


STEP 4

Generate:

Drizzle migration.


STEP 5

Implement:

Supabase RLS.


STEP 6

Implement:

permissions.


STEP 7

Implement:

state machine.


STEP 8

Implement:

domain layer.


STEP 9

Integrate:

post edit invalidation.


STEP 10

Implement:

publish guard.


STEP 11

Implement:

API.


STEP 12

Integrate:

notifications.


STEP 13

Integrate:

webhooks.


STEP 14

Integrate:

worker defense.


STEP 15

Implement:

UI.


STEP 16

Add:

Dashboard summary jika efisien.


STEP 17

Testing.


STEP 18

Validation.

==================================================
115. VALIDATION WAJIB
==================================================

Jalankan:

npm run lint

npm run typecheck

npm test

npm run test:integration

atau:

npm run test:all

sesuai repository.


Jalankan:

npm run build


Jalankan:

git diff --check


Jika tersedia:

npm run db:generate

Jalankan migration validation existing.

==================================================
116. JIKA VALIDATION GAGAL
==================================================

Jangan langsung mengubah unrelated code.

Identifikasi:

apakah error:

baru

atau:

pre-existing.

Perbaiki hanya error yang disebabkan Phase 16A.

Jika error pre-existing:

laporkan.

==================================================
117. COMMIT
==================================================

JANGAN:

git commit.

JANGAN:

git push.

Kecuali user meminta.

==================================================
118. FINAL REPORT
==================================================

Setelah selesai laporkan:

# PHASE 16A COMPLETE

Dengan struktur:

1.

SUMMARY


2.

APPROVAL ARCHITECTURE


3.

DATABASE CHANGES


4.

STATE MACHINE


5.

PERMISSIONS


6.

API


7.

UI


8.

NOTIFICATIONS


9.

WEBHOOKS


10.

QUEUE / WORKER SAFETY


11.

RLS


12.

SECURITY


13.

TESTS


14.

VALIDATION


15.

MIGRATION STATUS


16.

FILES CHANGED


17.

BACKWARD COMPATIBILITY


18.

KNOWN LIMITATIONS


19.

GIT STATUS


==================================================
119. SUCCESS CRITERIA
==================================================

Phase 16A dianggap berhasil jika:

Draft dapat:

Submit for Review.


Reviewer dapat:

Approve.


Reviewer dapat:

Request Changes.


Editor dapat:

Edit.

Resubmit.


Approved content dapat:

Publish.

Schedule.


Unapproved content:

tidak dapat publish jika approval workflow aktif.


Existing posts:

tetap publish tanpa approval.


Approval invalidated ketika content berubah.


Permissions:

server-side enforced.


Workspace isolation:

aman.


Notifications:

berfungsi.


Webhook events:

berfungsi.


Worker:

defense in depth.


No secret leakage.


No cross-workspace access.


No duplicate review events.


Race conditions ditangani.


Lint:

PASS.


Typecheck:

PASS.


Tests:

PASS.


Build:

PASS.


git diff --check:

PASS.


Tidak ada commit.

Tidak ada push.


==================================================
120. PRIORITAS UTAMA
==================================================

Prioritas implementasi:

1.

Security


2.

Workspace isolation


3.

Correct state machine


4.

Backward compatibility


5.

Server authorization


6.

Approval invalidation


7.

Publish guard


8.

Audit history


9.

Notifications


10.

Webhooks


11.

UI


12.

Dashboard enhancement


Jangan mengorbankan arsitektur existing demi fitur cepat.

Audit terlebih dahulu sebelum implementasi.

Gunakan pola existing AutoPost-v1.

Implementasikan Phase 16A secara production-oriented,
minimal,
aman,
workspace-aware,
dan extensible untuk:

PHASE 16B

Content Pipeline / Kanban Workflow

dan:

PHASE 16C

Automation Rules Engine.