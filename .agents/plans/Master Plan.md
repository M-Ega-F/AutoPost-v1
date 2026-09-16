Anda bekerja di repository:

C:\Users\aldis\Documents\Codex\AutoPost-v1

==================================================
TUJUAN
==================================================

Saya ingin menambahkan Public API v1 ke AutoPost.

Tujuan:

1. Audit seluruh API yang sekarang ada.
2. Bedakan API internal aplikasi dengan API yang layak menjadi Public API.
3. Desain sistem API Key yang aman.
4. Implementasikan Public API v1 dengan perubahan seminimal mungkin.
5. Public API harus menggunakan domain/service/business logic existing.
6. Jangan membuat publishing pipeline baru.
7. Jangan mengganggu frontend yang sudah berjalan.
8. Jangan mengganggu BullMQ/Redis/worker.
9. Jangan mengganggu Facebook OAuth.
10. Jangan mengganggu Instagram Standalone OAuth.
11. Jangan mengganggu TikTok/Threads.
12. Jangan mengubah Master Plan.
13. Jangan commit atau push.

==================================================
NON-NEGOTIABLE RULES
==================================================

1. MASTER PLAN ADALAH SOURCE OF TRUTH

File:

    .agents/plans/Master Plan.md

WAJIB dibaca untuk memahami architecture.

JANGAN EDIT FILE TERSEBUT.

Tidak boleh:
- overwrite
- rewrite
- append
- format ulang
- mengubah isi Master Plan

2. MINIMAL CHANGE

Jangan melakukan refactor besar.

Pertahankan:
- existing domain layer
- existing service layer
- existing repository/data access
- existing auth
- existing publishing flow
- existing provider architecture
- existing queue
- existing worker
- existing frontend API behavior

Public API harus menjadi adapter/layer baru di atas business logic existing jika memungkinkan.

3. NO DUPLICATE BUSINESS LOGIC

Jangan membuat:

    Public API → duplicate create post logic

Jika existing flow sudah:

    API/UI
      ↓
    Action/Service
      ↓
    Domain
      ↓
    Queue

maka Public API harus memanfaatkan service/domain existing.

4. JANGAN UBAH FACEBOOK / INSTAGRAM

Facebook OAuth yang sudah berhasil harus tetap bekerja.

Instagram Standalone OAuth yang baru selesai juga harus tetap bekerja.

Jangan mengubah:
- Facebook OAuth
- Instagram OAuth
- Instagram Login
- token exchange
- connected account behavior
- publishing provider behavior

kecuali audit membuktikan dependency langsung dengan Public API.

5. JANGAN UBAH WORKER

Jangan mengubah:
- BullMQ queue architecture
- worker command
- worker concurrency
- job payload contract
- provider execution architecture

Public API hanya membuat/menjadwalkan resource dan menggunakan queue existing.

6. NO COMMIT / PUSH

Jangan menjalankan:

    git commit
    git push
    git reset --hard
    git clean -fd

Saya akan commit/push sendiri.

==================================================
PHASE 0 — REPOSITORY AUDIT
==================================================

Sebelum coding, audit repository secara menyeluruh.

WAJIB baca:

    .agents/plans/Master Plan.md

Kemudian audit:

    src/app/api
    src/lib/actions
    src/lib/domain
    src/lib/services
    src/lib/auth
    src/lib/queue
    src/workers
    src/providers
    database/schema/migrations
    middleware/proxy
    validation
    rate limiting

Cari semua route API.

Keyword:

    /api/
    route.ts
    NextRequest
    NextResponse
    cookies
    Authorization
    Bearer
    session
    API key
    rate limit
    idempotency

==================================================
PHASE 1 — INVENTORY SELURUH API
==================================================

Buat inventory semua endpoint existing.

Untuk setiap endpoint dokumentasikan:

    METHOD
    PATH
    AUTH METHOD
    USER/WORKSPACE REQUIREMENT
    PERMISSION
    PURPOSE
    INPUT
    OUTPUT
    SIDE EFFECT
    DOMAIN/SERVICE USED
    SENSITIVE DATA
    PUBLIC API CANDIDATE
    REASON

Contoh:

    POST /api/...
    Auth: session
    Permission: ...
    Purpose: ...
    Side effect: ...
    Public candidate: YES/NO

Jangan menganggap semua `/api/*` sebagai public API.

==================================================
PHASE 2 — CLASSIFICATION
==================================================

Kelompokkan existing API menjadi:

A. INTERNAL APP API

Contoh:

    frontend → API → session/cookie

B. ADMIN API

Contoh:

    admin → API → elevated permission

C. OAUTH/CALLBACK API

Contoh:

    Meta/Instagram/TikTok OAuth callback

D. WEBHOOK API

Jika ada.

E. PUBLIC-CAPABLE API

Endpoint yang secara konsep aman untuk diekspos melalui Public API.

F. NEVER PUBLIC

Endpoint yang tidak boleh diekspos sebagai Public API.

Contoh NEVER PUBLIC:

    token import
    OAuth callback
    secret/config endpoints
    admin-only endpoints
    internal health/debug endpoints
    internal queue endpoints
    credential endpoints

==================================================
PHASE 3 — AUDIT EXISTING AUTHORIZATION
==================================================

Audit bagaimana aplikasi sekarang menentukan:

    user
    workspace
    account ownership
    permissions
    roles
    admin/owner
    session

Cari reusable function/service.

Jangan membuat authorization system kedua jika existing authorization
sudah bisa digunakan.

Public API harus dapat memetakan:

    API Key
       ↓
    API Key owner
       ↓
    workspace
       ↓
    permissions

Pastikan tidak terjadi:

    API Key User A
       ↓
    Workspace User B

==================================================
PHASE 4 — API KEY SYSTEM DESIGN
==================================================

Desain sistem API Key.

Target konsep:

    User/Workspace
          ↓
       API Key
          ↓
    hash stored in DB
          ↓
    request authentication
          ↓
    workspace/user context
          ↓
    permission check
          ↓
    Public API

Raw API key:

    JANGAN disimpan plaintext di database.

Gunakan:

    cryptographically secure random key
    one-way hash for storage

API key harus memiliki identifier/prefix yang aman untuk lookup.

Contoh konsep:

    ap_live_xxxxxxxxxxxxxxxxx

Tetapi jangan hardcode format jika repository memiliki convention lain.

==================================================
API KEY DATA MODEL
==================================================

Audit database terlebih dahulu.

Cari apakah sudah ada tabel:

    api_keys
    access_tokens
    personal_access_tokens
    developer_keys
    integrations

Jika sudah ada yang cocok:

    gunakan kembali jika aman.

Jangan membuat duplicate system.

Jika belum ada, desain tabel minimal.

Konsep field:

    id
    workspace_id / owner_id
    name
    key_prefix
    key_hash
    permissions/scopes
    created_at
    last_used_at
    revoked_at
    expires_at (jika architecture membutuhkan)
    metadata jika benar-benar diperlukan

Jangan menyimpan raw key.

Jika permission disimpan sebagai JSON/array, ikuti convention database
existing.

==================================================
API KEY LIFECYCLE
==================================================

Minimal lifecycle:

    create
    authenticate
    use
    revoke

Optional:

    rotate
    expiration

API key creation:

    User creates key
       ↓
    generate random secret
       ↓
    hash
       ↓
    store hash
       ↓
    show raw key ONCE

Setelah itu raw key tidak bisa diambil kembali.

Jika user kehilangan key:

    revoke old key
    create new key

Jangan menyediakan endpoint:

    GET /api-keys/:id/reveal

==================================================
API KEY PERMISSIONS
==================================================

Jangan langsung membuat permission terlalu kompleks.

Audit existing permission system.

Jika existing system punya permission seperti:

    accounts:manage
    posts:read
    posts:write

reuse.

Jika tidak ada Public API permission yang sesuai, desain minimal.

Minimal target:

    posts:read
    posts:write

Jika diperlukan:

    accounts:read
    scheduled:read
    scheduled:write
    analytics:read

Jangan memberikan:

    admin:*
    OAuth management
    credential access

kepada Public API key.

API key harus mengikuti principle of least privilege.

==================================================
API KEY AUTHENTICATION
==================================================

Public API menggunakan:

    Authorization: Bearer <API_KEY>

Contoh:

    Authorization: Bearer ap_live_xxxxxxxxx

Jangan menerima API key melalui:

    query parameter
    URL
    cookie

kecuali ada alasan architecture yang sangat kuat.

API key jangan pernah muncul di logs.

Jangan log:

    Authorization header
    raw API key
    full request headers

Safe log:

    key id
    key prefix
    workspace id jika aman
    route
    method
    status
    duration
    request id

==================================================
API VERSIONING
==================================================

Public API harus memiliki namespace:

    /api/v1/...

Jangan mengubah endpoint internal existing menjadi:

    /api/v1/...

secara langsung jika itu berpotensi merusak frontend.

Buat route Public API baru.

Target:

    /api/v1/posts
    /api/v1/posts/:id
    /api/v1/accounts

Jika repository memiliki naming convention berbeda,
ikuti convention existing selama tetap versioned.

==================================================
PHASE 5 — PUBLIC API MVP DESIGN
==================================================

Jangan expose semua functionality sekaligus.

Mulai dari API minimal yang benar-benar berguna.

Target MVP:

    GET  /api/v1/posts
    GET  /api/v1/posts/:id

    POST /api/v1/posts

    POST /api/v1/posts/:id/publish
    POST /api/v1/posts/:id/cancel

    GET /api/v1/accounts

Jika scheduling existing architecture mudah dipakai tanpa perubahan besar:

    POST /api/v1/posts
    dengan scheduledAt

Tidak perlu membuat endpoint scheduling terpisah jika tidak diperlukan.

==================================================
POST CREATE API
==================================================

Audit existing Create Post flow terlebih dahulu.

Cari:

    createPostAction
    createPost
    createDraft
    publishDraft
    scheduling logic
    media upload logic

Public API jangan duplicate logic.

Target konsep:

    Public API
       ↓
    existing service/domain
       ↓
    post
       ↓
    post_platforms
       ↓
    queue
       ↓
    worker

Jika existing Create Post flow membutuhkan browser-specific
media upload/session behavior, jangan memaksakan API untuk memakai
browser implementation.

Desain API media upload secara terpisah jika memang diperlukan.

==================================================
MEDIA API
==================================================

Audit bagaimana media sekarang di-upload.

Cari:

    Supabase Storage
    signed URL
    upload route
    media asset
    pending media
    MIME validation
    size validation

Jangan membuat API:

    POST /api/v1/posts

yang menerima file besar secara tidak efisien jika architecture existing
menggunakan Storage.

Jika diperlukan, Public API MVP dapat:

    1. Create media/upload session
    2. Upload to storage
    3. Create post referencing media

Tetapi jangan implementasikan kompleksitas tersebut jika existing
architecture sudah menyediakan mekanisme reusable.

Audit dahulu.

==================================================
IDEMPOTENCY
==================================================

Untuk mutating Public API, implementasikan idempotency jika existing
architecture sudah memiliki infrastructure.

Minimal:

    POST /api/v1/posts
    POST /api/v1/posts/:id/publish

dapat menerima:

    Idempotency-Key: <unique-key>

Jangan membuat duplicate post/publish akibat retry dari client.

Audit existing idempotency implementation terlebih dahulu.

Jika sudah ada:

    reuse.

Jika belum:

    implementasi minimal yang aman.

Jangan menyimpan entire response indefinitely.

Tetapkan TTL yang reasonable sesuai existing Redis architecture.

==================================================
RATE LIMITING
==================================================

Audit existing rate limiter.

Gunakan infrastructure existing jika tersedia.

Public API rate limit harus dipisahkan dari browser/session traffic.

Concept:

    API key
       ↓
    rate limit

bukan hanya IP.

Tetap pertimbangkan IP sebagai abuse signal jika architecture
existing mendukung.

Jangan membuat rate limit yang terlalu agresif sampai mengganggu
normal API usage.

Jika belum ada documented default, gunakan conservative MVP limit
dan dokumentasikan.

Jangan mengklaim angka tersebut sebagai final product policy jika belum
ditetapkan.

==================================================
ERROR CONTRACT
==================================================

Public API harus memiliki error response konsisten.

Target konsep:

    {
      "error": {
        "code": "..."
        "message": "..."
      }
    }

HTTP status harus konsisten.

Contoh:

    401
    invalid/missing API key

    403
    valid key tetapi permission tidak cukup

    404
    resource tidak ditemukan / tidak boleh diakses

    409
    idempotency/conflict

    422
    validation error

    429
    rate limit

    500
    unexpected internal error

Jangan expose stack trace.

Jangan expose database error mentah.

Jangan expose provider credential.

==================================================
RESOURCE OWNERSHIP
==================================================

Public API key hanya boleh mengakses resource milik workspace/account
yang terkait dengan key.

Contoh:

    API Key Workspace A
          ↓
    GET /api/v1/posts/post-owned-by-B

harus ditolak atau diperlakukan sebagai not found sesuai security policy.

Jangan sampai API key dapat enumerate resource workspace lain.

Audit semua query.

Pastikan filtering workspace/owner dilakukan di database/domain layer,
bukan hanya UI.

==================================================
PUBLISH API
==================================================

Public API publish harus menggunakan publish flow existing.

JANGAN:

    Public API
       ↓
    direct Meta API

JANGAN:

    Public API
       ↓
    direct Instagram API

JANGAN:

    Public API
       ↓
    direct Facebook API

Harus:

    Public API
       ↓
    existing domain/service
       ↓
    post platform
       ↓
    BullMQ
       ↓
    publish worker
       ↓
    provider
       ↓
    social platform

Dengan demikian:

    frontend
    public API

menggunakan publishing engine yang sama.

==================================================
SOCIAL ACCOUNT API
==================================================

Jika expose:

    GET /api/v1/accounts

response hanya boleh berisi data aman.

Contoh:

    id
    platform
    username
    displayName
    status
    connectedAt

Jangan pernah mengembalikan:

    access token
    refresh token
    encrypted token
    client secret
    OAuth state
    provider credential

Jangan expose credential metadata yang dapat membantu mengambil secret.

==================================================
OAUTH BOUNDARY
==================================================

Public API TIDAK boleh menjadi cara untuk:

    retrieve OAuth token
    retrieve Facebook token
    retrieve Instagram token
    retrieve TikTok token
    retrieve Threads token

Public API hanya dapat menggunakan connected account yang sudah dimiliki
workspace.

OAuth tetap menggunakan flow existing:

    Facebook OAuth
    Instagram Standalone OAuth
    TikTok OAuth
    Threads OAuth

Jangan menyatukan OAuth dengan API key.

==================================================
ADMIN API / MANUAL IMPORT
==================================================

Audit endpoint sementara:

    /api/admin/instagram/import-token

Endpoint tersebut BUKAN Public API.

Jangan expose melalui:

    /api/v1

Jika importer sudah tidak dibutuhkan lagi dan standalone Instagram OAuth
sudah terbukti bekerja, rekomendasikan penghapusannya.

Jangan menghapusnya secara otomatis jika masih dibutuhkan untuk migrasi
tanpa terlebih dahulu memastikan dependency.

==================================================
API KEY MANAGEMENT UI/API
==================================================

Audit existing Settings page.

Jika sesuai architecture, tambahkan:

    Settings
      ↓
    API Keys

Minimal UI:

    API Keys
      - Name
      - Created
      - Last used
      - Status
      - Revoke

Create:

    Create API Key
      ↓
    Name
      ↓
    Permissions
      ↓
    Generate
      ↓
    Show secret ONCE

Jangan tampilkan secret lagi setelah modal/page ditutup.

Jika menambahkan UI membutuhkan perubahan besar, implementasikan backend
API key infrastructure dahulu dan dokumentasikan UI sebagai follow-up.

Jangan melakukan redesign Settings.

==================================================
API KEY MANAGEMENT ENDPOINTS
==================================================

Jika existing architecture cocok, gunakan internal authenticated routes
untuk management key.

Contoh:

    POST   /api/api-keys
    GET    /api/api-keys
    DELETE /api/api-keys/:id

PERHATIAN:

Endpoint management ini adalah INTERNAL APP API.

Jangan menggunakan Public API key untuk membuat/revoke API key.

User harus authenticated melalui normal application auth.

==================================================
DATABASE MIGRATION
==================================================

Jika perlu tabel baru:

    buat migration kecil dan additive.

Jangan destructive migration.

Jangan mengubah existing social account schema jika tidak diperlukan.

Jangan mengubah:

    post_platforms
    social_accounts

hanya untuk menambahkan API key.

Jika workspace model existing lebih tepat daripada user_id,
gunakan workspace ownership sesuai architecture.

==================================================
SECURITY AUDIT
==================================================

Sebelum selesai, audit:

1. API key entropy.
2. Hashing.
3. Timing-safe comparison jika diperlukan.
4. Authorization.
5. Workspace isolation.
6. Permission/scopes.
7. Rate limit.
8. Idempotency.
9. Replay behavior.
10. Revocation.
11. Expiration jika digunakan.
12. Logging.
13. Error messages.
14. Input validation.
15. SSRF risk jika API menerima URL.
16. File upload abuse.
17. Resource enumeration.
18. Mass assignment.
19. SQL injection protection.
20. Secret leakage.

Jika Public API menerima external URLs:

    jangan fetch arbitrary URLs

tanpa SSRF protection.

Jika tidak diperlukan untuk MVP:

    jangan implementasikan URL fetching.

==================================================
DOCUMENTATION
==================================================

Buat/update dokumentasi Public API.

Misalnya:

    docs/API-PUBLIC.md

Jika repository memiliki dokumentasi API existing,
gunakan file tersebut daripada membuat duplicate.

Dokumentasi minimal:

    Authentication
    API keys
    Permissions
    Base URL
    Versioning
    Endpoints
    Request examples
    Response examples
    Errors
    Rate limits
    Idempotency
    Resource ownership
    Pagination
    Security

Contoh request:

    curl \
      -H "Authorization: Bearer ap_live_xxx" \
      https://example.com/api/v1/posts

Jangan menggunakan secret nyata.

==================================================
PAGINATION
==================================================

Audit existing list endpoints.

Untuk:

    GET /api/v1/posts

gunakan pagination yang konsisten.

Jika existing app sudah menggunakan:

    cursor
    limit
    offset

reuse jika cocok.

Jangan membuat pagination system baru tanpa alasan.

Tetapkan maximum page size.

Jangan memungkinkan:

    ?limit=999999999

==================================================
FILTERING / SORTING
==================================================

Public API list posts minimal boleh memiliki filter yang memang didukung
existing domain/query layer.

Contoh jika mudah:

    status
    platform
    date range

Jangan menambahkan query language kompleks.

==================================================
OBSERVABILITY
==================================================

Public API harus punya request/correlation ID jika existing system
sudah memilikinya.

Safe log:

    requestId
    API key id
    route
    method
    status
    duration
    workspace id jika policy memperbolehkan

Jangan log:

    Authorization
    raw API key
    social token
    OAuth code
    client secret

==================================================
PHASE 6 — IMPLEMENTATION PLAN
==================================================

Sebelum coding, tampilkan:

## Current API Architecture

## API Inventory

## Internal vs Public Classification

## Existing Auth Architecture

## Existing Permission Architecture

## Existing Rate Limit Architecture

## Existing Idempotency Architecture

## Existing Database Structure

## Proposed API Key Architecture

## Proposed Public API v1

## Files To Modify

## Files To Create

## Files That Must NOT Be Modified

## Database Migration Required?

## Risks

## Backward Compatibility

Kemudian implementasikan.

Jangan berhenti setelah audit jika tidak ada blocker.

==================================================
PHASE 7 — TESTING
==================================================

Tambahkan tests untuk API key:

1. Create API key.
2. Raw key hanya muncul saat creation.
3. Raw key tidak tersimpan plaintext.
4. Correct key authenticates.
5. Wrong key rejected.
6. Revoked key rejected.
7. Expired key rejected jika expiration digunakan.
8. Permission denied.
9. Workspace isolation.
10. last_used_at behavior.
11. API key tidak muncul di logs.

Public API:

12. GET posts.
13. GET post detail.
14. POST create post.
15. Publish.
16. Cancel.
17. Accounts.
18. Validation errors.
19. Unauthorized.
20. Forbidden.
21. Not found.
22. Rate limit.
23. Idempotency.
24. Duplicate request behavior.
25. Pagination.

Regression:

26. Existing frontend API tests.
27. Existing Facebook tests.
28. Existing Instagram tests.
29. Existing OAuth tests.
30. Existing worker tests.
31. Existing publishing tests.

==================================================
VALIDATION
==================================================

Jalankan:

    npm run lint
    npm run typecheck
    npm test
    npm run test:integration
    npm run test:all
    npm run build
    git diff --check

Jika migration dibuat:

    npm run db:generate
    npm run db:migrate

Jangan gunakan:

    drizzle push

untuk production.

Jangan mengklaim test berhasil jika command belum benar-benar dijalankan.

==================================================
MANUAL TEST
==================================================

Setelah automated tests:

1. Login ke AutoPost.
2. Buka Settings.
3. Create API Key.
4. Copy secret.
5. Panggil:

    GET /api/v1/accounts

6. Panggil:

    GET /api/v1/posts

7. Create post melalui Public API.
8. Pastikan post masuk database.
9. Jika publish dipanggil, pastikan masuk BullMQ.
10. Pastikan worker memproses job.
11. Pastikan provider tetap bekerja.

Kemudian:

12. Revoke API key.
13. Panggil API lagi.
14. Pastikan 401.

Test workspace isolation jika tersedia.

==================================================
COMPATIBILITY TEST
==================================================

Pastikan setelah implementasi:

    Frontend
       ↓
    Existing API

tetap berjalan.

Dan:

    Public API
       ↓
    New /api/v1
       ↓
    Existing domain/service
       ↓
    Existing queue/worker/provider

Tidak ada duplicate publishing engine.

==================================================
FINAL REPORT
==================================================

Berikan:

# Public API v1 Implementation Report

## Status

    DONE / BLOCKED

## Current API Audit

Jumlah endpoint dan kategorinya.

## API Key Architecture

Jelaskan:

    generation
    storage
    hashing
    authentication
    permissions
    revocation

## Public API v1

Daftar endpoint final.

## Authentication

Cara API key digunakan.

## Permissions

Daftar permission final.

## Rate Limit

Implementasi aktual.

## Idempotency

Implementasi aktual.

## Database

Migration yang dibuat atau:

    NO DATABASE CHANGE

## Files Changed

Daftar file aktual.

## Files Created

Daftar file aktual.

## Files Not Modified

Pastikan:

    Master Plan
    Facebook OAuth
    Instagram OAuth
    worker
    provider publishing

tidak berubah kecuali ada dependency yang dijelaskan.

## Tests

Tampilkan hasil aktual:

    npm run lint
    npm run typecheck
    npm test
    npm run test:integration
    npm run test:all
    npm run build
    git diff --check

## Manual Test

Langkah yang harus dilakukan.

## Environment Variables

Tambahkan hanya yang diperlukan.

Update `.env.example` tanpa secret.

## Security Notes

Ringkas hasil security audit.

## Follow-up

Pisahkan:

    REQUIRED BEFORE PRODUCTION

dan:

    OPTIONAL FUTURE IMPROVEMENTS

Jangan mengerjakan future improvements jika tidak diperlukan untuk MVP.

## Git

Pastikan:

    NO COMMIT
    NO PUSH

==================================================
PRINSIP AKHIR
==================================================

Prioritas:

1. Jangan rusak existing system.
2. Public API harus versioned.
3. API key harus aman.
4. API key harus workspace-scoped.
5. Permission harus least privilege.
6. Tidak ada raw secret di database.
7. Tidak ada secret di logs.
8. Tidak ada duplicate business logic.
9. Tidak ada duplicate publishing engine.
10. Public API menggunakan domain/service existing.
11. BullMQ dan worker tetap menjadi execution engine.
12. Facebook OAuth tetap bekerja.
13. Instagram Standalone OAuth tetap bekerja.
14. Frontend existing tetap bekerja.
15. Master Plan tidak disentuh.
16. Perubahan seminimal mungkin.
17. Jangan commit/push.