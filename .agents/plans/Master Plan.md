Saya ingin melakukan REWORK TOTAL COLOR SYSTEM pada AutoPost.

TUJUAN:
Menyamakan seluruh warna UI AutoPost dengan reference design yang diberikan.

PENTING:
Ini adalah COLOR SYSTEM REWORK SAJA.

JANGAN mengubah:
- business logic
- data fetching
- server actions
- API
- database
- schema
- migration
- authentication
- authorization
- OAuth
- queue
- BullMQ
- worker
- provider
- publishing flow
- validation logic
- state management
- routing
- URL
- layout structure
- component hierarchy
- spacing
- sizing
- typography
- responsive behavior
- animation behavior

JANGAN melakukan redesign layout.

JANGAN membuat komponen UI baru kecuali benar-benar diperlukan untuk mengganti token warna pada existing component.

JANGAN mengubah Master Plan:

.agents/plans/Master Plan.md

JANGAN commit.
JANGAN push.

==================================================
REFERENCE DESIGN
==================================================

Gunakan gambar reference yang diberikan sebagai SOURCE OF TRUTH VISUAL:

Light Mode:
- clean white background
- very light slate surfaces
- indigo primary
- dark navy text
- subtle slate borders
- semantic colors untuk status

Dark Mode:
- deep navy background
- dark slate surfaces
- indigo primary/accent
- muted slate text
- subtle dark borders
- GREEN khusus untuk analytics/performance chart
- green dapat digunakan sebagai active/positive accent yang memang terlihat pada reference
- jangan mengubah seluruh dark mode menjadi green theme

Visual target:

LIGHT MODE
White / near-white UI
        ↓
Indigo primary
        ↓
Slate text/border
        ↓
Green / orange / red hanya untuk semantic states

DARK MODE
Deep navy background
        ↓
Dark slate surfaces
        ↓
Indigo primary
        ↓
GREEN analytics/chart accent
        ↓
Semantic status colors

==================================================
TARGET COLOR TOKENS
==================================================

Gunakan token-based system.

Jangan menyebarkan hardcoded hex color ke seluruh component.

Semua warna harus berasal dari centralized design tokens / CSS variables / Tailwind theme yang sudah digunakan project.

Jika codebase sudah memiliki shadcn/ui token system:
GUNAKAN DAN PERBARUI SYSTEM TERSEBUT.

Jangan membuat color system kedua yang paralel.

--------------------------------------------------
LIGHT MODE
--------------------------------------------------

Target palette:

Primary:
#4F46E5

Primary hover:
#4338CA

Primary light / subtle:
gunakan tint Indigo yang sangat ringan dan konsisten dengan primary.

Background:
#F8FAFC

Surface / Card:
#FFFFFF

Surface Alt:
#F1F5F9

Foreground / Text:
#0F172A

Muted Text:
#64748B

Border:
#E2E8F0

Input background:
#FFFFFF

Ring / Focus:
#4F46E5

Info:
#2563EB

Success:
#16A34A

Warning:
#D97706

Danger / Destructive:
#DC2626

--------------------------------------------------
DARK MODE
--------------------------------------------------

Target palette:

Background:
#0F172A

Surface:
#111827

Surface Alt:
#1E293B

Foreground / Text:
#F8FAFC

Muted Text:
#94A3B8

Border:
#334155

Primary:
#6366F1

Primary Hover:
gunakan indigo yang sedikit lebih terang/kuat daripada primary.

Primary subtle:
gunakan translucent/tinted indigo yang tetap readable pada navy.

Ring / Focus:
#6366F1

Info:
#3B82F6

Success:
#22C55E

Warning:
#F59E0B

Danger:
#EF4444

==================================================
DARK MODE ANALYTICS / GRAPH
==================================================

INI WAJIB.

Untuk chart/performance graph pada DARK MODE:

gunakan HIJAU sebagai warna utama data visualization.

Target utama:

#22C55E

Jika membutuhkan secondary green:
gunakan variasi green yang masih berada dalam keluarga warna yang sama.

Contoh:

Primary graph:
#22C55E

Secondary graph:
#10B981

Graph area/fill:
gunakan translucent green.

JANGAN menggunakan indigo sebagai line chart utama pada dark mode.

Light mode tetap boleh menggunakan Indigo untuk graph sesuai reference.

Jadi:

LIGHT:
chart → Indigo

DARK:
chart → Green

==================================================
COLOR SEMANTICS
==================================================

Pertahankan semantic meaning.

SUCCESS:
green

WARNING:
orange/amber

ERROR:
red

INFO:
blue

Jangan mengganti semantic colors menjadi indigo hanya demi konsistensi brand.

Contoh:

Berhasil:
green

Gagal:
red

Peringatan:
orange

Informasi:
blue

Brand / action:
indigo

Analytics dark:
green

==================================================
SHADCN/UI
==================================================

Audit semua komponen shadcn/ui yang digunakan.

Update color tokens secara centralized.

Periksa minimal:

- Button
- Badge
- Card
- Input
- Textarea
- Select
- Dropdown Menu
- Dialog
- Alert Dialog
- Sheet
- Popover
- Tooltip
- Tabs
- Checkbox
- Radio Group
- Switch
- Progress
- Separator
- Table
- Calendar
- Command
- Toast / Sonner
- Alert
- Skeleton
- Form
- Label
- Breadcrumb
- Pagination
- Avatar

Jangan membuat setiap component memiliki warna sendiri.

Gunakan token:

background
foreground
primary
primary-foreground
secondary
secondary-foreground
muted
muted-foreground
accent
accent-foreground
destructive
destructive-foreground
border
input
ring

Jika codebase menggunakan token tambahan:
pertahankan dan mapping ke palette baru.

==================================================
SIDEBAR
==================================================

JANGAN mengubah ukuran/layout sidebar.

Hanya ubah warna.

LIGHT MODE:

Sidebar:
#FFFFFF / surface

Text:
#0F172A

Muted navigation:
#64748B

Active navigation:
very light indigo background

Active text/icon:
#4F46E5

Hover:
very light indigo/slate

Border:
#E2E8F0

DARK MODE:

Sidebar:
deep navy / dark surface

Text:
#F8FAFC

Muted navigation:
#94A3B8

Active navigation:
gunakan green accent seperti reference jika memang sudah terlihat pada reference.

Active icon/text:
green

Hover:
dark slate

Border:
#334155

PENTING:
Active sidebar green pada dark mode adalah ACCENT, bukan mengganti primary brand menjadi green.

==================================================
BUTTON
==================================================

Primary Button:

LIGHT:
background #4F46E5
foreground white

hover:
#4338CA

DARK:
background #6366F1
foreground white

hover:
lighter/brighter indigo

Secondary:
neutral/slate surface.

Outline:
transparent/background surface
border slate.

Ghost:
transparent
hover slate/indigo subtle.

Success:
green.

Warning:
amber.

Danger:
red.

Jangan membuat semua button green.

==================================================
CARD
==================================================

Card harus tetap clean dan subtle.

LIGHT:

background:
#FFFFFF

border:
#E2E8F0

text:
#0F172A

muted:
#64748B

DARK:

background:
#111827

border:
#334155

text:
#F8FAFC

muted:
#94A3B8

Jangan menggunakan gradient pada card.

Jangan menambahkan glow.

Jangan menambahkan shadow berlebihan.

==================================================
INPUT / TEXTAREA / SELECT
==================================================

LIGHT:

background #FFFFFF
border #E2E8F0
text #0F172A
placeholder #64748B

focus:
indigo border/ring

DARK:

background #111827
border #334155
text #F8FAFC
placeholder #94A3B8

focus:
indigo ring/border

Pastikan disabled state tetap jelas.

==================================================
BADGE
==================================================

Badge harus menggunakan semantic colors.

Contoh:

Aktif:
green subtle background + green text

Terjadwal:
indigo/blue subtle background + indigo/blue text

Draft:
slate subtle

Berhasil:
green

Gagal:
red

Menunggu:
amber

Jangan menggunakan saturated full-background badge kecuali existing component memang membutuhkan contrast tersebut.

==================================================
STATUS
==================================================

Mapping:

published / success
→ green

scheduled
→ indigo / blue

processing
→ indigo / blue

pending
→ slate / blue

failed
→ red

partial_failure
→ amber/orange

cancelled
→ slate

Jangan mengubah status logic.
Hanya visual mapping.

==================================================
TOAST / NOTIFICATION
==================================================

Audit Toast/Sonner.

SUCCESS:
green accent

ERROR:
red accent

WARNING:
amber

INFO:
blue/indigo

Default toast:
surface + border + readable foreground.

Pastikan contrast tetap baik di light dan dark.

==================================================
MODAL / DIALOG / SHEET
==================================================

Jangan mengubah ukuran atau layout.

LIGHT:

surface #FFFFFF
border #E2E8F0
text #0F172A

DARK:

surface #111827
border #334155
text #F8FAFC

Overlay:
gunakan neutral black dengan opacity yang sesuai.

Jangan menggunakan indigo overlay.

==================================================
TABLE
==================================================

LIGHT:

header:
#F8FAFC / #F1F5F9

body:
#FFFFFF

border:
#E2E8F0

hover:
very light slate/indigo

DARK:

header:
#1E293B

body:
#111827

border:
#334155

hover:
dark slate / subtle indigo

Pastikan status badges tetap semantic.

==================================================
ACCOUNT SELECTOR
==================================================

Ini sangat penting karena AutoPost sekarang mendukung MULTI-ACCOUNT SELECTION.

Jangan mengubah behavior.

Jangan mengubah selection state.

Jangan mengubah account query.

Jangan mengubah target logic.

HANYA warna.

LIGHT:

Platform group:
neutral surface

Selected account:
subtle indigo background/border

Checkbox checked:
indigo

Account text:
#0F172A

Account secondary text:
#64748B

DARK:

Platform group:
dark slate

Selected account:
subtle indigo background

Checkbox checked:
indigo

Account text:
#F8FAFC

Secondary:
#94A3B8

Jangan menggunakan green sebagai selected account color.

Green hanya untuk semantic positive state / dark analytics / accent yang memang ditunjukkan reference.

==================================================
MEDIA LIBRARY
==================================================

Jangan mengubah:

- grid
- image size
- pagination
- selection logic
- lazy loading
- media fetching

Hanya warna:

selected media:
indigo border/ring

hover:
subtle indigo

filter active:
indigo

metadata:
slate/muted

Dark mode:
dark slate surfaces + indigo selection.

==================================================
DASHBOARD METRICS
==================================================

Metric cards jangan diberi background warna kuat.

Gunakan:

neutral card
+
small semantic/icon accent.

Contoh:

Total Post:
indigo

Terjadwal:
blue/indigo

Berhasil:
green

Gagal:
red

Jangan membuat seluruh card menjadi warna status.

==================================================
CHARTS
==================================================

LIGHT MODE:

Primary performance chart:
Indigo #4F46E5

Area fill:
translucent indigo

Grid:
very subtle slate

Axis:
muted slate

DARK MODE:

Primary performance chart:
GREEN #22C55E

Area fill:
translucent green

Grid:
subtle dark slate

Axis:
#94A3B8

Tooltip:
dark surface / light text

Jangan memakai green pada light-mode chart jika reference masih menunjukkan indigo.

==================================================
CONNECTED ACCOUNTS
==================================================

Jangan mengubah account data atau behavior.

Warna:

Platform icon:
tetap menggunakan brand icon masing-masing.

JANGAN recolor logo platform.

TikTok:
tetap TikTok branding.

Instagram:
tetap Instagram branding.

Facebook:
tetap Facebook branding.

Threads:
tetap Threads branding.

Container, border, selected state, status badge:
gunakan AutoPost design tokens.

==================================================
PLATFORM ICONS
==================================================

PENTING:

Jangan memaksa semua platform icon menggunakan warna AutoPost.

Brand platform icon harus tetap recognizable.

Yang diubah hanya:

- surrounding background
- border
- selection state
- hover
- text
- badge

==================================================
LOGO AUTPOST
==================================================

Jangan mengganti bentuk/logo.

Jika logo memiliki color treatment:
gunakan warna yang konsisten dengan primary Indigo.

Light:
Indigo.

Dark:
Indigo/light-indigo.

Jangan membuat logo hijau hanya karena chart dark mode hijau.

==================================================
ACCESSIBILITY
==================================================

Setelah color system selesai:

Audit contrast untuk:

- body text
- muted text
- button text
- input text
- placeholder
- badge
- status
- navigation
- sidebar
- dark mode
- focus ring

Jangan menggunakan warna yang terlihat bagus tetapi gagal readability.

Prioritaskan WCAG contrast yang reasonable untuk UI production.

==================================================
IMPLEMENTATION STRATEGY
==================================================

SEBELUM EDIT:

1. Audit existing theme architecture.
2. Cari:
   - globals.css
   - tailwind config jika ada
   - shadcn tokens
   - CSS variables
   - theme provider
   - dark mode implementation
3. Cari hardcoded colors:
   - bg-*
   - text-*
   - border-*
   - ring-*
   - hex
   - rgb
   - hsl
4. Identifikasi mana yang merupakan:
   - design token
   - semantic status color
   - platform brand color
   - visualization color

JANGAN mengganti semuanya secara blind.

==================================================
HARD CODE COLOR AUDIT
==================================================

Cari seluruh repository untuk:

#hex
rgb()
rgba()
hsl()
bg-
text-
border-
ring-
fill-
stroke-

Kelompokkan hasil:

A. Brand/UI colors
B. Semantic status colors
C. Platform brand colors
D. Chart colors
E. Decorative colors

Kemudian hanya ubah A dan D sesuai target.

B harus tetap semantic.

C harus tetap platform branding.

==================================================
JANGAN MERUSAK DARK MODE
==================================================

Dark mode harus benar-benar berbeda dari sekadar:

light color → dark background.

Gunakan:

Background:
#0F172A

Surface:
#111827

Surface Alt:
#1E293B

Border:
#334155

Text:
#F8FAFC

Muted:
#94A3B8

Primary:
#6366F1

Analytics:
#22C55E

Pastikan hierarchy:

background
<
surface
<
surface-alt

terlihat jelas tetapi tetap subtle.

==================================================
JANGAN UBAH LAYOUT
==================================================

Jika menemukan masalah layout saat implementasi:

JANGAN memperbaikinya.

Laporkan sebagai:

"Existing layout issue — out of scope."

Scope hanya color system.

Jangan mengubah:

padding
margin
gap
width
height
font-size
line-height
border-radius
grid
flex
position
responsive breakpoint

kecuali perubahan tersebut secara otomatis diperlukan oleh existing theme mechanism, dan bukan redesign.

==================================================
JANGAN UBAH TYPOGRAPHY
==================================================

Pertahankan:

font family
font weight
font size
line height
letter spacing

persis seperti existing implementation.

==================================================
JANGAN UBAH ICON
==================================================

Jangan mengganti icon.

Jangan mengganti icon library.

Jangan mengubah ukuran icon.

Hanya warna icon jika memang berasal dari theme token.

Platform logo tetap menggunakan warna brand masing-masing.

==================================================
VALIDATION
==================================================

Setelah implementasi jalankan:

npm run lint

npm run typecheck

npm test

npm run test:integration

npm run test:all

npm run build

git diff --check

Semua harus PASS.

Jika ada failure:
JANGAN menonaktifkan test.

Perbaiki hanya jika failure disebabkan oleh perubahan color system.

==================================================
VISUAL AUDIT
==================================================

Setelah code selesai, lakukan audit visual terhadap:

1. /login
2. /dashboard
3. /create-post
4. /scheduled
5. /history
6. history detail
7. /media-library
8. /connected-accounts
9. /settings
10. review/approval
11. modal/dialog
12. toast
13. account selector
14. dark mode

Pastikan semua menggunakan color tokens yang sama.

==================================================
LIGHT MODE ACCEPTANCE CRITERIA
==================================================

Light mode harus terlihat seperti reference:

- background putih/very light slate
- card putih
- border sangat subtle
- primary indigo
- sidebar putih
- active navigation indigo
- CTA indigo
- text dark navy
- muted text slate
- status semantic
- chart indigo
- platform logo tetap original

Tidak boleh terasa:
- neon
- terlalu colorful
- gradient-heavy
- gaming UI
- glassmorphism
- excessive shadow

==================================================
DARK MODE ACCEPTANCE CRITERIA
==================================================

Dark mode harus terlihat seperti reference:

- deep navy background
- dark slate cards
- subtle borders
- indigo primary
- green analytics chart
- green positive accent
- semantic status colors
- white/light text
- muted slate text

Tidak boleh:
- full green theme
- full purple theme
- pure black background
- excessive glow
- neon UI

==================================================
FINAL REPORT
==================================================

Setelah selesai, berikan:

# COLOR SYSTEM IMPLEMENTATION REPORT

## 1. Files Changed

Daftar semua file.

## 2. Files Not Changed

Pastikan:

- database
- migration
- provider
- worker
- queue
- API
- server actions
- business logic

tidak berubah.

## 3. Color Tokens

Tampilkan final token:

LIGHT:

primary
background
surface
surfaceAlt
foreground
muted
border
success
warning
danger
info

DARK:

primary
background
surface
surfaceAlt
foreground
muted
border
success
warning
danger
info
chart

## 4. Components Updated

Checklist:

- [ ] Sidebar
- [ ] Header
- [ ] Buttons
- [ ] Cards
- [ ] Inputs
- [ ] Select
- [ ] Checkbox
- [ ] Switch
- [ ] Badge
- [ ] Status
- [ ] Toast
- [ ] Modal
- [ ] Dialog
- [ ] Sheet
- [ ] Table
- [ ] Tabs
- [ ] Media Library
- [ ] Account Selector
- [ ] Connected Accounts
- [ ] Dashboard
- [ ] Charts
- [ ] Review
- [ ] Settings
- [ ] All shadcn components used

## 5. Hardcoded Color Audit

Laporkan apakah masih ada hardcoded UI colors.

Pisahkan:

- allowed
- semantic
- platform brand
- chart
- accidental/out-of-system

## 6. Validation

Laporkan:

lint
typecheck
unit
integration
test:all
build
diff-check

## 7. Business Logic Safety

Konfirmasi:

"No business logic was changed."

## 8. Layout Safety

Konfirmasi:

"No layout/spacing/typography redesign was performed."

## 9. Migration

Konfirmasi:

"No database migration was created."

## 10. Git

Konfirmasi:

"No commit or push was performed."

==================================================
FINAL ABSOLUTE RULE
==================================================

Ini bukan redesign UI.

Ini adalah:

COLOR SYSTEM REWORK.

Reference image adalah visual source of truth.

Light:
Indigo + Slate + White.

Dark:
Navy + Slate + Indigo.

Dark chart:
GREEN.

Semantic:
Green / Amber / Red / Blue.

Platform logos:
tetap brand colors.

Semua komponen harus menggunakan centralized design tokens.

Jangan mengubah business logic.

Jangan mengubah layout.

Jangan mengubah typography.

Jangan mengubah architecture.

Jangan mengubah behavior.

Jangan commit.

Jangan push.

Jangan ubah Master Plan.