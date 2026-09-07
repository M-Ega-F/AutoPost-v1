Oke. Saya akan jelaskan **sangat detail, dari akar masalah sampai dampaknya ke seluruh aplikasi**, berdasarkan log runtime dan hasil implementasi yang sudah kamu kirim sebelumnya.

# 🔴 MASALAH UTAMA YANG SEDANG DIHADAPI

Saat ini sebenarnya ada **bukan satu masalah**, tetapi **beberapa masalah yang saling terlihat seperti satu masalah**.

Masalah utamanya berada di **pipeline media**.

Pipeline media AutoPost sekarang memiliki dua fase yang seharusnya benar-benar terpisah:

```text
FASE A — MEDIA SELECTION / PREVIEW

User pilih gambar
        ↓
Browser menyimpan File
        ↓
Browser membuat preview
        ↓
User melihat gambar


FASE B — MEDIA PERSISTENCE / PUBLISH

User klik Publish
        ↓
File diupload
        ↓
Storage
        ↓
Post dibuat
        ↓
Queue
        ↓
Worker
        ↓
Facebook
```

Masalahnya adalah aplikasi sekarang menunjukkan bahwa **fase A dan fase B masih tercampur di runtime**.

---

# 1. GEJALA PERTAMA YANG KAMU LIHAT

Di browser kamu:

```text
Untitled.png
41 KB

×

We couldn't prepare media storage. Try again.
```

Yang menarik:

```text
Preview gambar muncul.
```

Artinya:

```text
Browser berhasil membaca file.
```

File:

```text
Untitled.png
```

berhasil masuk dari komputer ke browser.

Browser juga berhasil membuat preview.

Jadi bagian ini:

```text
USER COMPUTER
      ↓
SELECT FILE
      ↓
BROWSER
      ↓
FILE OBJECT
      ↓
PREVIEW
```

**berhasil**.

Tetapi setelah preview muncul, aplikasi melakukan sesuatu yang tidak seharusnya.

---

# 2. BUKTI TERKUAT: LOG SERVER

Kamu mendapatkan:

```text
POST /api/media/upload 400
```

Ini sangat penting.

Karena request tersebut berarti:

```text
Browser
   ↓
HTTP POST
   ↓
/api/media/upload
   ↓
Server
   ↓
Storage
```

Padahal pada tahap itu kamu **belum klik Publish**.

Kamu hanya:

```text
Pilih gambar.
```

Jadi pertanyaan teknisnya:

> Kenapa memilih gambar masih menyebabkan HTTP POST ke `/api/media/upload`?

Itulah masalah pertama.

---

# 3. MASALAH PERTAMA:

# SELECTION FLOW MASIH MEMANGGIL UPLOAD FLOW

Arsitektur yang kita inginkan:

```text
┌───────────────────────┐
│ USER PILIH GAMBAR     │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│ File Object Browser   │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│ React State           │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│ createObjectURL       │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│ Preview               │
└───────────────────────┘

STOP
```

Tidak boleh ada:

```text
fetch
```

Tidak boleh ada:

```text
POST
```

Tidak boleh ada:

```text
/api/media/upload
```

Tidak boleh ada:

```text
Supabase Storage
```

---

Tetapi runtime kamu menunjukkan:

```text
USER PILIH FILE
       ↓
File masuk browser
       ↓
Preview dibuat
       ↓
❌ ADA CALLBACK LAIN
       ↓
❌ POST /api/media/upload
       ↓
❌ Storage
       ↓
❌ Error
```

Jadi kemungkinan besar struktur runtime masih seperti ini:

```text
CreatePostForm

        │

        ▼

MediaTabs

        │

        ▼

MediaFileInput

        │

        ├───────────────┐
        │               │
        ▼               ▼

Local Preview       OLD UPLOAD FLOW
                        │
                        ▼
                 /api/media/upload
                        │
                        ▼
                    Storage
```

Artinya mungkin ada **dua handler yang berjalan**.

---

# 4. KENAPA PREVIEW SEMPAT MUNCUL?

Ini penting untuk memahami kenapa bug-nya membingungkan.

Misalnya aplikasi melakukan:

```text
handleFileSelected(file)
```

Lalu:

```text
1. createObjectURL(file)
2. setPreview(url)
```

Preview muncul.

Kemudian callback lain:

```text
3. uploadMedia(file)
```

dipanggil.

Upload gagal.

Lalu aplikasi:

```text
4. setError(...)
5. rollback media
```

Akibatnya:

```text
Preview muncul
      ↓
Loading
      ↓
Upload gagal
      ↓
Preview dihapus
      ↓
Error muncul
```

Ini persis cocok dengan gejala yang kamu ceritakan sebelumnya:

> preview gambar muncul saat loading tetapi setelah loading force balik dan tidak ada gambar yang terlihat.

Jadi kemungkinan flow-nya:

```text
LOCAL PREVIEW
     ↓
BERHASIL
     ↓
BACKGROUND UPLOAD
     ↓
GAGAL
     ↓
ROLLBACK
     ↓
MEDIA HILANG
```

---

# 5. KENAPA OPEN CODE SEBELUMNYA BILANG SUDAH FIX?

Karena hasil sebelumnya mengatakan:

```text
Flow selection sekarang tidak lagi memanggil storage.
```

Dan test:

```text
249 PASS
```

Tetapi runtime menunjukkan:

```text
POST /api/media/upload
```

Artinya ada gap antara:

# TESTED CODE

dan:

# ACTUAL RUNTIME CODE

Kemungkinan penyebabnya:

---

## Kemungkinan A — Komponen runtime memakai hook lain

Misalnya:

```text
use-media-upload.ts
```

sudah diperbaiki.

Test:

```text
use-media-upload.test.ts
```

lulus.

Tetapi:

```text
CreatePostForm
```

tidak memakai hook itu.

Sebaliknya:

```text
CreatePostForm
```

masih memakai:

```text
uploadMedia()
```

atau helper lama.

Maka:

```text
TEST

use-media-upload
       ↓
PASS


RUNTIME

CreatePostForm
       ↓
old upload function
       ↓
POST /api/media/upload
```

---

## Kemungkinan B — Ada dua implementasi media

Contohnya:

```text
src/components/posts/media/

use-media-upload.ts

media-upload.ts

media-selection.ts

media-utils.ts
```

Salah satunya sudah diperbaiki.

Tetapi UI masih import yang lama.

Contoh:

```typescript
import { uploadMedia } from "./old-media-upload";
```

Padahal test menguji:

```typescript
useMediaUpload();
```

Maka test benar.

Tetapi aplikasi tetap salah.

---

## Kemungkinan C — Callback parent masih upload

Misalnya:

```text
MediaFileInput
```

sudah benar.

Dia hanya melakukan:

```text
onFile(file)
```

Kemudian:

```text
MediaTabs
```

meneruskan:

```text
onAdd(file)
```

Tetapi:

```text
CreatePostForm
```

melakukan:

```text
async function handleAdd(file) {

    const uploaded =
      await uploadMedia(file)

}
```

Jadi:

```text
Media Component

SUDAH BENAR
```

tetapi:

```text
Parent Component

MASIH UPLOAD
```

---

# 6. MASALAH KEDUA:

# BUCKET `post-media` TIDAK DITEMUKAN

Log:

```json
{
  "message": "Bucket not found",
  "bucket": "post-media",
  "status": 400
}
```

Ini masalah berbeda.

Artinya ketika server melakukan:

```text
Supabase Storage
       ↓
Cari Bucket

post-media
```

Supabase menjawab:

```text
Bucket tidak ditemukan.
```

Kemungkinan:

```text
Bucket belum dibuat
```

atau:

```text
Nama bucket salah
```

atau:

```text
Environment project salah
```

Misalnya kode menunjuk:

```text
post-media
```

Tetapi bucket sebenarnya:

```text
media
```

atau:

```text
post_media
```

atau bucket dibuat di project Supabase lain.

---

# 7. MASALAH KETIGA:

# MAXIMUM FILE SIZE

Log kedua:

```text
The object exceeded the maximum allowed size
```

Ini juga masalah terpisah.

Artinya request upload mencoba mengirim file.

Storage menerima request.

Tetapi file ditolak karena konfigurasi maximum size.

Flow:

```text
UPLOAD
   ↓
Storage menerima
   ↓
Check file size
   ↓
FILE TOO LARGE
   ↓
400
```

Menariknya gambar kamu hanya:

```text
41 KB
```

Jadi kalau benar file tersebut 41 KB, error maximum size cukup mencurigakan.

Karena 41 KB itu sangat kecil.

Kemungkinan:

---

## A. Error berasal dari request berbeda

Misalnya ada:

```text
Request 1

Bucket not found
```

dan:

```text
Request 2

File size exceeded
```

bukan dari file yang sama.

---

## B. Server mengirim object yang salah

Misalnya bukan:

```text
File
```

tetapi:

```text
FormData salah
```

atau:

```text
Buffer salah
```

atau object serialized.

---

## C. Bucket punya limit sangat kecil

Secara konfigurasi:

```text
Max size
```

mungkin salah.

---

## D. Error dari Storage setup attempt

Kode mungkin mencoba:

```text
Create Bucket
```

dengan konfigurasi:

```text
fileSizeLimit
```

yang salah.

---

# 8. MASALAH BESARNYA ADALAH:

# PIPELINE MEDIA BELUM MEMILIKI BATAS YANG JELAS

Saat ini kemungkinan ada konsep:

```text
Media Upload
```

yang digunakan untuk dua hal sekaligus.

Padahal sebenarnya ada dua konsep yang berbeda.

---

# A. LOCAL MEDIA SELECTION

Ini hanya urusan browser.

```text
File

↓

Browser Memory

↓

Preview

↓

User melihat hasil
```

Tidak perlu server.

---

# B. MEDIA PERSISTENCE

Ini urusan server.

```text
File

↓

Upload

↓

Storage

↓

Persistent URL
```

Diperlukan ketika:

```text
Publish
```

atau:

```text
Schedule
```

---

Sekarang dua konsep tersebut kemungkinan masih bercampur.

---

# 9. MASALAH ARSITEKTUR YANG HARUS DIPASTIKAN

Idealnya media memiliki lifecycle.

---

# STATE 1 — LOCAL

Saat user memilih file:

```text
LOCAL
```

Data:

```text
File
Preview URL
Name
Size
Type
```

Contoh:

```text
{
  state: "local",

  file: File,

  previewUrl:
  "blob:http://localhost/...",

  name:
  "image.png"
}
```

Belum ada:

```text
Storage URL
```

Belum ada:

```text
Database ID
```

Belum ada:

```text
Upload ID
```

---

# STATE 2 — READY TO PUBLISH

User selesai menulis:

```text
Caption
```

memilih:

```text
Facebook
```

Media masih:

```text
LOCAL
```

Contoh:

```text
{
  state: "local",

  file: File,

  previewUrl:
  "blob:..."
}
```

---

# STATE 3 — PERSISTING

User klik:

```text
Publish
```

Baru:

```text
LOCAL FILE

↓

UPLOAD START

↓

PERSISTING
```

Contoh:

```text
{
  state: "persisting"
}
```

---

# STATE 4 — PERSISTED

Upload berhasil.

```text
Storage URL
```

Contoh:

```text
{
  state: "persisted",

  storagePath:
  "user/post/image.png"
}
```

---

# STATE 5 — PUBLISHING

```text
PERSISTED

↓

CREATE POST

↓

CREATE TARGET

↓

QUEUE

↓

WORKER
```

---

# STATE 6 — PUBLISHED

```text
Facebook Published
```

---

# 10. SEKARANG STATE ITU KEMUNGKINAN TIDAK DIPISAH

Yang mungkin terjadi:

```text
USER SELECT FILE

↓

LOCAL PREVIEW

↓

AUTO PERSIST ❌
```

Padahal seharusnya:

```text
USER SELECT FILE

↓

LOCAL PREVIEW

↓

WAIT
```

Kemudian:

```text
USER CLICK PUBLISH

↓

PERSIST
```

---

# 11. MASALAH BERIKUTNYA:

# BROWSER MEMORY TIDAK BISA LANGSUNG MASUK DATABASE

Ini penting untuk langkah setelah preview selesai.

Kita tidak boleh berpikir:

```text
File di React State
```

lalu:

```text
Server Action
```

langsung bisa mengakses file itu.

Browser dan server berbeda.

Browser:

```text
User PC
```

Server:

```text
Next.js Server
```

Jadi saat publish harus ada proses transfer.

Pilihan yang benar:

```text
Browser

↓

POST multipart/form-data

↓

Server

↓

Storage
```

atau mekanisme upload lain.

Tetapi itu hanya saat:

```text
PUBLISH
```

---

# 12. SCHEDULE LEBIH KOMPLEKS DARI PUBLISH

Kalau user:

```text
Publish Now
```

file bisa langsung:

```text
Browser
↓
Upload
↓
Storage
↓
Worker
↓
Provider
```

Tetapi kalau:

```text
Schedule besok
```

Browser user mungkin sudah:

```text
Tutup laptop
```

atau:

```text
Tutup browser
```

Jadi file wajib sudah berada di persistent storage.

Flow:

```text
User pilih gambar

↓

Browser Preview

↓

User Schedule

↓

UPLOAD FILE

↓

Storage

↓

Database

↓

WAIT
```

Kemudian besok:

```text
Worker

↓

Storage

↓

File

↓

Facebook
```

Jadi storage memang **tetap diperlukan**.

Tetapi waktunya yang salah sekarang.

---

# 13. KENAPA KITA TIDAK BOLEH HAPUS STORAGE SEPENUHNYA

Karena nanti:

```text
Facebook
Instagram
TikTok
```

butuh akses ke media.

Jika browser menutup:

```text
blob:http://localhost/...
```

hilang.

Worker tidak bisa mengakses:

```text
blob URL browser
```

Jadi:

```text
Browser Preview
```

hanya sementara.

Sedangkan:

```text
Storage
```

persistent.

Arsitektur final:

```text
BROWSER

File
│
├── Preview
│
└── Publish
      ↓

SERVER

      ↓

STORAGE

      ↓

WORKER

      ↓

PROVIDER
```

---

# 14. MASALAH SAAT INI BELUM SAMPAI FACEBOOK

Ini juga sangat penting.

Kita belum boleh menyimpulkan:

```text
Facebook publish gagal
```

Karena sekarang pipeline bahkan belum sampai sana.

Pipeline berhenti di:

```text
MEDIA
```

Urutan runtime:

```text
1. Browser

2. Media selection

3. ❌ Upload terlalu cepat

4. ❌ Storage error

STOP
```

Belum sampai:

```text
Post Creation
```

Belum sampai:

```text
Queue
```

Belum sampai:

```text
Worker
```

Belum sampai:

```text
Facebook Graph API
```

Jadi Facebook belum menjadi masalah saat ini.

---

# 15. HUBUNGAN DENGAN FACEBOOK OAUTH

Facebook OAuth adalah pipeline terpisah.

OAuth:

```text
AutoPost

↓

Facebook Login

↓

Permission

↓

Callback

↓

Access Token

↓

Connected Account
```

Media:

```text
File

↓

Storage

↓

Post

↓

Queue

↓

Worker
```

Publish:

```text
Worker

↓

Facebook Provider

↓

Graph API
```

Saat ini:

```text
OAUTH
```

bisa saja sudah benar.

Tetapi:

```text
MEDIA
```

masih bermasalah.

Jadi:

```text
Facebook Connected
```

tidak otomatis berarti:

```text
Facebook Publish
```

sudah bisa.

---

# 16. MASALAH TEST YANG BARU TERUNGKAP

Ini salah satu masalah engineering paling penting sekarang.

Kita punya:

```text
Unit Tests

249 PASS
```

dan:

```text
Integration Tests

70 PASS
```

Tetapi runtime:

```text
POST /api/media/upload
```

masih terjadi.

Artinya testing coverage belum menjamin:

# ACTUAL USER FLOW

Kemungkinan test hanya menguji:

```text
FUNCTION
```

Contoh:

```text
useMediaUpload()
```

tanpa menguji:

```text
CreatePostForm

↓

MediaTabs

↓

MediaFileInput

↓

User Event

↓

Network
```

Yang sebenarnya kita butuhkan sekarang adalah test:

```text
USER SELECT FILE
```

kemudian assert:

```text
fetch

NOT CALLED
```

Ini berbeda dengan hanya menguji:

```text
previewUrl exists
```

---

# 17. MASALAH YANG HARUS DIAUDIT

OpenCode sekarang seharusnya mencari seluruh call chain.

Kurang lebih:

```text
CreatePostPage

↓

CreatePostForm

↓

MediaTabs

↓

MediaFileInput

↓

useMediaUpload

↓

onAdd

↓

Parent Callback

↓

???????

↓

/api/media/upload
```

Tanda:

```text
???????
```

adalah yang belum diketahui secara pasti.

Dan itu yang harus ditemukan.

---

# 18. KEMUNGKINAN SANGAT BESAR: CALLBACK `onAdd`

Dari error nested form sebelumnya kita tahu struktur media melibatkan komponen seperti:

```text
CreatePostForm
```

dan:

```text
MediaUrlInput
```

Juga ada:

```text
MediaTabs
```

Kemungkinan:

```text
MediaFileInput
```

memanggil:

```typescript
onAdd(media)
```

Lalu parent:

```text
CreatePostForm
```

mungkin melakukan:

```typescript
await uploadMedia(media)
```

Contoh arsitektur lama:

```typescript
const handleMediaAdd = async (file) => {

  const media =
    await uploadMedia(file)

  setMedia(media)

}
```

Arsitektur baru seharusnya:

```typescript
const handleMediaAdd = (file) => {

  const preview =
    URL.createObjectURL(file)

  setMedia({
    file,
    preview
  })

}
```

Upload baru:

```typescript
const handlePublish = async () => {

  await persistPendingMedia(media)

}
```

Kemungkinan besar bug ada di pemisahan ini.

---

# 19. MASALAH `MEDIA URL`

Kamu juga punya fitur:

```text
Tambahkan Media URL
```

Ini juga harus dipisahkan.

Saat:

```text
https://example.com/image.jpg
```

ditambahkan:

```text
URL

↓

Validate

↓

Preview
```

Tidak perlu:

```text
/api/media/url
```

pada tahap Add.

Kalau sekarang ada API:

```text
/api/media/url
```

maka kita perlu memastikan:

```text
MediaUrlInput
```

tidak masih memanggil endpoint itu.

---

# 20. MASALAH `API ROUTES` YANG MASIH ADA

Saat ini:

```text
/api/media/upload
```

dan:

```text
/api/media/url
```

masih ada.

Itu tidak otomatis salah.

Yang salah adalah:

```text
KAPAN endpoint tersebut dipanggil.
```

Endpoint:

```text
/api/media/upload
```

seharusnya:

```text
PUBLISH

atau

SCHEDULE
```

Bukan:

```text
SELECT FILE
```

---

# 21. MASALAH STORAGE `post-media`

Setelah masalah selection selesai, kita akan masuk ke masalah berikutnya.

Saat user klik Publish:

```text
Click Publish

↓

persistPendingMedia()

↓

Storage
```

Kemudian saat ini akan muncul:

```text
Bucket not found
```

Jadi nanti kita harus memastikan bucket:

```text
post-media
```

memang ada.

Tapi sebelum itu kita perlu audit:

```text
Apakah bucket memang seharusnya dibuat otomatis?
```

atau:

```text
Harus dibuat manual?
```

atau:

```text
Ada migration/setup script yang belum dijalankan?
```

atau:

```text
Nama bucket di code tidak sama dengan production?
```

---

# 22. BUCKET BUKAN DATABASE TABLE

Ini perlu dibedakan.

Kamu punya:

```text
Supabase PostgreSQL
```

untuk:

```text
Users
Posts
Accounts
Jobs
Targets
```

Dan:

```text
Supabase Storage
```

untuk:

```text
Images
Videos
Media Files
```

Bucket:

```text
post-media
```

adalah bagian dari:

```text
Storage
```

Bukan:

```text
Drizzle table
```

Jadi error:

```text
Bucket not found
```

tidak berarti database kamu rusak.

---

# 23. MASALAH FILE SIZE

Ini juga harus diaudit nanti.

Kita perlu mengetahui:

```text
Bucket configuration
```

Contoh:

```text
Maximum file size:

1 MB
```

atau:

```text
10 MB
```

atau:

```text
100 MB
```

Karena aplikasi ingin mendukung:

```text
Image
```

dan:

```text
Video
```

Maka limit harus sesuai.

Contoh konsep:

```text
Image

≤ X MB
```

Video:

```text
≤ Y MB
```

Tetapi jangan asal menaikkan limit sekarang.

Pertama kita harus tahu:

```text
Kenapa file 41 KB bisa memicu maximum size?
```

Itu harus dibuktikan.

---

# 24. MASALAH ERROR HANDLING

Sekarang UI menunjukkan:

```text
We couldn't prepare media storage. Try again.
```

Masalahnya pesan ini muncul pada:

```text
Media Selection
```

Padahal user tidak merasa sedang:

```text
Prepare Storage
```

Mereka hanya:

```text
Pilih gambar.
```

Jadi secara UX:

```text
USER ACTION

Upload/select image
```

Error:

```text
Storage preparation failed
```

Ini membocorkan detail implementasi dan membingungkan.

Setelah flow benar:

Saat selection gagal:

```text
We couldn't add this media. Try again.
```

mungkin lebih sesuai.

Sedangkan saat Publish:

```text
We couldn't upload this media. Try again.
```

lebih tepat.

Tetapi kita harus mengikuti [`Design.md`](http://Design.md) untuk copy UI dan tidak sembarang mengganti string.

---

# 25. MASALAH LAIN: ROLLBACK MEDIA

Kemungkinan besar saat upload gagal aplikasi melakukan:

```text
setMedia([])
```

atau:

```text
removeMedia()
```

Karena itu preview:

```text
muncul
```

kemudian:

```text
hilang.
```

Flow:

```text
LOCAL STATE

✓ File
✓ Preview

↓

Upload Failed

↓

ROLLBACK

↓

✗ File
✗ Preview
```

Padahal seharusnya:

```text
LOCAL STATE

✓ File
✓ Preview

↓

Publish Failed

↓

KEEP FILE
KEEP PREVIEW

↓

SHOW ERROR
```

Jadi user bisa:

```text
Fix error
```

lalu:

```text
Retry Publish
```

tanpa memilih file lagi.

Ini juga perlu dicek.

---

# 26. MASALAH SINKRONISASI STATE

Kemungkinan struktur sekarang:

```text
MediaInput State
```

dan:

```text
CreatePostForm State
```

terpisah.

Contoh:

```text
MediaInput

media = [file]
```

Tetapi:

```text
CreatePostForm

media = []
```

Kemudian upload async berhasil/gagal menentukan state utama.

Ini bisa menyebabkan:

```text
Preview component

punya data
```

tetapi:

```text
Parent

tidak punya data
```

Saat parent rerender:

```text
Preview hilang.
```

Ini cocok dengan gejala:

> Preview muncul sebentar lalu hilang.

Jadi selain network upload, perlu dicek apakah ada:

```text
state synchronization problem
```

antara:

```text
Child

dan

Parent
```

---

# 27. GAMBARAN MASALAH DALAM SATU DIAGRAM

Sekarang kemungkinan:

```text
                 USER
                   │
                   ▼
             SELECT FILE
                   │
                   ▼
          ┌────────────────┐
          │ Media Component│
          └───────┬────────┘
                  │
          ┌───────┴─────────┐
          │                 │
          ▼                 ▼

    LOCAL PREVIEW        OLD FLOW
          │                 │
          ▼                 ▼

      IMAGE ✓       POST /api/media/upload
                            │
                            ▼

                       SUPABASE
                            │
                     ┌──────┴──────┐
                     │             │
                     ▼             ▼

                Bucket Error   Size Error
                     │             │
                     └──────┬──────┘
                            │
                            ▼

                      UPLOAD FAILED
                            │
                            ▼

                      ROLLBACK
                            │
                            ▼

                     PREVIEW HILANG
```

Target:

```text
                 USER
                   │
                   ▼
             SELECT FILE
                   │
                   ▼

          ┌────────────────┐
          │ Browser State  │
          └───────┬────────┘
                  │
                  ▼

         URL.createObjectURL
                  │
                  ▼

              PREVIEW ✓
                  │
                  ▼

                WAIT


       USER CLICKS PUBLISH
                  │
                  ▼

          persistPendingMedia
                  │
                  ▼

             STORAGE
                  │
                  ▼

              QUEUE
                  │
                  ▼

              WORKER
                  │
                  ▼

             FACEBOOK
```

---

# 28. STATUS SETIAP LAPISAN SEKARANG

## Browser UI

```text
Login

✓
```

```text
Signup

✓
```

```text
Create Post

✓
```

```text
Caption

✓
```

```text
File Selection

✓ sebagian
```

```text
Preview

✓ muncul
```

```text
Preview Stable

❌ sebelumnya rollback
```

---

# Media Layer

```text
Local File State

🟡 perlu runtime audit
```

```text
Object URL

✓
```

```text
Storage Call

❌ terlalu cepat
```

```text
Upload Timing

❌ salah
```

---

# Storage Layer

```text
Code

✓ ada
```

```text
Bucket

❌ tidak ditemukan
```

```text
Size Limit

❌ bermasalah
```

```text
Publish Verification

⏳ belum
```

---

# Database

```text
Schema

✓
```

```text
RLS

✓
```

```text
Migration

✓
```

Tidak ada bukti masalah database pada error sekarang.

---

# Auth

```text
Login

✓ sekarang dianggap selesai
```

```text
Signup

✓
```

```text
Supabase Auth

✓
```

Masalah media tidak berhubungan langsung dengan login.

---

# OAuth

```text
Architecture

✓
```

```text
Facebook setup

✓ sedang/baru selesai
```

```text
Actual Connected Account

🟡 perlu verifikasi UI
```

---

# Queue

```text
Implementation

✓
```

```text
Integration Test

✓
```

```text
Real Facebook Job

⏳ belum
```

---

# Worker

```text
Implementation

✓
```

```text
Tests

✓
```

```text
Real Provider Publish

⏳ belum
```

---

# Facebook Graph API

```text
OAuth

🟡
```

```text
Account Connected

🟡
```

```text
Real Publish

❌ belum diuji
```

---

# 29. PRIORITAS PERBAIKAN YANG BENAR

Sekarang jangan lompat ke Facebook.

Jangan lompat ke TikTok.

Jangan lompat ke Instagram.

Jangan tambah fitur baru.

Urutannya:

---

## PRIORITAS 1

# TEMUKAN EXACT CALLER `/api/media/upload`

Kita perlu tahu:

```text
SIAPA

yang memanggil endpoint?
```

Bukan:

```text
endpoint melakukan apa?
```

Kita sudah tahu endpoint ada.

Yang belum tahu:

```text
Siapa yang memanggilnya saat selection.
```

---

## PRIORITAS 2

# PISAHKAN SELECTION DAN PERSISTENCE

Selection:

```text
Browser Only
```

Persistence:

```text
Publish/Schedule Only
```

---

## PRIORITAS 3

# RUNTIME TEST

User pilih gambar.

Server log harus:

```text
GET /create-post
```

dan tidak boleh:

```text
POST /api/media/upload
```

---

## PRIORITAS 4

# PERBAIKI STORAGE

Setelah selection bersih:

```text
post-media bucket
```

harus diverifikasi.

---

## PRIORITAS 5

# TEST PUBLISH

User:

```text
Select Image
```

✓

```text
Select Facebook
```

✓

```text
Click Publish
```

↓

Baru:

```text
POST /api/media/upload
```

boleh muncul.

↓

Storage.

↓

Post.

↓

Queue.

↓

Worker.

---

## PRIORITAS 6

# FACEBOOK GRAPH API

Baru setelah media sampai ke worker.

---

# 30. KESIMPULAN PALING SEDERHANA

Masalah sekarang adalah:

> **Aplikasi berhasil membuat preview media secara lokal di browser, tetapi masih ada jalur kode runtime yang memperlakukan pemilihan media sebagai proses upload dan mencoba mengirim file ke Supabase Storage terlalu cepat.**

Akibatnya:

```text
Pilih gambar

↓

Preview berhasil

↓

Upload otomatis yang tidak seharusnya

↓

POST /api/media/upload

↓

Storage

↓

Bucket error / size error

↓

Media rollback

↓

Preview hilang

↓

Error merah
```

Padahal seharusnya:

```text
Pilih gambar

↓

Preview

↓

Simpan di browser

↓

Tunggu user

↓

User pilih target

↓

User klik Publish

↓

BARU upload ke Storage
```

# 🎯 ROOT PROBLEM DALAM SATU KALIMAT

**Media selection flow dan media persistence flow belum benar-benar terpisah pada runtime, meskipun sebagian kode dan unit test sudah mencoba memisahkannya.**

Dan setelah itu ada masalah kedua yang akan muncul:

**Supabase Storage** `post-media` **belum siap/konfigurasinya tidak cocok dengan kode upload.**

Jadi urutan masalah sebenarnya:

```text
MASALAH 1
Upload dipanggil terlalu cepat
        ↓
FIX
        ↓
MASALAH 2
Storage bucket/configuration
        ↓
FIX
        ↓
MASALAH 3
Real publish pipeline
        ↓
TEST
        ↓
MASALAH 4
Facebook Graph API real publish
```

Menurut saya, **jangan ubah arsitektur besar sekarang**. Kita tinggal melakukan audit call chain media secara tepat, memastikan **satu sumber state media**, dan memaksa batas yang jelas antara **Select/Preview** vs **Publish/Persist**. Itu titik paling kritis saat ini.