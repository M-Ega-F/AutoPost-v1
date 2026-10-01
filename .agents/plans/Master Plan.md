Anda bertindak sebagai Senior Backend Engineer yang bertanggung jawab memperbaiki
implementasi TikTok Content Posting API pada repository AutoPost-v1.

============================================================
TUJUAN
============================================================

Implementasikan seluruh corrective action P0 yang sudah terbukti dari
TIKTOK CONTENT POSTING API COMPLIANCE AUDIT.

Tujuan akhirnya:

AutoPost harus mengikuti flow Direct Post TikTok secara benar:

    Query Creator Info
            ↓
    Validate creator capabilities
            ↓
    Validate privacy_level
            ↓
    Video Init
            ↓
    pilih transfer method
       ↙             ↘
FILE_UPLOAD      PULL_FROM_URL
     ↓                 ↓
PUT upload          TikTok pull
     ↘               ↙
          publish_id
              ↓
       Get Post Status
              ↓
      published / failed

Implementasi harus tetap mempertahankan arsitektur AutoPost yang sekarang.

JANGAN melakukan redesign besar.

============================================================
SOURCE OF TRUTH
============================================================

Repository:

C:\Users\aldis\Documents\Codex\AutoPost-v1

Master Plan:

C:\Users\aldis\Documents\Codex\AutoPost-v1\.agents\plans\Master Plan.md

Master Plan adalah source of truth.

WAJIB:

- JANGAN mengubah Master Plan.
- JANGAN overwrite Master Plan.
- JANGAN mengedit isi Master Plan.
- Jangan membuat plan baru yang menggantikan Master Plan.

Audit yang menjadi dasar implementasi adalah hasil:

TIKTOK CONTENT POSTING API COMPLIANCE AUDIT

Temuan utama:

1. creator_info/query belum dipanggil.
2. privacy_level hardcoded SELF_ONLY.
3. creator capability belum divalidasi.
4. max_video_post_duration_sec belum digunakan.
5. semua media mencoba PULL_FROM_URL terlebih dahulu.
6. FILE_UPLOAD belum benar untuk file >64 MB.
7. Content-Length belum dikirim.
8. MIME upload selalu video/mp4.
9. PULL_FROM_URL belum divalidasi requirement-nya.

Implementasi kali ini HANYA fokus pada P0 tersebut.

============================================================
ATURAN BESAR
============================================================

JANGAN:

- mengubah Facebook provider
- mengubah Instagram provider
- mengubah Threads provider
- mengubah OAuth provider lain
- mengubah queue architecture
- mengganti BullMQ
- mengganti Redis
- mengganti Supabase
- mengubah database schema kecuali benar-benar terbukti mutlak diperlukan
- membuat migration jika tidak diperlukan
- memindahkan worker architecture
- membuat provider architecture baru
- membuat abstraction baru yang tidak diperlukan
- mengubah public API
- mengubah authentication
- mengubah authorization
- mengubah UI besar
- mengubah Create Post flow secara besar
- menghapus /api/media/upload
- mengubah direct media upload architecture yang sudah ada
- mengubah Master Plan

JANGAN:

- commit
- push
- force push
- reset git
- checkout branch lain
- menghapus perubahan user
- menggunakan git clean
- menggunakan git restore terhadap perubahan yang bukan milik task ini

JANGAN log:

- access token
- refresh token
- client secret
- Authorization header
- signed media URL
- TikTok upload_url
- cookies
- session token
- Supabase service role key

============================================================
PRINSIP IMPLEMENTASI
============================================================

1. Evidence first.

Sebelum mengubah kode:

- baca implementasi TikTok saat ini
- pahami provider contract
- pahami executePublishJob
- pahami media/storage flow
- pahami existing error mapping
- pahami existing tests

2. Reuse existing architecture.

Jangan membuat TikTok publishing system baru.

Perbaiki provider yang sudah ada.

3. Minimal change.

Jika satu fungsi dapat diperbaiki tanpa refactor besar,
lakukan perubahan lokal.

4. Backward compatibility.

Pastikan perubahan tidak merusak:

- existing TikTok OAuth
- existing connected accounts
- existing publish queue
- retry
- execution state
- history
- Facebook
- Instagram
- Threads

============================================================
PHASE 0 — PRE-IMPLEMENTATION AUDIT
============================================================

Sebelum coding, inspect minimal:

src/providers/social/tiktok/index.ts

src/providers/social/tiktok/index.test.ts

src/providers/social/http.ts

src/providers/social/types.ts

src/lib/publishing/execute.ts

src/lib/domain/executions.ts

src/lib/storage/index.ts

src/lib/validation/limits.ts

src/workers/publish-worker.ts

src/lib/queue/publish.ts

Cari semua:

- TikTok API endpoint
- publishVideo()
- initVideoPost()
- uploadBytes()
- getPublishStatus()
- validateContent()
- privacy_level
- SELF_ONLY
- PUBLIC_TO_EVERYONE
- MUTUAL_FOLLOW_FRIENDS
- PULL_FROM_URL
- FILE_UPLOAD
- video_size
- chunk_size
- total_chunk_count
- Content-Range
- Content-Type
- Content-Length
- createSignedMediaUrl()
- error mapping

Setelah memahami kode, baru implementasikan.

============================================================
P0-1 — IMPLEMENT QUERY CREATOR INFO
============================================================

Tambahkan penggunaan endpoint resmi:

POST

https://open.tiktokapis.com/v2/post/publish/creator_info/query/

Header:

Authorization: Bearer <token>

Content-Type: application/json; charset=UTF-8

Gunakan existing HTTP abstraction.

JANGAN membuat HTTP client kedua.

JANGAN bypass existing requestJson()/HTTP helper jika existing abstraction
memang sesuai.

Response yang harus dapat diparsing:

data:
- creator_avatar_url
- creator_username
- creator_nickname
- privacy_level_options
- comment_disabled
- duet_disabled
- stitch_disabled
- max_video_post_duration_sec

error:
- code
- message
- log_id

Buat internal typed representation yang sesuai dengan architecture
yang sudah ada.

Jangan menyimpan access token ke result.

============================================================
P0-2 — CREATOR INFO HARUS TERJADI SEBELUM VIDEO INIT
============================================================

Flow video Direct Post harus menjadi:

publishVideo()
    ↓
Query Creator Info
    ↓
Validate creator information
    ↓
Build post_info
    ↓
Video Init

Creator Info TIDAK boleh dipanggil setelah video/init.

Jangan:

Video Init
↓
Creator Info

Harus:

Creator Info
↓
Video Init

============================================================
P0-3 — VALIDASI PRIVACY LEVEL
============================================================

Saat ini provider menggunakan:

SELF_ONLY

hardcoded.

Jangan sekadar mengganti hardcode dengan value lain.

Gunakan:

creator_info.privacy_level_options

sebagai sumber validasi.

Aturan:

privacy level yang akan digunakan harus ada di:

creator_info.privacy_level_options

Jika tidak tersedia:

- jangan melakukan Video Init
- return provider error yang jelas
- jangan fallback diam-diam ke PUBLIC_TO_EVERYONE
- jangan fallback diam-diam ke SELF_ONLY
- jangan membuat request TikTok yang pasti invalid

PENTING:

Untuk MVP saat ini, jika UI/domain AutoPost belum memiliki user-selectable
TikTok privacy setting, pertahankan default existing:

SELF_ONLY

TETAPI:

SELF_ONLY harus divalidasi terhadap:

privacy_level_options

Jadi:

existing default:
SELF_ONLY

+

creator_info.privacy_level_options.includes("SELF_ONLY")

baru:

Video Init

Jangan memperkenalkan UI privacy selector baru dalam task ini.

============================================================
P0-4 — VALIDASI CREATOR CAPABILITY
============================================================

Gunakan hasil Creator Info untuk memvalidasi capability yang relevan.

Minimal audit dan implementasikan validation untuk:

comment_disabled
duet_disabled
stitch_disabled
max_video_post_duration_sec

PENTING:

Jangan mengarang aturan TikTok.

Bedakan:

A. field yang memang harus dipatuhi oleh request
B. field yang hanya informative
C. field yang tidak boleh dipaksa menjadi restriction tanpa dasar dokumentasi

Untuk:

max_video_post_duration_sec

Jika creator memberikan:

max_video_post_duration_sec = N

dan video duration > N,

jangan lanjut ke Video Init.

Return validation error yang jelas.

Jangan menggunakan static limit saja.

Static application limit tetap boleh dipertahankan sebagai first-level validation.

Flow:

static validation
    ↓
Creator Info
    ↓
dynamic creator validation
    ↓
Video Init

Untuk:

comment_disabled
duet_disabled
stitch_disabled

Pastikan request tidak meminta capability yang creator nyatakan disabled.

Jangan mengubah UX besar.

Jika current AutoPost belum memiliki pilihan explicit untuk disable_*,
gunakan behavior yang paling konservatif dan konsisten dengan current provider
contract tanpa membuat fitur UI baru.

============================================================
P0-5 — PILIH FILE_UPLOAD UNTUK MEDIA SERVER-SIDE
============================================================

Ini sangat penting.

Saat media AutoPost sudah memiliki:

storageKey

dan file dapat dibaca server-side:

JANGAN mencoba PULL_FROM_URL terlebih dahulu.

Gunakan:

FILE_UPLOAD

secara langsung.

Flow:

storageKey
   ↓
download/read media bytes
   ↓
FILE_UPLOAD init
   ↓
PUT upload_url
   ↓
status fetch

Jangan:

storageKey
   ↓
signed URL
   ↓
PULL_FROM_URL
   ↓
403
   ↓
fallback FILE_UPLOAD

untuk kasus media server-side yang memang tersedia.

Alasan:

- menghindari domain ownership requirement
- menghindari url_ownership_unverified
- lebih sesuai untuk file yang sudah dimiliki AutoPost
- mengurangi satu network dependency
- menghilangkan unnecessary PULL attempt

============================================================
P0-6 — PULL_FROM_URL HANYA UNTUK URL YANG MEMANG MEMERLUKANNYA
============================================================

Tetap pertahankan dukungan PULL_FROM_URL jika provider contract
memang membutuhkan URL-based media.

Tetapi jangan gunakan PULL_FROM_URL untuk storageKey internal
yang dapat di-upload langsung.

Jika PULL_FROM_URL digunakan:

pastikan URL:

- HTTPS
- dapat diakses TikTok
- tidak membutuhkan browser cookie
- tidak membutuhkan user authentication
- tidak bergantung pada localhost
- tidak menggunakan URL yang hanya dapat diakses internal network

JANGAN mengklaim domain ownership verified jika tidak dapat dibuktikan.

JANGAN melakukan automatic fallback yang menyembunyikan root cause.

Jika URL tidak memenuhi requirement:

return error yang jelas sebelum request TikTok bila validasi lokal memang
dapat membuktikannya.

============================================================
P0-7 — FILE_UPLOAD INIT
============================================================

Untuk:

POST

/v2/post/publish/video/init/

dengan:

source = FILE_UPLOAD

pastikan:

video_size
chunk_size
total_chunk_count

benar-benar merepresentasikan upload aktual.

Formula:

video_size = actual byte size

Jika single chunk:

chunk_size = video_size

total_chunk_count = 1

Jika multiple chunks:

chunk_size <= 64 MB

total_chunk_count =
ceil(video_size / chunk_size)

PENTING:

Jangan membuat:

total_chunk_count = 2

tetapi kemudian mengirim seluruh file sebagai satu PUT.

Metadata init harus konsisten dengan actual upload.

============================================================
P0-8 — IMPLEMENT CHUNK UPLOAD >64 MB
============================================================

Current audit menemukan bahwa file >64 MB belum benar-benar
di-upload secara chunked.

Perbaiki.

Jika:

video_size <= 64 MB

boleh satu PUT.

Jika:

video_size > 64 MB

harus upload sequential chunks sesuai requirement TikTok.

Jangan upload semua bytes sekaligus.

Untuk setiap chunk:

PUT upload_url

dengan Content-Range:

bytes START-END/TOTAL

Contoh konsep:

chunk 1:
bytes 0-(chunkSize-1)/total

chunk 2:
bytes chunkSize-(2*chunkSize-1)/total

dst.

Pastikan:

START
END
TOTAL

selalu benar.

END inclusive.

Jangan off-by-one.

Jangan mengubah upload_url.

Semua chunk menggunakan upload_url dari init response.

============================================================
P0-9 — CONTENT-LENGTH
============================================================

Tambahkan:

Content-Length

pada PUT upload.

Nilai harus:

ukuran bytes chunk yang sedang dikirim.

Untuk single upload:

Content-Length = total file size

Untuk chunk:

Content-Length = current chunk byte length

Jangan menggunakan total file size untuk setiap chunk.

============================================================
P0-10 — CONTENT-RANGE
============================================================

Pastikan:

Content-Range:

bytes START-END/TOTAL

dan:

END = START + chunkLength - 1

TOTAL = total file size

Pastikan request terakhir tidak melewati TOTAL.

============================================================
P0-11 — CONTENT-TYPE
============================================================

Current implementation selalu:

video/mp4

Audit media MIME aktual.

Jika media memang:

video/mp4

gunakan:

video/mp4

Jika current provider contract mendukung tipe video lain,
jangan memaksa semuanya menjadi video/mp4.

Jangan melakukan broad MIME expansion tanpa evidence.

Jika TikTok Direct Post video endpoint memang membutuhkan
video/mp4 untuk current supported flow, pertahankan restriction
dan fail validation secara jelas untuk unsupported MIME.

Yang penting:

request Content-Type harus konsisten dengan bytes yang dikirim.

============================================================
P0-12 — PUBLISH_ID
============================================================

Pastikan:

Video Init response:

data.publish_id

digunakan sebagai identifier untuk:

/v2/post/publish/status/fetch/

Jangan menggunakan:

postPlatformId

sebagai TikTok publish_id.

Jangan membuat publish_id sendiri.

============================================================
P0-13 — STATUS POLLING
============================================================

Pertahankan existing status polling architecture.

Jangan redesign.

Pastikan:

init
↓
upload jika diperlukan
↓
publish_id
↓
status fetch

Polling existing behavior tetap dipertahankan jika sudah bekerja.

Jangan mengubah retry architecture kecuali diperlukan langsung
oleh perubahan P0.

============================================================
P0-14 — ERROR HANDLING
============================================================

Walaupun detailed error observability adalah P1,
implementasi P0 tidak boleh merusak existing error handling.

Pastikan jika Creator Info gagal:

JANGAN lanjut ke Video Init.

Jika privacy validation gagal:

JANGAN lanjut ke Video Init.

Jika capability validation gagal:

JANGAN lanjut ke Video Init.

Jika FILE_UPLOAD init gagal:

JANGAN pura-pura upload sukses.

Jika PUT chunk gagal:

JANGAN lanjut seolah upload selesai.

Jika status fetch gagal:

gunakan existing execution failure architecture.

Jangan mengubah generic user-facing message menjadi raw TikTok response.

============================================================
P0-15 — REMOVE UNNECESSARY PULL FALLBACK
============================================================

Current behavior:

PULL_FROM_URL
↓
fallback FILE_UPLOAD

untuk media internal.

Ubah menjadi:

media memiliki storageKey
↓
FILE_UPLOAD

PULL_FROM_URL hanya ketika source memang URL-based.

Jangan menghapus PULL_FROM_URL support.

Jangan menghapus existing method jika masih digunakan oleh legitimate flow.

============================================================
P0-16 — TESTS
============================================================

Tambahkan regression tests yang benar-benar membuktikan flow.

Minimal:

TEST 1
Creator Info dipanggil sebelum Video Init.

Expected sequence:

creator_info/query
→ video/init

TEST 2
Creator Info gagal.

Expected:

video/init NOT called.

TEST 3
SELF_ONLY tersedia.

Creator Info:

privacy_level_options = ["SELF_ONLY"]

Expected:

video/init privacy_level = SELF_ONLY

TEST 4
SELF_ONLY tidak tersedia.

Creator Info:

privacy_level_options = ["PUBLIC_TO_EVERYONE"]

Expected:

Video Init NOT called.

TEST 5
Creator duration limit.

Creator:

max_video_post_duration_sec = 30

Video duration = 40

Expected:

Video Init NOT called.

TEST 6
Server-side storageKey.

Expected:

FILE_UPLOAD

Expected:

PULL_FROM_URL NOT called.

TEST 7
FILE_UPLOAD <=64MB.

Expected:

correct video_size
correct chunk_size
total_chunk_count = 1
Content-Length correct
Content-Range correct

TEST 8
FILE_UPLOAD >64MB.

Expected:

multiple chunks.

Verify:

- total_chunk_count
- Content-Length each chunk
- Content-Range each chunk
- sequential order
- complete byte coverage
- no overlapping ranges
- no missing ranges

TEST 9
Last chunk.

Verify:

END = TOTAL - 1

TEST 10
MIME.

Verify Content-Type is consistent with actual supported media MIME.

TEST 11
publish_id.

Verify status fetch uses publish_id returned by TikTok init.

TEST 12
PULL_FROM_URL legitimate URL flow.

Expected:

PULL_FROM_URL

NOT FILE_UPLOAD.

============================================================
P0-17 — TEST REAL HTTP BODY SAFELY
============================================================

Gunakan mock HTTP infrastructure existing.

Jangan melakukan real TikTok request dalam automated tests.

Capture sanitized request:

{
  "post_info": {
    "privacy_level": "...",
    "disable_duet": "...",
    "disable_comment": "...",
    "disable_stitch": "..."
  },
  "source_info": {
    "source": "...",
    "video_size": "...",
    "chunk_size": "...",
    "total_chunk_count": "..."
  }
}

JANGAN capture:

Authorization
token
upload_url
signed URL

============================================================
P0-18 — PRESERVE CURRENT ARCHITECTURE
============================================================

Jangan membuat:

TikTokDirectPostService2
TikTokProviderV2
NewTikTokClient
NewPublishWorker

jika tidak benar-benar diperlukan.

Gunakan provider:

src/providers/social/tiktok/index.ts

dan existing HTTP abstraction.

Jika helper baru benar-benar diperlukan:

- letakkan dekat provider
- buat namanya jelas
- gunakan existing types
- jangan membuat abstraction global tanpa kebutuhan

============================================================
P0-19 — DO NOT CHANGE OTHER PROVIDERS
============================================================

Setelah implementasi:

pastikan diff tidak menyentuh behavior:

Facebook
Instagram
Threads

Jika file shared berubah:

jelaskan mengapa.

Shared HTTP helper boleh berubah hanya jika:

- perubahan memang diperlukan untuk TikTok upload
- tidak mengubah behavior provider lain
- test provider lain tetap pass

============================================================
P0-20 — DATABASE
============================================================

Jangan menambahkan migration.

Jangan mengubah schema.

Creator Info tidak perlu disimpan ke database untuk task ini
kecuali existing architecture benar-benar membutuhkan.

Prefer:

Query Creator Info
→ validate
→ publish

dalam satu publish execution.

============================================================
P0-21 — LOGGING SECURITY
============================================================

Logging harus tetap aman.

Boleh log:

provider=tiktok
stage=creator_info
privacy_level=<value>
source=FILE_UPLOAD
video_size=<number>
chunk_count=<number>
status=<value>

JANGAN log:

Bearer token
client secret
upload_url
signed media URL

============================================================
P0-22 — RUN VALIDATION
============================================================

Setelah implementasi:

npm run lint

npm run typecheck

npm test

npm run test:integration

npm run test:all

npm run build

git diff --check

Jika migration tidak berubah:

JANGAN menjalankan migration hanya untuk formalitas.

Jika db generate tidak relevan:

jangan menjalankan hanya untuk membuat file baru.

============================================================
P0-23 — INSPECT DIFF
============================================================

Setelah semua test:

git status

git diff --stat

git diff -- src/providers/social/tiktok/
git diff -- src/providers/social/http.ts
git diff -- src/lib/publishing/
git diff -- src/workers/

Pastikan:

- tidak ada Master Plan berubah
- tidak ada unrelated changes
- tidak ada secret
- tidak ada credential
- tidak ada generated junk
- tidak ada debug code
- tidak ada console.log yang membocorkan data sensitif

============================================================
P0-24 — MANUAL TEST PLAN
============================================================

Setelah automated tests PASS, buat manual test plan.

Test minimal:

A. TikTok connected account
B. Upload video
C. Publish now
D. FILE_UPLOAD
E. Creator Info
F. privacy validation
G. status polling
H. published

Untuk current TikTok unaudited client:

gunakan privacy level yang memang tersedia dari Creator Info.

Jangan mengasumsikan PUBLIC_TO_EVERYONE tersedia.

============================================================
HASIL AKHIR WAJIB
============================================================

Setelah implementasi, berikan report:

# TIKTOK P0 IMPLEMENTATION REPORT

## 1. Implementation Summary

Apa yang berubah.

## 2. Creator Info

- endpoint
- kapan dipanggil
- data yang digunakan

## 3. Privacy

- default current behavior
- validation terhadap privacy_level_options

## 4. Capability Validation

- comment
- duet
- stitch
- duration

## 5. Transfer Strategy

Jelaskan:

storageKey
→ FILE_UPLOAD

dan kapan:

PULL_FROM_URL

digunakan.

## 6. FILE_UPLOAD

Jelaskan:

- video_size
- chunk_size
- total_chunk_count
- Content-Length
- Content-Range
- Content-Type
- chunking >64 MB

## 7. Status Polling

Pastikan publish_id digunakan.

## 8. Tests

Jumlah test sebelum/sesudah.

Tampilkan command dan hasil:

lint
typecheck
unit
integration
test:all
build
diff check

## 9. Files Changed

Daftar file yang benar-benar berubah.

## 10. Other Providers

Konfirmasi Facebook/Instagram/Threads tidak diubah
atau jelaskan jika shared file berubah.

## 11. Master Plan

WAJIB:

Master Plan changed: NO

## 12. Database

Migration/schema changed: NO

## 13. Git

Commit: NO
Push: NO

============================================================
KONDISI GAGAL
============================================================

Jika ada test gagal:

JANGAN memalsukan PASS.

Jelaskan:

- command
- test gagal
- error
- root cause
- apakah berkaitan dengan perubahan ini

Jika ada requirement TikTok yang tidak dapat diimplementasikan
secara aman karena informasi di repository tidak cukup:

STOP pada bagian tersebut.

Jangan mengarang.

Laporkan:

UNKNOWN / BLOCKED

dan jelaskan evidence yang dibutuhkan.

============================================================
FINAL ACCEPTANCE CRITERIA
============================================================

Implementasi dianggap selesai hanya jika:

[ ] Creator Info dipanggil sebelum Video Init
[ ] privacy_level_options digunakan
[ ] SELF_ONLY tidak lagi diterima secara blindly/hardcoded tanpa validation
[ ] creator capability divalidasi
[ ] max_video_post_duration_sec digunakan untuk dynamic duration validation
[ ] server-side media menggunakan FILE_UPLOAD
[ ] PULL_FROM_URL tidak lagi menjadi default untuk storageKey
[ ] FILE_UPLOAD metadata konsisten dengan upload aktual
[ ] file <=64MB dapat upload dengan benar
[ ] file >64MB benar-benar chunked
[ ] Content-Length dikirim
[ ] Content-Range benar
[ ] Content-Type konsisten
[ ] publish_id digunakan untuk status polling
[ ] existing retry/execution architecture tetap bekerja
[ ] Facebook tidak rusak
[ ] Instagram tidak rusak
[ ] Threads tidak rusak
[ ] Master Plan tidak berubah
[ ] database schema tidak berubah
[ ] secrets tidak masuk log
[ ] lint PASS
[ ] typecheck PASS
[ ] unit tests PASS
[ ] integration tests PASS
[ ] test:all PASS
[ ] build PASS
[ ] git diff --check PASS
[ ] tidak ada commit
[ ] tidak ada push

JANGAN berhenti hanya karena unit test PASS.

Periksa juga hasil git diff dan pastikan implementasi benar-benar
mengikuti flow:

Creator Info
→ validation
→ Video Init
→ FILE_UPLOAD/PULL_FROM_URL
→ upload
→ publish_id
→ status fetch

Ini adalah acceptance criterion utama.