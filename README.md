# AutoPost

AutoPost-v1 adalah aplikasi web untuk membuat, menjadwalkan, dan menerbitkan konten ke beberapa akun media sosial. Alur utamanya: upload konten sekali, pilih satu atau beberapa akun sosial, publish sekarang atau jadwalkan, lalu pantau status setiap target.

Repository ini berisi aplikasi Next.js, domain posting, social provider abstraction, BullMQ workers, serta integrasi Supabase dan PostgreSQL. Integrasi provider tetap membutuhkan credential, scope, dan entitlement yang sesuai dari masing-masing platform.

## Features

- Authentication dengan Supabase Auth: login, signup, reset password, dan protected routes.
- Workspace pribadi/tim, anggota, role, permission, dan invitation.
- Connect dan disconnect social accounts melalui OAuth.
- Create Post dengan pemilihan beberapa social account, termasuk beberapa akun pada platform yang sama.
- Upload image/video ke Supabase Storage private.
- Publish now, draft, scheduling, cancellation, retry, dan history.
- Per-platform content validation dan status execution.
- Media compatibility check serta TikTok photo delivery route yang token-bound.
- Approval dan review workflow.
- Campaign, campaign automation, analytics, notifications, dan outgoing webhooks.
- Social provider abstraction untuk Instagram, Facebook, TikTok, Threads, LinkedIn, YouTube, dan X.

## Supported Platforms

| Platform | Account type di provider | Image | Video | Scheduling | Status |
| --- | --- | --- | --- | --- | --- |
| Instagram | Instagram user | Implemented | Implemented | Internal queue | Provider terdaftar; live entitlement perlu dikonfigurasi |
| Facebook | Facebook Page | Implemented | Implemented | Internal queue | Provider terdaftar; live entitlement perlu dikonfigurasi |
| TikTok | TikTok user | Implemented | Implemented | Internal queue | Provider terdaftar; live entitlement perlu dikonfigurasi |
| Threads | Threads user | Implemented | Implemented | Internal queue | Provider terdaftar; live entitlement perlu dikonfigurasi |
| LinkedIn | LinkedIn member/personal profile | Implemented | Implemented | Internal queue | Provider terdaftar; live entitlement perlu dikonfigurasi |
| YouTube | YouTube channel | Not applicable | Implemented | Internal queue | Video-only; Google API verification/quota tetap berlaku |
| X | X user | Implemented | Implemented | Internal queue | Provider terdaftar; live entitlement perlu dikonfigurasi |

Kemampuan live publish tidak dapat dianggap terverifikasi hanya dari source code. App credential, OAuth scope, product access, dan aturan akun provider tetap berlaku.

### LinkedIn

Image posting menggunakan LinkedIn Images API. Video tetap memakai flow Assets API yang terpisah.

    Image
      ↓
    POST /rest/images?action=initializeUpload
      ↓
    uploadUrl
      ↓
    PUT binary
      ↓
    urn:li:image:...
      ↓
    POST /rest/posts

Final post menggunakan content.media.id dengan image URN. Jangan memasukkan access token atau client secret ke frontend, queue, log, atau README.

## Architecture

    Browser
      ↓
    Next.js App Router
      ├── Supabase Auth
      ├── Application/API/Domain
      ├── PostgreSQL via Drizzle
      └── Supabase Storage private
              ↓
        Redis Cloud TCP/TLS
          ├── publish-worker
          ├── webhook-worker
          ├── review-automation-worker
          └── campaign-automation-worker
              ↓
        Social Providers
              ↓
        Instagram / Facebook / TikTok / Threads / LinkedIn / YouTube / X

Web application dan worker berjalan sebagai process terpisah. Queue hanya membawa identifier seperti postPlatformId; worker mengambil account, media, dan data posting dari database.

## Tech Stack

| Technology | Purpose |
| --- | --- |
| Next.js 16 | Web application, App Router, Route Handlers, server rendering |
| React 19 | UI |
| TypeScript | Type-safe application code |
| Tailwind CSS 4 | Styling |
| Radix UI | UI primitives |
| Supabase Auth | Authentication dan session berbasis cookie |
| Supabase Storage | Private media storage |
| PostgreSQL | Application database |
| Drizzle ORM | Query layer dan migration tooling |
| BullMQ | Job queue dan worker processing |
| ioredis | Redis connection untuk BullMQ/Redis Cloud |
| Zod | Input validation |

## Project Structure

    AutoPost-v1/
    ├── src/
    │   ├── app/                 # Pages, layouts, dan API Route Handlers
    │   ├── components/          # UI dan feature components
    │   ├── lib/
    │   │   ├── actions/         # Server actions
    │   │   ├── auth/            # Supabase Auth dan authorization
    │   │   ├── db/              # Drizzle client dan schema
    │   │   ├── domain/          # Domain rules dan persistence workflows
    │   │   ├── media/           # Media probing, fetch, dan delivery
    │   │   ├── publishing/      # Publish execution dan recovery
    │   │   ├── queue/            # Queue names, payloads, dan enqueue helpers
    │   │   └── storage/          # Supabase Storage helpers
    │   ├── providers/social/    # OAuth dan publish adapter per platform
    │   ├── proxy.ts             # Session refresh dan request transport rules
    │   └── workers/             # Worker entrypoints
    ├── drizzle/                 # Drizzle SQL migrations dan metadata
    ├── supabase/migrations/     # Supabase/RLS migrations
    ├── tests/                   # Integration/domain tests
    ├── scripts/                 # Utility dan test scripts
    ├── docs/                    # Dokumentasi teknis dan phase notes
    ├── package.json
    ├── .env.example
    └── README.md

## Getting Started

### Prerequisites

- Node.js yang mendukung dependency repository dan npm.
- Project Supabase untuk Auth, PostgreSQL, dan Storage.
- Redis Cloud dengan URL TCP (`redis://` atau `rediss://`); BullMQ tidak memakai endpoint REST sebagai connection URL.
- OAuth app dan permission yang sesuai untuk provider sosial yang ingin digunakan.

Versi Node.js tidak dipatok di package.json saat ini. Gunakan versi Node.js LTS yang kompatibel dengan Next.js 16 dan dependency yang terpasang.

### Installation

    npm install
    Copy-Item .env.example .env.local

Isi .env.local dengan konfigurasi server dan provider yang diperlukan. Jangan menyalin credential ke source control.

## Environment Variables

.env.example hanya berisi placeholder. Source code membaca variable berikut secara lazy; provider sosial dapat dibiarkan kosong jika provider tersebut belum digunakan.

### Core

| Variable | Required | Purpose |
| --- | --- | --- |
| APP_URL | Yes untuk OAuth/production | Public app URL dan OAuth redirect base |
| NEXT_PUBLIC_APP_URL | Fallback | Public app URL fallback |
| ENCRYPTION_KEY | Yes untuk server/worker | Enkripsi token dan token media internal; simpan sebagai secret |
| DATABASE_URL | Yes | PostgreSQL connection URL |
| DATABASE_SSL | Optional | Set false hanya bila database development memang tidak memakai TLS |

### Supabase

| Variable | Required | Purpose |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Yes | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | Browser/server Supabase client key |
| SUPABASE_SERVICE_ROLE_KEY | Yes untuk server/storage | Privileged server-side operations; jangan expose ke client |
| SUPABASE_MEDIA_BUCKET | Optional | Nama bucket media; default post-media |

### Redis / worker

| Variable | Required | Purpose |
| --- | --- | --- |
| REDIS_URL | Yes | Redis Cloud TCP/TLS URL untuk BullMQ, worker, rate limit, lock, dan heartbeat; gunakan `redis://default:PASSWORD@HOST:PORT` atau `rediss://default:PASSWORD@HOST:PORT` |
| REVIEW_AUTOMATION_INTERVAL_MS | Optional | Interval scheduler review automation |
| CAMPAIGN_AUTOMATION_INTERVAL_MS | Optional | Interval scheduler campaign automation |

### Social provider credentials

| Provider | Variables |
| --- | --- |
| Meta/Facebook | META_CLIENT_ID, META_CLIENT_SECRET, optional META_GRAPH_API_VERSION |
| Instagram Login | INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, optional INSTAGRAM_GRAPH_API_VERSION |
| TikTok | TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET |
| Threads | THREADS_CLIENT_ID, THREADS_CLIENT_SECRET |
| LinkedIn | LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, optional LINKEDIN_API_VERSION |
| YouTube | YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET |
| X | X_CLIENT_ID, X_CLIENT_SECRET |

Optional NEXT_PUBLIC_MEDIA_MAX_UPLOAD_MB mengatur batas upload aplikasi. Default source code saat ini adalah 50 MB; bucket media diselaraskan oleh server dengan batas aplikasi.

## Development

Jalankan web application:

    npm run dev

Default development URL Next.js biasanya http://localhost:3000. OAuth redirect URI provider harus sama persis dengan:

    <app-url>/api/oauth/<platform>/callback

Contoh path callback: /api/oauth/linkedin/callback.

## Worker

Publish worker memproses publish dan analytics queue:

    npm run worker

Worker ini membaca queue BullMQ dari Redis, menjalankan publish target per social account, menangani retry/recovery, dan memproses analytics sync. Publish job harus membawa identifier saja; token tidak dimasukkan ke payload.

    Next.js
       ↓
    Redis / BullMQ
       ↓
    publish-worker
       ↓
    Social Provider
       ↓
    Social API

Konfigurasi worker membutuhkan DATABASE_URL, Redis URL, ENCRYPTION_KEY, serta credential provider yang akan dipakai.

## Other Workers

Worker berikut adalah process dan queue yang berbeda dari npm run worker:

    npm run webhook-worker
    npm run review-automation-worker
    npm run campaign-automation-worker

- webhook-worker mengirim outgoing webhook deliveries.
- review-automation-worker menjalankan review automation scheduler.
- campaign-automation-worker menjalankan campaign evaluation dan intelligence automation.

## Social Provider Architecture

    SocialProvider
    ├── Instagram  (Meta Graph)
    ├── Facebook   (Meta Graph / Page)
    ├── TikTok
    ├── Threads
    ├── LinkedIn
    └── X

Core publishing mengenal contract umum seperti connect, validateContent, publish, dan optional getPublishStatus. Detail endpoint, OAuth scope, dan media handling tetap berada di provider masing-masing.

## Publishing Flow

    Create Post
       ↓
    Select social accounts
       ↓
    Upload media / reference stored media
       ↓
    Publish Now atau Schedule
       ↓
    Create post_platform targets
       ↓
    Create execution dan enqueue job
       ↓
    BullMQ / Redis
       ↓
    publish-worker
       ↓
    Social Provider
       ↓
    External Social API
       ↓
    Execution result
       ↓
    Post status

Satu post dapat memiliki beberapa target, termasuk beberapa akun pada platform yang sama. Target diidentifikasi dengan socialAccountId, bukan hanya nama platform.

## Scheduling

Scheduling menyimpan waktu publikasi sebagai timestamp UTC dan menyimpan IANA timezone untuk rendering kembali di UI. Target terjadwal diproses melalui delayed BullMQ jobs dan recovery sweep worker. Database tetap menjadi sumber data posting dan target.

## Media Handling

- Upload menerima JPEG, PNG, WebP, MP4, dan MOV sesuai batas aplikasi.
- Server memvalidasi magic bytes, bukan hanya MIME hint dari browser.
- Object media disimpan di Supabase Storage private dengan key internal.
- Provider yang membutuhkan URL menerima URL yang dibuat saat publish.
- TikTok Photo memakai /api/media/tiktok/[id] dengan token opaque yang terikat pada post_media.id, purpose, dan expiry; bucket tidak dibuat public.
- Provider upload-based seperti LinkedIn membaca media sebagai bytes di server.

## Testing

Command yang tersedia di package.json:

    npm test
    npm run test:integration
    npm run test:all
    npm run lint
    npm run typecheck
    npm run build

- npm test: unit dan provider tests di src/**/*.test.ts.
- npm run test:integration: integration tests di tests/**/*.test.ts.
- npm run test:all: menjalankan keduanya.
- npm run lint: ESLint.
- npm run typecheck: TypeScript tanpa emit.
- npm run build: production build Next.js.

Utility tambahan yang tersedia:

    npm run diagnostic:meta
    npm run test:auth
    npm run seed:user -- --email <email> --password <password>

Gunakan credential test lokal saja untuk script seed/auth. Jangan masukkan credential asli ke log atau issue.

## Production Build

    npm run build
    npm run start

npm run start menjalankan Next.js production server setelah build berhasil. Worker harus dijalankan sebagai process terpisah.

## Deployment

Repository ini tidak menyertakan vercel.json, Railway manifest, Docker Compose, atau deployment manifest lain. Arsitektur deployment yang diperlukan berdasarkan source code adalah:

    Web process
      └── Next.js (npm run start)

    Worker process(es)
      ├── npm run worker
      ├── npm run webhook-worker
      ├── npm run review-automation-worker
      └── npm run campaign-automation-worker

    Managed services
      ├── Supabase: Auth / PostgreSQL / private Storage
      └── Redis TCP: BullMQ queues

Platform hosting dapat dipilih sesuai infrastruktur deployment, tetapi setiap process harus menerima environment variables yang sesuai dan worker harus dapat menjangkau database serta Redis.

## Troubleshooting

### Job berada di queue tetapi tidak diproses

Pastikan worker aktif:

    npm run worker

Periksa Redis TCP URL dan pastikan worker mencetak status worker started.

### Connect disabled atau provider belum dikonfigurasi

Periksa client ID/secret provider di .env.local, restart web process dan worker, lalu pastikan OAuth redirect URI terdaftar persis di dashboard provider.

### OAuth redirect mismatch

Pastikan APP_URL cocok dengan domain yang didaftarkan dan callback menggunakan path /api/oauth/<platform>/callback.

### Account membutuhkan reconnect

Reconnect account dari halaman Connected Accounts. Perubahan atau kehilangan ENCRYPTION_KEY dapat membuat token tersimpan tidak dapat didekripsi.

### Media ditolak

Pastikan file termasuk JPEG, PNG, WebP, MP4, atau MOV, berada di bawah batas ukuran, dan tidak hanya mengganti extension file. Server memeriksa magic bytes dan metadata media.

### Publish terhenti pada status processing

Periksa publish worker, koneksi Redis, database, dan status execution. Worker memiliki retry BullMQ dan recovery sweep untuk target yang stale.

### Public media URL gagal diakses provider

Periksa APP_URL production harus HTTPS dan dapat dijangkau provider. Untuk TikTok Photo, token delivery harus valid dan belum expired; jangan membuat bucket Supabase menjadi public.

## Security Notes

- Jangan expose access token, refresh token, client secret, service-role key, cookie, atau ENCRYPTION_KEY ke frontend.
- Jangan memasukkan token, caption, atau media URL sensitif ke queue payload atau log.
- Token social disimpan terenkripsi dan didecrypt hanya pada server saat diperlukan.
- .env.local tidak boleh di-commit.
- Social account selection adalah input client, tetapi ownership dan permission tetap divalidasi server-side.
- Supabase Storage media tetap private.
- Gunakan public media delivery hanya untuk flow provider yang memang memerlukannya dan selalu gunakan token/purpose/expiry yang sesuai.

## Development Guidelines

- Letakkan logic provider-specific di src/providers/social/<platform>.
- Pertahankan queue payload berbasis identifier.
- Tambahkan atau update test provider saat mengubah endpoint atau media flow.
- Jangan menambahkan credential ke source, test output, atau dokumentasi.
- Jangan melakukan migration database jika kebutuhan tidak terbukti.
- Master Plan adalah dokumen roadmap; perubahan implementasi dan dokumentasi tidak boleh mengubahnya.

## Known Limitations

- Live publish belum dapat diverifikasi hanya dari automated tests; setiap platform membutuhkan OAuth credential, scope, entitlement, dan akun yang valid.
- Deployment hosting tidak dikunci di repository karena tidak ada deployment manifest resmi di root.
- LinkedIn image menggunakan Images API, sementara flow LinkedIn video masih menggunakan Assets API.
- .env.example berisi placeholder dan bukan provisioning script; environment production harus dikonfigurasi di secret manager/hosting platform.

## License

Repository menggunakan MIT License. Lihat LICENSE.

## Documentation

- Social platform notes: docs/SOCIAL-PLATFORMS.md
- Manual testing: MANUAL-TESTING.md
- Internal API notes: docs/API-INTERNAL.md
- Performance audit: docs/PERFORMANCE-AUDIT.md
