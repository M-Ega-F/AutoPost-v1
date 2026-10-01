Saya ingin melakukan LAYOUT & UI COMPOSITION REWORK pada AutoPost.

TUJUAN UTAMA:

Membuat layout AutoPost mendekati reference design yang diberikan sebelumnya.

REFERENCE DESIGN:
Gunakan gambar reference yang diberikan user sebagai sumber visual utama.

Target visual secara umum:

- SaaS dashboard modern
- clean
- compact
- information-dense tetapi tidak berantakan
- sidebar tetap
- content area terstruktur
- cards tersusun dalam grid
- dashboard menggunakan hierarchy yang jelas
- form Create Post menggunakan multi-column layout pada desktop
- detail/content area dan supporting panels berada dalam grid yang rapi
- whitespace cukup tetapi tidak boros
- semua komponen terasa berada dalam satu design system

PENTING:

INI ADALAH LAYOUT REWORK SAJA.

JANGAN mengubah business logic.

JANGAN mengubah data flow.

JANGAN mengubah API.

JANGAN mengubah server actions.

JANGAN mengubah database.

JANGAN mengubah schema.

JANGAN membuat migration.

JANGAN mengubah authentication.

JANGAN mengubah OAuth.

JANGAN mengubah provider.

JANGAN mengubah queue/BullMQ.

JANGAN mengubah worker.

JANGAN mengubah publishing flow.

JANGAN mengubah validation/business rules.

JANGAN mengubah multi-account selection behavior.

JANGAN mengubah performance optimization yang sudah ada.

JANGAN mengubah color system yang baru saja selesai.

JANGAN mengubah Master Plan:

.agents/plans/Master Plan.md

JANGAN commit.

JANGAN push.

==================================================
1. PRINSIP UTAMA
==================================================

Kita ingin:

EXISTING LOGIC
      +
EXISTING COMPONENTS
      +
EXISTING DATA
      +
EXISTING COLOR SYSTEM
      ↓
NEW VISUAL COMPOSITION

Bukan:

REWRITE APPLICATION.

Gunakan komponen yang sudah ada sebanyak mungkin.

Jika komponen sudah memiliki business logic:
JANGAN rewrite logic tersebut.

Jika perlu memindahkan komponen:
ubah composition/layout parent-nya.

==================================================
2. REFERENCE LAYOUT
==================================================

Reference memiliki karakter visual seperti:

┌────────────────┬──────────────────────────────────────────┐
│                │ Header / Search / User                   │
│                ├──────────────────────────────────────────┤
│    SIDEBAR     │ Page Header                              │
│                │                                          │
│ Dashboard      │ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────┐ │
│ Create Post    │ │ Metric │ │ Metric │ │ Metric │ │ ... │ │
│ Scheduled      │ └────────┘ └────────┘ └────────┘ └─────┘ │
│ History        │                                          │
│ Media Library  │ ┌────────────────┐ ┌──────────┐ ┌──────┐ │
│ Review         │ │ Performance    │ │ Platform │ │Recent│ │
│ Accounts       │ │ Chart          │ │          │ │Posts │ │
│ Settings       │ │                │ │          │ │      │ │
│                │ └────────────────┘ └──────────┘ └──────┘ │
│                │                                          │
│ Workspace      │ ┌────────────────┐ ┌────────────────────┐ │
│ User           │ │ Accounts       │ │ Media Library      │ │
│                │ │ Connected      │ │                    │ │
└────────────────┴──────────────────────────────────────────┘

Jangan copy pixel secara buta.

Yang harus dipertahankan adalah:

- hierarchy
- proportions
- alignment
- spacing rhythm
- card grouping
- visual density
- responsive behavior

==================================================
3. GLOBAL APP SHELL
==================================================

Pertahankan existing AppLayout / application shell.

Desktop target:

SIDEBAR
+
MAIN CONTENT

Sidebar:

- fixed/sticky sesuai architecture existing
- compact
- tidak terlalu lebar
- navigation tersusun vertikal
- logo di bagian atas
- workspace/account switcher di bagian bawah
- navigation grouping jelas

Jangan mengubah routing.

Jangan mengubah navigation item.

Jangan menambah menu baru.

Jangan menghapus menu.

Hanya ubah:

- width
- spacing
- alignment
- grouping
- visual density
- positioning

sesuai reference.

==================================================
4. SIDEBAR DESKTOP
==================================================

Target visual:

Sidebar sekitar 160–190px pada desktop,
tetapi tentukan nilai final berdasarkan existing viewport dan reference.

Jangan membuat sidebar terlalu lebar.

Struktur:

LOGO

Dashboard
Create Post
Scheduled
History
Media Library
Review
Accounts
Settings

--------------------------------

Workspace selector

User selector

Navigation item:

icon + label.

Active item:
gunakan existing color system.

Jangan mengubah icon.

Jangan mengubah icon library.

Jangan mengubah navigation behavior.

==================================================
5. MAIN CONTENT CONTAINER
==================================================

Main content harus menggunakan max-width/container yang konsisten.

Jangan biarkan content terlalu melebar pada monitor besar.

Target:

- horizontal padding konsisten
- vertical rhythm konsisten
- section gap konsisten
- card alignment konsisten

Semua major section harus memiliki left/right alignment yang sama.

Jangan membuat:

section A:
padding 20

section B:
padding 32

section C:
padding 12

secara random.

Gunakan spacing system existing.

==================================================
6. HEADER
==================================================

Header mengikuti reference:

LEFT:
search

CENTER:
optional empty space

RIGHT:
notifications
user/avatar
user name
workspace/account context

Header tidak boleh terlalu tinggi.

Jangan mengubah functionality search.

Jangan mengubah notification logic.

Jangan mengubah user menu.

Hanya composition dan spacing.

==================================================
7. DASHBOARD LAYOUT
==================================================

Dashboard adalah halaman yang paling penting.

Gunakan hierarchy:

1. Page greeting/header
2. Metric cards
3. Analytics / performance
4. Platform overview
5. Recent posts
6. Connected accounts
7. Media library

==================================================
8. DASHBOARD HEADER
==================================================

Target:

Selamat pagi, John 👋

subheading di bawahnya.

Date/filter/action berada di sisi kanan.

Desktop:

┌─────────────────────────────────────────────┐
│ Greeting                         Date/Filter│
└─────────────────────────────────────────────┘

Mobile:

Greeting
Date/filter
stacked.

Jangan mengubah data greeting.

Jangan mengubah date logic.

==================================================
9. METRIC CARDS
==================================================

Reference menggunakan 4 metric cards horizontal pada desktop.

Contoh:

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Total Post │ │ Terjadwal  │ │ Berhasil   │ │ Gagal      │
│ 24         │ │ 8          │ │ 21         │ │ 1          │
│ +12%       │ │ +33%       │ │ +17%       │ │ -50%       │
└────────────┘ └────────────┘ └────────────┘ └────────────┘

Desktop:
4 columns.

Tablet:
2 columns.

Mobile:
1 column.

Jangan mengubah metric data.

Jangan mengubah calculation.

Jangan mengubah status.

Hanya layout.

==================================================
10. DASHBOARD SECONDARY GRID
==================================================

Reference menggunakan asymmetric grid.

Target:

Performance:
large

Platform:
medium

Recent Posts:
medium

Contoh:

┌──────────────────────────┬──────────────┬──────────────┐
│                          │              │              │
│ Performance Posting     │ Platform     │ Post Terbaru │
│                          │              │              │
│ Chart                    │              │              │
│                          │              │              │
└──────────────────────────┴──────────────┴──────────────┘

Performance harus mendapatkan area terbesar.

Platform dan Recent Posts lebih compact.

Gunakan CSS Grid.

Jangan membuat semuanya 1/3 jika reference menunjukkan hierarchy yang berbeda.

==================================================
11. PERFORMANCE CARD
==================================================

Chart berada di dalam card yang cukup besar.

Header:

Performance Postingan
+
date range/filter

Metric summary dapat berada di bagian atas.

Chart berada di bawah.

Jangan mengubah:

- chart data
- query
- analytics logic
- chart calculations

Hanya:

- container
- width
- height
- internal spacing
- alignment

Dark mode chart tetap GREEN sesuai color system yang sudah dibuat.

Light mode chart tetap Indigo.

==================================================
12. PLATFORM CARD
==================================================

Platform overview harus compact.

Contoh:

TikTok       ↑ 33%
Instagram    ↑ 18%
Facebook     ↑ 12%
YouTube      ↑ 6%
Threads      ↑ 9%

Platform icon di kiri.

Metric di kanan.

Jangan mengubah platform data.

Jangan mengubah provider.

Jangan mengubah account query.

==================================================
13. RECENT POSTS
==================================================

Recent Posts menjadi vertical list compact.

Setiap item:

thumbnail
+
title
+
time
+
status

Contoh:

[IMG]  Nikmati keindahan alam...
       2 jam yang lalu        Berhasil

[IMG]  Tips produktif bekerja...
       5 jam yang lalu        Berhasil

Jangan mengubah history data.

Jangan mengubah status logic.

Hanya layout.

==================================================
14. LOWER DASHBOARD GRID
==================================================

Reference:

┌────────────────────────┬──────────────────────────────┐
│ Akun Terhubung         │ Media Library                │
│                        │                              │
│ TikTok                 │ [IMG] [IMG] [IMG] [IMG]     │
│ Instagram              │                              │
│ Facebook               │                              │
│ Threads                │                              │
└────────────────────────┴──────────────────────────────┘

Connected Accounts:
compact.

Media Library:
lebih lebar.

Gunakan asymmetric grid.

==================================================
15. CONNECTED ACCOUNTS
==================================================

Tetap mendukung MULTI-ACCOUNT.

JANGAN mengubah behavior yang baru saja diimplementasikan.

Contoh:

TikTok
  @account1
  @account2

Instagram
  @account1

Layout harus compact.

Jika banyak account:
gunakan vertical list.

Jangan menghapus account.

Jangan collapse account menjadi satu.

Jangan mengubah account query.

==================================================
16. MEDIA LIBRARY
==================================================

Gunakan horizontal grid.

Desktop:

[IMG] [IMG] [IMG] [IMG] [IMG]

Setiap media:

thumbnail
filename
size
selection indicator

Jangan mengubah:

- media fetching
- signed URL
- lazy loading
- selection state
- upload
- delete
- pagination

Hanya layout.

==================================================
17. CREATE POST LAYOUT
==================================================

Ini adalah halaman kedua yang sangat penting.

Reference menggunakan:

LEFT:
content/media

RIGHT:
settings/platforms/schedule

Target desktop:

┌────────────────────────────────┬─────────────────────────┐
│                                │                         │
│ Content                        │ Settings                │
│                                │                         │
│ Text                           │ Campaign                │
│                                │                         │
│ Media                          │ Platform & Account      │
│                                │                         │
│ Media picker                   │ Schedule                │
│                                │                         │
└────────────────────────────────┴─────────────────────────┘

Target sekitar:

60–65%:
content/media

35–40%:
settings/targeting

Jangan mengubah form behavior.

Jangan mengubah form state.

Jangan mengubah target payload.

Jangan mengubah multi-account selection.

==================================================
18. CREATE POST STEPPER
==================================================

Reference memiliki progress indicator:

1 Konten
2 Platform
3 Jadwal

Pertahankan existing functionality jika sudah ada.

Jika existing stepper belum memiliki behavior tertentu:
JANGAN membuat business logic baru.

Hanya visual/layout.

Stepper harus compact.

Desktop:
horizontal.

Mobile:
horizontal compact atau stacked sesuai existing responsive system.

==================================================
19. CREATE POST CONTENT PANEL
==================================================

Content textarea menjadi dominant element.

Structure:

Card header
Text input
character counter
Media section
Media preview/upload

Jangan membuat card terlalu tinggi jika tidak diperlukan.

Gunakan vertical rhythm konsisten.

==================================================
20. PLATFORM & ACCOUNT SELECTOR
==================================================

Tetap menggunakan multi-account selection yang baru.

Layout:

Platform
  ☑ TikTok account A
  ☐ TikTok account B

Instagram
  ☑ Instagram account A

Facebook
  ☐ Page A
  ☑ Page B

Jangan mengubah selection logic.

Jangan mengubah target payload.

Jangan mengubah validation.

Hanya layout dan visual hierarchy.

==================================================
21. CREATE POST SETTINGS
==================================================

Right column:

Campaign
Platform & Account
Schedule

Urutan mengikuti reference.

Jangan membuat settings menjadi full-width jika desktop.

Desktop:
sticky/independent column hanya jika existing architecture aman.

Jangan menambahkan JS scroll logic hanya untuk layout.

Jika CSS sticky cukup:
gunakan CSS.

==================================================
22. POST DETAIL
==================================================

Reference menggunakan content detail dalam card.

Target:

┌─────────────────────────────────────┐
│ Status / Date                       │
│                                     │
│ Media Preview                       │
│                                     │
│ Caption                             │
│                                     │
│ Metrics                             │
├─────────────────────────────────────┤
│ Platform / Media / History / Comment│
│                                     │
│ Platform list                       │
└─────────────────────────────────────┘

Jangan mengubah tabs behavior.

Jangan mengubah data fetching.

Jangan mengubah analytics.

Jangan mengubah approval.

Hanya composition.

==================================================
23. REVIEW / APPROVAL
==================================================

Review panel tetap menggunakan dynamic loading/performance optimization yang sudah ada.

Jangan membuat Review Panel eager lagi.

Layout:

Main content
+
supporting review panel

Desktop:
2-column.

Mobile:
stack.

Jangan mengubah loading behavior.

==================================================
24. HISTORY
==================================================

History harus menggunakan layout:

Page header
Filter/search
List/table
Pagination

Desktop:
filter toolbar horizontal.

Content:
wide table/list.

Mobile:
horizontal scroll atau card representation berdasarkan existing implementation.

Jangan mengubah pagination logic.

Jangan mengubah query.

Jangan mengubah filtering logic.

==================================================
25. SCHEDULED
==================================================

Layout:

Header
Filter
Scheduled post list/calendar

Jika calendar existing:
jangan mengganti library.

Hanya:

- sizing
- spacing
- placement
- card composition

==================================================
26. ACCOUNTS
==================================================

Connected Accounts page harus menampilkan multiple accounts dengan jelas.

Contoh:

TikTok
┌──────────────────────────────┐
│ @account1          Connected │
│ @account2          Connected │
└──────────────────────────────┘

Instagram
...

Jangan collapse accounts.

Jangan mengubah OAuth.

Jangan mengubah connect/disconnect logic.

==================================================
27. SETTINGS
==================================================

Settings menggunakan:

Sidebar/tab navigation
+
content panel

Desktop:

┌───────────────┬───────────────────────────────┐
│ Settings nav  │ Settings content              │
│               │                               │
└───────────────┴───────────────────────────────┘

Mobile:
stack/selector.

Jangan mengubah settings behavior.

==================================================
28. RESPONSIVE DESIGN
==================================================

WAJIB.

Reference utama adalah desktop.

Tetapi layout harus tetap usable:

Desktop:
>= 1280

Tablet:
768–1279

Mobile:
<768

Desktop:

Sidebar visible.

Multi-column grid.

Tablet:

Sidebar tetap mengikuti existing responsive behavior.

Grid menjadi 2 columns bila sesuai.

Mobile:

Sidebar menjadi existing mobile navigation mechanism.

Jangan membuat sidebar desktop memaksa layar mobile.

Dashboard:

4 metrics
→ 2
→ 1

Main dashboard grid:
3 areas
→ 2
→ 1

Create Post:
2 columns
→ 1 column

Post detail:
2 columns
→ 1 column

Jangan mengubah mobile navigation logic.

==================================================
29. SPACING SYSTEM
==================================================

Gunakan spacing system existing.

Target visual reference:

- compact cards
- section gap konsisten
- content padding konsisten
- card internal padding konsisten

Jangan menggunakan arbitrary values di setiap component.

Jika project sudah memiliki Tailwind spacing scale:
gunakan scale tersebut.

==================================================
30. BORDER RADIUS
==================================================

Jangan mengubah radius yang sudah ditetapkan color-system redesign sebelumnya.

Gunakan existing radius tokens.

Reference menggunakan rounded cards tetapi bukan excessive rounded/pill UI.

Jangan membuat semua component menjadi pill.

==================================================
31. SHADOW
==================================================

Color redesign sebelumnya sudah menghapus excessive glow/shadow.

Pertahankan.

Gunakan shadow hanya jika existing component/design system memang memerlukannya.

Jangan menambahkan:

- glow
- neon shadow
- colored shadow
- glassmorphism

==================================================
32. GRID ALIGNMENT
==================================================

Ini WAJIB diperhatikan.

Semua card pada row yang sama harus align.

Contoh:

Metric cards:
same height.

Performance / Platform / Recent:
top aligned.

Connected Accounts / Media Library:
top aligned.

Jangan membuat card random height kecuali content memang membutuhkan.

Gunakan:

grid-auto-rows
minmax
stretch

jika sesuai.

==================================================
33. PAGE DENSITY
==================================================

Reference bukan dashboard yang sangat spacious.

Target:
COMPACT PROFESSIONAL SaaS.

Jangan membuat:

- terlalu banyak whitespace
- card terlalu tinggi
- heading terlalu besar
- excessive padding

Tetapi juga jangan terlalu padat sampai sulit dibaca.

==================================================
34. NO NEW DESIGN LANGUAGE
==================================================

Jangan menciptakan design language baru.

Gunakan:

EXISTING COLOR SYSTEM
+
REFERENCE LAYOUT
+
EXISTING COMPONENTS

==================================================
35. AUDIT SEBELUM IMPLEMENTASI
==================================================

Sebelum edit:

1. Audit AppLayout.
2. Audit Dashboard.
3. Audit Create Post.
4. Audit History.
5. Audit Scheduled.
6. Audit Media Library.
7. Audit Accounts.
8. Audit Settings.
9. Audit Review.
10. Audit Post Detail.

Cari existing:

- grid
- flex
- containers
- cards
- page wrappers
- responsive breakpoints
- sidebar
- header
- content widths

Jangan langsung rewrite.

Tentukan perubahan minimum yang diperlukan agar visual mendekati reference.

==================================================
36. COMPONENT REUSE
==================================================

Prioritas:

existing component
>
existing composition
>
CSS/layout adjustment
>
new component

Jangan membuat duplicate component jika existing component dapat dipakai.

==================================================
37. BUSINESS LOGIC PROTECTION
==================================================

Jangan mengubah:

- props meaning
- server action calls
- API calls
- query
- mutation
- state semantics
- validation
- target resolution
- publishing
- scheduling
- account selection
- campaign logic

Jika perlu memindahkan component:

pastikan props dan behavior tetap sama.

==================================================
38. PERFORMANCE PROTECTION
==================================================

Pertahankan optimasi yang baru saja dibuat.

JANGAN menghilangkan:

- parallel data loading
- lazy image loading
- decoding async
- dynamic Review Panel chunk

Jangan membuat layout baru yang menyebabkan:

- duplicate data fetch
- duplicate component mount
- unnecessary client component
- hydration overhead

Gunakan CSS layout jika memungkinkan.

==================================================
39. ACCESSIBILITY
==================================================

Layout baru harus mempertahankan:

- keyboard navigation
- focus state
- semantic HTML
- aria labels
- button semantics
- form labels

Jangan mengorbankan accessibility demi visual.

==================================================
40. VISUAL ACCEPTANCE CRITERIA
==================================================

Dashboard harus secara visual mendekati reference:

LEFT:
sidebar

TOP:
header/search/user

MAIN:

Greeting
↓
4 metric cards
↓
Performance + Platform + Recent Posts
↓
Connected Accounts + Media Library

Create Post:

LEFT:
Content + Media

RIGHT:
Campaign + Platform & Account + Schedule

Post Detail:

Main detail
+
platform/media/history/comment sections

Overall:

- compact
- clean
- aligned
- modern SaaS
- information dense
- consistent
- no random card sizes
- no random spacing

==================================================
41. COLOR SYSTEM MUST REMAIN
==================================================

Gunakan color system yang baru saja selesai.

LIGHT:

White
Slate
Indigo

DARK:

Navy
Slate
Indigo

DARK CHART:

Green

JANGAN membuat color system baru.

JANGAN mengubah token warna.

JANGAN mengganti green chart kembali menjadi indigo.

==================================================
42. VALIDATION
==================================================

Setelah selesai:

npm run lint

npm run typecheck

npm test

npm run test:integration

npm run test:all

npm run build

git diff --check

Semua harus PASS.

Jika ada failure:
jangan disable test.

==================================================
43. VISUAL VERIFICATION
==================================================

Lakukan visual verification minimal pada:

/login
/dashboard
/create-post
/scheduled
/history
/history detail
/media-library
/connected-accounts
/settings
/review

Verifikasi:

LIGHT MODE
+
DARK MODE

Pastikan:

- sidebar
- header
- cards
- grids
- tables
- forms
- account selector
- modal
- chart
- media
- responsive

tidak rusak.

Jika authenticated route membutuhkan session:
gunakan existing development/authenticated environment.

==================================================
44. IMPORTANT: REFERENCE IMAGE
==================================================

Reference image yang diberikan user adalah visual reference.

Gunakan reference tersebut untuk menilai:

- proportions
- card grouping
- hierarchy
- density
- alignment
- sidebar
- dashboard grid
- create-post composition
- detail layout

Tetapi jangan menyalin:

- data
- nama user
- metrics
- platform data
- text
- business content

Reference hanya untuk VISUAL DESIGN.

==================================================
45. OUT OF SCOPE
==================================================

JANGAN melakukan:

- database optimization
- API optimization
- query optimization
- business logic refactor
- provider refactor
- queue refactor
- worker refactor
- authentication refactor
- OAuth refactor
- schema change
- migration
- dependency upgrade
- package replacement
- component library replacement
- typography redesign
- logo redesign
- icon redesign
- color system redesign

==================================================
46. FINAL REPORT
==================================================

Setelah implementasi:

# LAYOUT REWORK IMPLEMENTATION REPORT

## 1. Files Changed

Daftar file.

## 2. Files Not Changed

Konfirmasi:

- provider
- queue
- worker
- API
- server actions
- database
- schema
- migration
- auth
- OAuth
- business logic

## 3. Pages Updated

Checklist:

- [ ] App shell
- [ ] Dashboard
- [ ] Create Post
- [ ] Scheduled
- [ ] History
- [ ] History Detail
- [ ] Media Library
- [ ] Connected Accounts
- [ ] Settings
- [ ] Review
- [ ] Post Detail

## 4. Layout Changes

Jelaskan perubahan:

- sidebar
- header
- dashboard grid
- metric cards
- analytics
- platform card
- recent posts
- connected accounts
- media library
- create post columns
- post detail
- responsive behavior

## 5. Logic Safety

Konfirmasi:

"No business logic was changed."

## 6. Color Safety

Konfirmasi:

"Existing color system was preserved."

## 7. Performance Safety

Konfirmasi:

"Existing performance optimizations were preserved."

## 8. Responsive

Laporkan desktop/tablet/mobile verification.

## 9. Tests

Report:

lint
typecheck
unit
integration
test:all
build
diff-check

## 10. Migration

"No migration created."

## 11. Git

"No commit or push performed."

==================================================
FINAL ABSOLUTE RULE
==================================================

REFERENCE IMAGE
=
VISUAL LAYOUT SOURCE OF TRUTH.

EXISTING CODE
=
BUSINESS LOGIC SOURCE OF TRUTH.

Jangan mencampur keduanya.

Gunakan reference untuk mengubah:

LAYOUT
SPACING
GRID
ALIGNMENT
POSITIONING
DENSITY
RESPONSIVE COMPOSITION

Gunakan existing code untuk mempertahankan:

LOGIC
DATA
BEHAVIOR
STATE
API
AUTH
PUBLISHING
SCHEDULING
ACCOUNT SELECTION
QUEUE
WORKER
PROVIDER

Hasil akhir harus terasa seperti versi AutoPost yang sama,
tetapi dengan layout dan visual composition yang jauh lebih dekat dengan reference.

JANGAN commit.
JANGAN push.
JANGAN ubah Master Plan.