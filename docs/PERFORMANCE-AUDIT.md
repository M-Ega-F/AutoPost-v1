# Performance Audit

Tanggal audit: 2026-09-16

## Scope dan metode

Audit ini mengikuti Master Plan terbaru dan dibatasi pada profiling statis terhadap:

- `createPostAction` dan seluruh alur pembuatan post;
- halaman `/history`, detail post, polling client, dan request review;
- route `GET /api/posts/[id]/review` beserta helper domain;
- pemanggilan database, Redis/BullMQ, Supabase Auth/Storage, webhook, dan campaign evaluation.

Pada audit awal tidak ada perubahan perilaku, skema database, migrasi, RLS, queue worker, OAuth, provider, auth, atau authorization yang dilakukan. Angka latency di bawah berasal dari baseline log yang tercatat di Master Plan. Pada saat audit awal, stage timing terpisah belum tersedia karena repository belum memiliki instrumentation `[PERF]`; hitungan query adalah inventory dari jalur kode dan perlu dikonfirmasi dengan trace runtime/database.

## Baseline

| Jalur | Baseline | Catatan |
|---|---:|---|
| `POST /create-post` | 15.3 s total | app code 14.9 s |
| `createPostAction` | 9,028 ms | `src/lib/actions/posts.ts` |
| `GET /history` | 3.5–4.1 s | berulang pada log baseline |
| `GET /history?post=...` | 10.2–11.8 s | app code sekitar 10.0–10.8 s |
| `GET /api/posts/.../review` | 9.1 s total | app code 7.3 s |

Baseline belum direproduksi ulang pada audit ini; angka di atas dianggap evidence dari log yang diberikan.

## `createPostAction`

### Alur dan query inventory

`createPostAction` memanggil `requireUserId`, rate limit, validasi schema, `createPostForUser`, tiga `revalidatePath`, lalu mengembalikan hasil. Rate limit, schema validation, timezone conversion, dan provider `validateContent` terlihat sebagai pekerjaan lokal; tidak ditemukan panggilan social API outbound pada jalur ini.

Dengan asumsi user sudah memiliki personal workspace dan active workspace preference, resolusi workspace tipikal berisi empat statement database: select personal workspace, insert membership `on conflict do nothing`, select preference, dan select membership/workspace. Angka di bawah menghitung statement tersebut sebagai query database walaupun insert bisa menjadi no-op.

Untuk `N\) target, post bukan draft, tanpa campaign dan tanpa library media, inventory tipikalnya:

| Stage | Inventory |
|---|---:|
| Auth/session (`getCurrentUser` + `ensurePersonalWorkspace`) | 2 DB statement + 1 Supabase Auth request |
| Active account lookup | 5 DB statement |
| `createPost` permission/workspace | 4 DB statement |
| Account validation | 5 DB statement per target (`N+1` terhadap akun/workspace) |
| Transaction inti | 3 DB statement: post, media, bulk targets insert |
| Queue handoff | `N` Redis/BullMQ `queue.add` berurutan + `N` DB update berurutan untuk `bullmqJobId` |
| Revalidation | 3 invalidation call, timing belum terukur |

Formula static untuk jalur tersebut adalah sekitar `14 + 7N` DB statement, di luar request Auth dan Redis. Tambahan yang teridentifikasi:

- library media: sekitar 5 DB statement untuk `getMediaAssetRowForUser`;
- campaign: 2 DB statement untuk permission explicit workspace dan campaign lookup di dalam transaction;
- scheduled post: 4 DB statement untuk recipient, campaign lookup, membership validation, dan notification insert; campaign evaluation juga di-enqueue secara fire-and-forget;
- approval-required/draft: queue loop tidak dijalankan, sehingga bagian `N` Redis + `N` update tidak muncul.

### Temuan create

1. `getAccountRecord` memanggil `getActiveWorkspaceId` untuk setiap target, padahal workspace sudah ditemukan sebelum loop. Ini menghasilkan resolusi workspace berulang dan lookup akun berulang.
2. Enqueue dan update `postPlatforms.bullmqJobId` berjalan serial di luar transaction. Waktu Redis atau database bertambah secara linear terhadap jumlah target.
3. Notifikasi `POST_SCHEDULED` masih ditunggu oleh action. Webhook dan campaign evaluation di dalam helper dibuat fire-and-forget, tetapi pembuatan notification tetap berada di critical path.
4. `revalidatePath` dipanggil tiga kali setelah seluruh pekerjaan selesai. Biayanya belum diukur, jadi kontribusinya belum dapat diperingkatkan dengan pasti.

## `/history`

### Jalur initial page

`HistoryPage` melakukan auth, settings, lalu secara parallel menjalankan daftar history dan account summaries. Untuk user existing dengan active preference dan minimal satu row post, inventory tipikal:

| Sub-alur | DB statement |
|---|---:|
| Auth + ensure personal workspace | 2 |
| Settings | 1 |
| History authorization/workspace | 4 |
| History count + rows | 2, parallel |
| Batched target summary | 1 |
| Account summaries authorization/workspace + rows | 5 |
| **Total tipikal** | **15** |

Jika tidak ada post, query target summary menjadi nol. First-run settings/workspace provisioning dapat menambah insert/fallback statement.

`loadTargets` memakai satu query `IN (postIds)` untuk semua post pada page. Tidak ditemukan N+1 pada target summary. Namun history dan account summaries masing-masing memanggil jalur active-workspace sendiri sehingga personal workspace, membership, dan preference dibaca berulang dalam request yang sama.

### Detail history `?post=...`

`getPostDetail` baru dipanggil setelah `posts` dan `accounts` selesai. Untuk post tanpa campaign, inventory incremental tipikal:

| Detail stage | DB statement / external call |
|---|---:|
| Summary authorization + post + targets | 6 DB |
| Media row | 1 DB |
| Signed media URL | 1 Supabase Storage request bila hanya `storageKey` tersedia |
| Executions | 1 DB |
| Analytics detail | 11 DB |
| **Incremental tanpa campaign** | **19 DB + optional Storage request** |

Analytics detail sendiri mengulang active-workspace resolution dua kali: sekali sebelum post/target lookup dan sekali lagi di `listAnalyticsSnapshots`. Semua media, executions, analytics, dan intelligence dijalankan serial, bukan sebagai fan-out parallel setelah summary tersedia.

Jika post memiliki campaign, derived intelligence menambah sekitar 6 DB statement. Jika derived summary tidak tersedia, fallback `getCampaignPostIntelligence` membaca campaign dan mengambil batch post/target/snapshot; setiap batch dapat menambah hingga 3 query dan jumlah batch bergantung pada jumlah post campaign. Fallback ini juga diawali resolusi permission/workspace baru.

Dengan demikian, `/history?post=...` dapat mencapai sekitar 34 DB statement sebelum campaign path, dan lebih tinggi untuk campaign intelligence fallback. Ini konsisten dengan baseline 10.2–11.8 s, tetapi belum membuktikan berapa milliseconds yang disumbangkan tiap query.

### Request client yang mengikuti detail

`PostDetail` merender `ReviewPanel`. Saat mount, panel melakukan `fetch('/api/posts/<id>/review', { cache: 'no-store' })`; ini adalah request terpisah setelah server page mengirim detail. Jika user dapat assign reviewer, `ReviewManagement` juga memanggil `/api/workspace/members` secara terpisah.

`HistoryList` tidak melakukan refresh saat mount. Namun `usePolling` menjalankan `router.refresh()` setiap 5 detik selama post atau detail berstatus `processing`/`pending`, maksimum 24 percobaan dan hanya ketika tab terlihat. Setiap refresh mengulang server page dan, bila `post` masih dipilih, detail serial di atas.

Tidak ada bukti dari source saja bahwa browser melakukan duplicate `/history` request pada setiap navigasi. Link Next.js dapat melakukan prefetch, tetapi duplicate request aktual harus dikonfirmasi lewat browser Network trace atau access log dengan request id.

## `GET /api/posts/[id]/review`

Route bersifat `force-dynamic`, memanggil `getUserId`, lalu `getReviewDetail`.

| Stage | DB statement |
|---|---:|
| Auth + ensure personal workspace | 2 + 1 Supabase Auth request |
| Permission context pertama | 4 |
| Post review + event history | 2, parallel |
| Permission context kedua | 4 |
| Review comments | 1 |
| Batched comment mentions | 1 bila ada comment |
| **Total tipikal dengan comments** | **14** |

Review read path tidak memiliki comment/user N+1; mention IDs diambil dengan satu `IN (commentIds)` query. Temuan utamanya adalah permission context dihitung dua kali dan setiap context kembali melalui `ensurePersonalWorkspace`. Response history page dan review panel juga membentuk waterfall antar-request.

Request `/api/workspace/members`, bila capability assign reviewer aktif, menambah request terpisah dengan auth, workspace authorization, dan satu query members; ini bukan bagian dari query review route tetapi ikut menambah waktu render interaktif.

## Database findings

- **Repeated workspace resolution:** `ensurePersonalWorkspace`, preference lookup, dan membership lookup diulang oleh auth, account list, history, detail, analytics, intelligence, dan review helper.
- **N+1:** account validation pada `createPost` adalah N lookup akun, masing-masing disertai active-workspace lookup. History target summary dan review mentions sudah dibatch dan bukan N+1.
- **Sequential independent work:** queue enqueue/update pada create, detail media/executions/analytics/intelligence, serta comments lalu mentions pada review berjalan serial. Sebagian dapat diparalelkan setelah batas authorization dan dependency dipastikan.
- **Over-fetch:** beberapa query memakai `.select()` penuh (`posts`, `socialAccounts`, media, executions, workspace). Dampak payload belum diukur dan perlu dibandingkan dengan contract consumer sebelum diubah.
- **Long transaction:** transaction create hanya berisi campaign lookup dan tiga insert inti; tidak ditemukan network call di dalamnya. Ini bukan bottleneck utama dari source review.
- **External work in critical path:** Supabase Auth, signed Storage URL, Redis/BullMQ, dan scheduled notification berada pada request path yang berbeda-beda. Social publishing sendiri tidak ditunggu oleh create action.
- **Caching/revalidation:** history/review menggunakan dynamic/no-store behavior; polling sengaja memaksa refresh ketika status belum final. Biaya render ulang belum diinstrumentasi.

## Findings dan severity

Severity memakai skala P0 (critical), P1 (tinggi), P2 (menengah), P3 (rendah/investigasi). Confidence menunjukkan kekuatan evidence dari source + baseline, bukan prioritas produk.

| Severity | Finding | Evidence | File/function | Cause | Confidence | Risk |
|---|---|---|---|---|---|---|
| P1 | Queue handoff linear per target | `N` Redis add + `N` DB update serial; create action 9,028 ms | `src/lib/domain/posts.ts` `createPost` | Independent target jobs diproses berurutan | High | Perubahan concurrency/order/error recovery dapat mengubah reliabilitas |
| P1 | Detail history serial dan fan-out besar | `/history?post=...` 10.2–11.8 s; sekitar 19 DB statement tanpa campaign | `src/lib/domain/posts.ts` `getPostDetail` | Media, executions, analytics, intelligence menunggu satu sama lain dan mengulang auth | High | Parallelization harus menjaga authorization dan partial-failure semantics |
| P1 | Review request berada di waterfall client | Review panel fetch setelah detail page; review route baseline 9.1 s | `review-panel.tsx`, `reviews.ts`, review route | Review tidak digabung dengan payload detail dan context diulang | High | Mengubah hydration/loading behavior dapat memengaruhi approval UX |
| P2 | N+1 account/workspace lookup saat create | 5 DB statement per target | `accounts.ts` `getAccountRecord`, `posts.ts` `createPost` | Helper menerima user/account ID, bukan workspace/context yang sudah resolved | High | Batch lookup harus tetap memvalidasi ownership, platform, status |
| P2 | Duplicate workspace resolution di history | initial page sekitar 15 statement tipikal | `history/page.tsx`, workspace/account helpers | Posts dan accounts meminta active workspace sendiri | High | Shared context perlu menjaga fallback/provisioning semantics |
| P2 | Campaign intelligence fallback dapat membesar linear per batch | 1 + hingga 3 query per batch | `campaign-intelligence.ts` | Detail fallback menghitung ulang seluruh campaign | Medium | Cache/derived summary bisa stale; perlu invalidation test |
| P3 | Revalidation dan polling cost belum terukur | 3 `revalidatePath`; refresh tiap 5 s sampai 24 kali | `actions/posts.ts`, `use-polling.ts` | Invalidation/refresh dibuat luas untuk menjaga freshness | Medium | Mengurangi refresh berisiko menampilkan status publish terlambat |
| P3 | Duplicate `/history` belum terbukti dari source | Tidak ada auto refresh mount; prefetch mungkin terjadi | `history/page.tsx`, `history-list.tsx` | Browser navigation/prefetch atau polling dapat terlihat sebagai request berulang | Low | Diagnosis tanpa request id dapat salah arah |

## Rekomendasi optimasi lanjutan dari audit awal

Urutan investigasi yang paling aman:

1. Tambahkan dev/staging timing dengan request/correlation ID dan format `[PERF]`, lalu ukur setiap stage dan setiap DB/Redis call. Sertakan target count, selected post ID, dan apakah polling aktif; jangan log token atau caption.
2. Resolve active workspace/authorization sekali per request dan teruskan context ke helper yang berada dalam request boundary. Pertahankan `ensurePersonalWorkspace` hanya di entry point yang memang memerlukannya.
3. Batch account validation untuk seluruh target dalam satu workspace-scoped query. Pertahankan pemeriksaan user, workspace, platform, status, dan provider validation.
4. Ukur lalu evaluasi `Promise.all` terbatas untuk enqueue target dan batch update job ID. Recovery saat Redis gagal, idempotency BullMQ job ID, dan status pending harus diuji sebelum perubahan concurrency.
5. Setelah summary/authorization tersedia, fan-out media, executions, analytics, dan derived intelligence secara parallel. Reuse workspace ID dan hindari fallback campaign intelligence bila derived summary masih valid.
6. Kurangi waterfall review dengan menggabungkan review summary ke payload detail atau menunda/mengondisikan panel secara eksplisit. Ukur dampak terhadap capability, comments, dan no-store freshness.
7. Rekam browser Network trace untuk `/history` biasa, `/history?post=...`, `/api/posts/.../review`, dan `/api/workspace/members` dengan request ID. Bedakan prefetch, refresh polling, Strict Mode development effect, dan duplicate server request aktual.
8. Baru setelah evidence stage-level tersedia, tinjau kolom `.select()` dan jumlah `revalidatePath`; perubahan ini berisiko lebih rendah tetapi tetap perlu regression test contract.

## Optimization Phase 1

### Before

Baseline audit mencatat sekitar `14 + 7N` DB statement untuk create path non-campaign/non-library dengan `N` target, termasuk `5N` account/workspace lookup dan `2N` update job ID setelah enqueue. Detail history tanpa campaign memiliki sekitar 19 DB statement incremental setelah summary, karena analytics dan intelligence-related workspace resolution dilakukan berulang.

### Changes

1. Active workspace di-resolve sekali di `createPostForUser`, lalu dipakai untuk active account lookup, library media ownership lookup, dan explicit permission check pada `createPost`.
2. Account validation pada `createPost` diganti dari lookup per target menjadi satu workspace/user-scoped `IN (accountIds)` query. Loop provider validation tetap berjalan dalam urutan target yang sama sehingga first-error semantics tetap dipertahankan.
3. `getPostDetail` memuat media, executions, analytics, dan campaign intelligence secara parallel setelah post summary dan authorization berhasil. Analytics dan persisted intelligence menerima workspace yang sudah tervalidasi; permission check tetap dilakukan dengan explicit workspace scope.
4. Queue enqueue dan update `bullmqJobId` sengaja tetap serial. Job identity, payload, ordering, retry, cancellation, dan recovery tidak diubah.

### After

Inventory kode setelah perubahan:

- create path non-campaign/non-library/non-draft: sekitar `11 + 2N` DB statement, ditambah `N` Redis/BullMQ `queue.add`;
- account validation: 1 batch query, bukan 5 query per target;
- detail history tanpa campaign: sekitar 11 DB statement incremental, turun dari sekitar 19;
- detail history dengan derived intelligence: sekitar 14 DB statement incremental, sebelum fallback campaign intelligence;
- queue/Redis operation count dan urutan tidak berubah.

Perhitungan After adalah static query inventory, bukan hasil benchmark runtime.

### Query Count Comparison

| Operation | Before | After |
|---|---:|---:|
| Create, non-campaign/non-library | `14 + 7N` DB | `11 + 2N` DB |
| Account validation | `5N` DB | `1` batch DB |
| Library media lookup | `5` DB tambahan | `1` DB tambahan |
| History detail, no campaign | `19` DB incremental | `11` DB incremental |
| History detail, derived intelligence | `25` DB incremental | `14` DB incremental |
| Queue enqueue | `N` Redis, serial | `N` Redis, serial |

The counts include workspace/membership statement inventory where applicable. The notification/campaign additions for scheduled or campaign-linked posts remain additive as described in the baseline section.

### Timing Comparison

| Request | Before | After |
|---|---:|---:|
| `createPostAction` | 9,028 ms baseline log | Not measured with an authenticated live request |
| `POST /create-post` | 15.3 s baseline log | Not measured with an authenticated live request |
| History detail | 10.2–11.8 s baseline log | Not measured with an authenticated live request |

No timing is fabricated. The test suite runs against a harness and does not represent a comparable authenticated HTTP benchmark. A staging/production trace with request ID and DB/Redis timing is required before claiming a latency percentage.

### Behavior Verification

- Existing create, draft, scheduled, retry, cancellation, worker, and partial-failure integration tests pass.
- Workspace ownership/isolation and permission tests pass.
- Queue jobs still carry the same resource IDs and preserve the existing BullMQ job identity.
- Account validation still rejects foreign, disconnected, and needs-reconnect accounts.
- Approval, notification, webhook, analytics, campaign intelligence, and review test coverage remains green.
- Detail parallelization starts only after summary authorization and retains the existing media Storage error fallback and intelligence fallback behavior.

### Deferred Optimizations

- Redis/BullMQ parallel enqueue or `addBulk`: deferred because the Master Plan requires preserving queue ordering and existing failure/recovery semantics until measured and explicitly tested.
- Removing the client review waterfall: deferred because it changes the payload/loading boundary and is outside this phase's safe detail-read optimization.
- Polling interval and revalidation changes: deferred by explicit Master Plan rule.
- Database indexes/schema/RLS changes: deferred; no SQL plan evidence was collected that justifies a migration in this phase.
- Authenticated before/after benchmark: deferred until a safe staging trace/request-ID harness is available. Dev-only `[PERF][createPostAction]` and `[PERF][history-detail]` total timers now exist; they log only duration and aggregate flags/counts, never credentials or content.

## Scope yang tetap tidak diubah

Tidak ada perubahan pada database schema/migration/RLS, queue/worker architecture, OAuth/provider, polling interval, atau Master Plan. Perubahan lain yang sudah ada di working tree sebelum fase ini dipertahankan dan tidak dianggap sebagai hasil optimasi ini.

# Performance Phase 2 — Shared Latency Audit

Tanggal profiling: 2026-09-16

Phase 2 ini hanya menambahkan profiling development/staging-only dan audit call graph. Tidak ada optimasi tambahan, perubahan query, batching, cache, memoization, perubahan schema, RLS, auth, authorization, atau product behavior.

## Endpoint Baseline

| Endpoint | Observed total | Observed application-code | Evidence |
|---|---:|---:|---|
| `GET /history` | 3.5–4.1 s | belum dipisah | log baseline Master Plan |
| `GET /history?page=1&post=...` | 6.5–7.1 s | 6.2–7.3 s | log post-Phase-1 Master Plan |
| `GET /api/notifications?limit=8` | ~6.0 s | ~5.2 s | log post-Phase-1 Master Plan |
| `GET /api/posts/<id>/review` | ~6.0 s | ~4.2 s | log post-Phase-1 Master Plan |
| `POST /api/posts/<id>/save-as-template` | ~9.6 s | ~7.7 s | log post-Phase-1 Master Plan |
| `GET /templates` | ~3.6 s | ~2.9 s | log post-Phase-1 Master Plan |

Per-stage duration belum tersedia dari log historis. Instrumentation baru mencatatnya ketika development dijalankan normal atau ketika `APP_ENV=staging` diset.

## Shared Call Graph

```text
auth entry
└─ createSupabaseServerClient
   └─ supabase.auth.getUser
      └─ ensurePersonalWorkspace

/history
├─ settings
├─ listHistoryPostsPage
│  └─ requireWorkspacePermission
│     └─ getActiveWorkspaceForUser
└─ listAccountSummaries
   └─ getActiveWorkspaceId → getActiveWorkspaceForUser
      └─ selected post: getPostDetail
         ├─ requireWorkspacePermission
         ├─ media / executions
         ├─ analytics
         └─ campaign intelligence

/api/notifications
└─ getNotifications
   └─ requireNotificationPermission
      └─ preference + workspace member lookup
         └─ notifications rows + total + unread

/api/posts/:id/review
└─ getReviewDetail
   ├─ getPostReviewForUser → permission → post + review events
   ├─ permission again
   └─ comments → batched mentions

/api/posts/:id/save-as-template
└─ savePostAsTemplateForUser
   ├─ permission
   ├─ active workspace
   ├─ source post → media + targets
   ├─ active accounts
   └─ template insert → optional signed URL

/templates
├─ listTemplatesForUser → active workspace → templates → signed URLs
└─ getActiveWorkspaceForUser (page capability check)
```

## Authentication Timing

`getCurrentUser` masih melakukan satu Supabase client creation dan satu `supabase.auth.getUser` per invocation. Tidak ditemukan helper yang membuat koneksi database baru per query; database memakai satu lazy pooled connection di `src/lib/db/index.ts`.

Instrumentation yang ditambahkan:

- `[PERF][shared-auth]`, operation `supabase-client.create`;
- `[PERF][shared-auth]`, operation `supabase.auth.getUser`;
- correlation `endpoint` dan `requestId` dari `withPerfRequest`.

Durasi auth historis per stage: belum tersedia. Baseline hanya membuktikan application-code tinggi, bukan durasi `getUser` secara terpisah. Invocation count dari source: satu auth entry untuk masing-masing request/page target; pengulangan yang terdeteksi berada setelah auth, pada workspace/permission.

## Workspace Timing

`getActiveWorkspaceForUser` selalu memanggil `ensurePersonalWorkspace`, membaca preference, lalu membaca membership/workspace aktif. `getWorkspaceForUser` melakukan membership + workspace join. Entry point dan helper tidak berbagi context lintas fungsi.

| Endpoint | Static invocation pattern | Query inventory per active-workspace resolution |
|---|---|---:|
| `/history` | auth provisioning + history permission + account summaries | sekitar 3 resolutions; 4 statement tipikal masing-masing |
| `/history?post=...` | pola `/history` + detail permission | sekitar 4 resolutions; detail analytics memakai workspace yang sudah tersedia |
| `/api/notifications` | auth provisioning + custom notification workspace lookup | auth provisioning 1; custom lookup 2 query |
| `/api/posts/:id/review` | auth provisioning + permission di review loader + permission kedua | sekitar 3 resolutions |
| `/api/posts/:id/save-as-template` | auth provisioning + permission + explicit workspace + source loader + active accounts | sekitar 5 resolutions |
| `/templates` | auth provisioning + template loader + page capability lookup | sekitar 3 resolutions |

Durasi per resolution: belum terukur pada request terautentikasi. Instrumentation `[PERF][workspace]` sekarang mencatat `ensurePersonalWorkspace`, `getWorkspaceForUser`, `getActiveWorkspaceForUser`, dan custom notification workspace lookup dengan query count statis yang aman.

## Authorization Timing

`requireWorkspacePermission` selalu memanggil `getWorkspaceAuthorizationContext` dan mengevaluasi role permission. Tidak ada authorization check yang dihapus.

- History menjalankan permission untuk list dan lagi untuk selected detail.
- Review menjalankan permission melalui `getPostReviewForUser`, lalu menjalankan permission kedua untuk comments/capabilities.
- Save-as-template menjalankan permission sekali, tetapi helper berikutnya kembali meresolve active workspace beberapa kali.
- Notifications menjalankan permission sekali melalui helper workspace khusus.
- Create post menjalankan auth entry lalu permission create dengan workspace eksplisit; check permission tetap dipertahankan.

Instrumentation: `[PERF][authorization]` pada `getWorkspaceAuthorizationContext` dan `requireWorkspacePermission`, termasuk permission name tetapi tidak user ID, token, caption, atau credential.

Durasi authorization per stage: belum tersedia. Evidence yang ada adalah invocation duplication pada call graph dan baseline endpoint timing.

## Database Timing

Instrumentation `[PERF][db]` ditambahkan pada query groups yang relevan dengan target endpoint:

- history summary, count + rows, platform targets, detail media, executions;
- analytics post, targets, snapshots;
- notification workspace/data queries;
- review post + events, comments, dan batched comment mentions;
- template source post, source media + targets, template rows/insert;
- active account summaries, active accounts, dan account validation.

Setiap log berisi operation, duration, query count statis, endpoint, dan correlation ID. Parameter query tidak dicatat.

| Endpoint | Static DB inventory | Repeated operation / N+1 |
|---|---:|---|
| `/history` | sekitar 15 statement tipikal | workspace context diulang antara history dan account summaries; tidak ada target N+1 |
| `/history?post=...` | sekitar 11 incremental tanpa campaign setelah Phase 1 | permission/workspace context masih menjadi shared repeated work |
| `/api/notifications` | 2 workspace + 3 data query | data query sudah parallel; tidak ada notification N+1 |
| `/api/posts/:id/review` | sekitar 14 tipikal dengan comments | permission/workspace context dua kali di review detail; mentions sudah dibatch |
| `/api/posts/:id/save-as-template` | sekitar 20–25 static statement, tergantung fallback/profil media | active workspace resolution berulang; tidak ada loop query per target pada source path |
| `/templates` | sekitar 11 tanpa signed-URL fan-out | workspace resolution di page dan loader; signed URL satu per media template |

Durasi total DB dan slowest query belum bisa disimpulkan dari baseline HTTP. Instrumentation baru mengumpulkan duration saat endpoint dijalankan dengan session valid.

## Serialization Timing

`apiSuccess` sekarang mencatat `[PERF][serialization]` untuk `NextResponse.json` ketika request context profiling aktif. Ini mengukur pembuatan response JSON di server, bukan network flush atau browser parse. Server Component RSC serialization belum dipisahkan dari waktu page render, sehingga selisih application-code pada `/history` belum boleh disebut sebagai serialization tanpa trace lanjutan.

## Notifications Analysis

`GET /api/notifications?limit=8` memiliki shared auth provisioning, lalu custom preference + workspace membership lookup, kemudian tiga query data notification yang sudah dijalankan parallel: rows, total, dan unread count. Mapping `toItem` bersifat lokal dan tidak melakukan user/member lookup tambahan. Evidence terkuat adalah sekitar 5.2 s application-code dengan dua query context sebelum tiga query data; stage duration aktual masih menunggu log profiling.

## Review Analysis

`GET /api/posts/<id>/review` memanggil `getPostReviewForUser`, yang melakukan permission context dan dua query post/events secara parallel. `getReviewDetail` kemudian melakukan permission context kedua, satu query comments, dan satu query mentions yang dibatch. Tidak ada comment/user N+1. Shared bottleneck yang terlihat adalah permission/workspace resolution ganda, bukan comment mention query.

## Save-as-template Analysis

`POST /api/posts/<id>/save-as-template` memiliki permission check, beberapa active-workspace resolution, source post query, media + target queries, active account lookup, template insert, serta optional signed Storage URL ketika response dipetakan. Source media dan targets sudah parallel. Tidak ada webhook/notification pada save-as-template path yang ditemukan dalam source. Kandidat shared latency paling kuat adalah context resolution berulang dengan create post dan templates, tetapi durasi setiap operasi belum tersedia.

## Shared Bottlenecks

### Finding 1 — Repeated workspace/membership/permission resolution

- Evidence: pola yang sama muncul pada history, review, save-as-template, templates, notifications, dan create post; instrumentation kini mencatat setiap invocation.
- Affected endpoints: semua enam target, dengan repetition paling jelas pada review, save-as-template, dan templates.
- Location: `src/lib/auth/server.ts`, `src/lib/domain/workspaces.ts`, `src/lib/auth/authorization.ts`, domain loaders terkait.
- Duration: belum terpisah; endpoint evidence berada pada 2.9–7.7 s application-code sesuai tabel baseline.
- Query count: sekitar 4 statement per generic active-workspace resolution; custom notifications lookup 2 query; review tipikal sekitar 14 total DB statement.
- Confidence: High untuk repetition, Medium untuk kontribusi milliseconds.
- Risk: reuse context dapat mengubah authorization boundary atau fallback provisioning jika diterapkan tanpa desain request context.

### Finding 2 — History detail work berada di luar timer detail lama

- Evidence: `[PERF][history-detail]` historis sekitar 3,010–3,802 ms, sementara HTTP application-code sekitar 6.2–7.3 s.
- Affected endpoints: `/history?post=...`, dan refresh polling ketika detail masih processing.
- Location: `src/app/(app)/history/page.tsx`, `src/lib/domain/posts.ts`, client `ReviewPanel` request terpisah.
- Duration: sekitar 2.5–4.0 s berada di luar timer detail historis; sumber pastinya belum dibuktikan.
- Query count: sekitar 11 incremental detail tanpa campaign setelah Phase 1, ditambah page/list/auth work.
- Confidence: High untuk gap timer, Low/Medium untuk penyebab spesifik.
- Risk: mengatribusi gap langsung ke serialization atau review request tanpa request trace dapat menyesatkan.

### Finding 3 — Review client waterfall dan duplicate context

- Evidence: detail page mengirim request `/api/posts/:id/review` setelah render detail; route review juga menghitung permission context dua kali.
- Affected endpoints: `/history?post=...` dan `/api/posts/:id/review`.
- Location: `src/components/posts/review/review-panel.tsx`, `src/lib/domain/reviews.ts`, `src/lib/domain/post-approvals.ts`.
- Duration: review application-code sekitar 4.2 s; stage breakdown belum tersedia.
- Query count: sekitar 14 tipikal dengan comments.
- Confidence: High untuk waterfall/duplicate invocation.
- Risk: menggabungkan payload atau mengurangi check dapat mengubah freshness, capability, dan authorization semantics.

### Finding 4 — Supabase/database connection creation bukan repeated per helper

- Evidence: `src/lib/db/index.ts` memiliki lazy singleton connection dengan `max: 5`; helper memakai exported `db` proxy.
- Affected endpoints: seluruh endpoint yang memakai Drizzle.
- Duration: belum diukur terpisah.
- Query count: tidak ada connection creation per query dari source.
- Confidence: High untuk source behavior, Low untuk network pool wait tanpa runtime metrics.
- Risk: perubahan connection architecture di luar scope Phase 2.

## Optimization Candidates

### LOW RISK

- Pakai instrumentation baru untuk mengukur stage duration terautentikasi dan membedakan auth, workspace, authorization, DB, Storage, dan serialization.
- Tambahkan request ID ke access log yang sudah ada agar prefetch, polling, dan request review dapat dibedakan.
- Periksa query plan berdasarkan log `[PERF][db]` setelah operasi paling lambat teridentifikasi.

### MEDIUM RISK

- Buat request-scoped authorization/workspace context yang eksplisit, hanya setelah semantics provisioning dan permission diuji per endpoint.
- Evaluasi pengurangan repeated context pada review dan save-as-template setelah before/after trace tersedia.
- Evaluasi pemisahan atau pengkondisian review client waterfall tanpa mengubah freshness/capability.

### HIGH RISK

- Mengubah urutan atau concurrency queue/Redis.
- Menghapus authorization check atau mengandalkan role/context dari caller.
- Global cache untuk auth/workspace/permission.
- Mengubah polling, RLS/schema/index, atau connection architecture tanpa evidence runtime dan regression test.

## Deferred Work

- Tidak ada optimasi Phase 2 yang diterapkan.
- Belum ada timing authenticated staging untuk setiap shared operation; baseline HTTP tidak cukup untuk mengatribusi milliseconds.
- Belum ada EXPLAIN atau DB pool wait metrics; tidak ada migration/index/schema change yang dibenarkan dari evidence saat ini.
- Redis/BullMQ, OAuth/provider, publishing, worker, polling, dan product behavior tetap tidak disentuh.

## Phase 2 Instrumentation Files

- `src/lib/perf.ts`
- `src/lib/auth/server.ts`
- `src/lib/auth/authorization.ts`
- `src/lib/domain/workspaces.ts`
- `src/lib/domain/accounts.ts`
- `src/lib/domain/posts.ts`
- `src/lib/domain/analytics.ts`
- `src/lib/domain/post-approvals.ts`
- `src/lib/domain/reviews.ts`
- `src/lib/domain/notifications.ts`
- `src/lib/domain/reuse.ts`
- `src/lib/api/response.ts`
- target route/page boundaries for history, notifications, review, save-as-template, templates, dan create-post action

# Performance Phase 3 — Request Context Deduplication

Tanggal implementasi: 2026-09-16

Phase 3 mengurangi repeated auth/workspace lookup dalam satu request dengan request-scoped `AsyncLocalStorage`. Context dibuat di boundary target melalui `withPerfRequest`; nama helper dipertahankan dan request yang tidak melewati boundary tersebut tetap memakai behavior lama.

## Bottleneck dan Resolver Duplicate

Audit Phase 2 menemukan pola berikut:

- `getCurrentUser` dapat dipanggil lebih dari sekali oleh helper dalam request yang sama.
- `ensurePersonalWorkspace` dipanggil oleh auth dan setiap active-workspace resolver.
- `getActiveWorkspaceForUser` dipanggil oleh page, loader, service, dan authorization.
- `getWorkspaceForUser` diulang untuk workspace aktif yang sama.
- Review memanggil permission context dua kali; permission check tetap dilakukan, tetapi workspace lookup dapat direuse.

## Pendekatan yang Dipilih

`src/lib/request-context.ts` menyediakan context per async request dengan map terpisah untuk:

- current user promise;
- personal workspace promise per user;
- active workspace promise per user;
- workspace membership promise per user/workspace;
- authorization context promise per user/requested workspace.

Resolver menyimpan promise sebelum menunggu hasilnya sehingga dua loader yang berjalan bersamaan ikut menunggu operasi yang sama. Tidak ada global user/workspace cache, Redis cache, database cache, atau mutable context lintas request.

`withPerfRequest` sekarang selalu membuka request context dan hanya membuka performance logging jika development atau `APP_ENV=staging`. Boundary yang memakai context adalah history, create-post action, notifications, review, save-as-template, dan templates.

## Endpoint yang Terdampak

| Endpoint | Duplicate sebelum | Setelah | Keterangan |
|---|---:|---:|---|
| `/history` | `getActiveWorkspaceForUser` sekitar 2×; auth provisioning terpisah | 1 active resolution + 1 auth provisioning yang reuse personal workspace | account summary dan history berbagi active promise |
| `/history?post=...` | active resolution sekitar 3×; permission context 2× | 1 active resolution; permission checks tetap 2× tetapi workspace lookup 1× | detail hanya reuse context, data result tidak diubah |
| `/api/notifications` | custom workspace lookup 1× setelah auth | tetap 1× | tidak dipaksa masuk generic resolver karena semantics fallback berbeda |
| `/api/posts/:id/review` | active resolution sekitar 2×; permission context 2× | active resolution 1×; permission checks tetap 2× | membership/workspace read direuse |
| `/api/posts/:id/save-as-template` | active resolution sekitar 4× setelah auth | 1× | permission, source loader, dan active account lookup berbagi context |
| `/templates` | active resolution sekitar 2× setelah auth | 1× | page capability check dan template loader berbagi context |
| `POST /create-post` | active + explicit workspace membership lookup | active + cached same-workspace membership lookup | security check tetap ada, duplicate DB read dihindari |

## Request Isolation

- Context berada di `AsyncLocalStorage`, bukan module-level data berisi user/workspace.
- Setiap request boundary membuat map baru; nested boundary memakai context yang sudah ada.
- Cache key tetap menyertakan user ID/workspace ID untuk mencegah reuse silang bila helper dipanggil dengan identity berbeda.
- Promise yang gagal hanya hidup di context request tersebut dan tidak dibawa ke request berikutnya.
- `requireWorkspacePermission` tetap mengevaluasi `hasPermission` pada setiap invocation. Yang direuse adalah context membership/workspace, bukan hasil bypass authorization.
- `getWorkspaceForUser` tetap melakukan user/workspace membership filter; tidak ada RLS, role, atau permission rule yang diubah.

## Before → After Resolution Count

Angka berikut adalah query/resolution inventory dari source, bukan benchmark HTTP:

| Jalur | Before | After | Status |
|---|---:|---:|---|
| Auth `getCurrentUser` dalam target request | 1 per entry point | 1 per request context | deduplicated bila dipanggil ulang |
| Generic active workspace, history tanpa detail | sekitar 2 + auth provisioning | 1 + auth provisioning reuse | estimated from call graph |
| Generic active workspace, history detail | sekitar 3 + auth provisioning | 1 + auth provisioning reuse | estimated from call graph |
| Review active workspace | 2 + auth provisioning | 1 + auth provisioning reuse | estimated from call graph |
| Save-as-template active workspace | sekitar 4 + auth provisioning | 1 + auth provisioning reuse | estimated from call graph |
| Templates active workspace | 2 + auth provisioning | 1 + auth provisioning reuse | estimated from call graph |
| Review permission checks | 2 | 2 | intentionally unchanged |
| Review authorization workspace read | 2 | 1 | same role/ownership check retained |

Generic active workspace resolution tetap sekitar 4 DB statement ketika benar-benar terjadi: personal workspace lookup, membership upsert, preference lookup, dan membership/workspace lookup. Karena perubahan ini hanya deduplication, pengurangan terbesar adalah penghapusan resolusi berulang, bukan perubahan isi query.

## Query Count Before/After

Query count berikut adalah estimasi static untuk context path; query bisnis endpoint tetap berjalan seperti sebelumnya.

| Context path | Before | After |
|---|---:|---:|
| History initial context | sekitar `3 × 4` statement | sekitar `1 × 4` statement |
| History detail context | sekitar `4 × 4` statement | sekitar `1 × 4` statement |
| Review context | sekitar `3 × 4` statement | sekitar `1 × 4` statement |
| Save-as-template context | sekitar `5 × 4` statement | sekitar `1 × 4` statement |
| Templates context | sekitar `3 × 4` statement | sekitar `1 × 4` statement |
| Notifications custom context | `2` query | `2` query |

Angka ini tidak mengklaim total query endpoint dan tidak termasuk business query, signed Storage URL, atau optional fallback. Runtime `[PERF][workspace]`, `[PERF][authorization]`, dan `[PERF][db]` tetap menjadi sumber pengukuran aktual.

## Latency Before/After

Belum ada authenticated before/after staging benchmark. Baseline yang tersedia tetap:

- history detail application-code sekitar 6.2–7.3 s, dengan timer detail historis sekitar 3,010–3,802 ms;
- review application-code sekitar 4.2 s;
- save-as-template application-code sekitar 7.7 s;
- templates application-code sekitar 2.9 s.

Karena stage duration sebelum perubahan tidak tersedia, tidak ada persentase latency yang diklaim. Instrumentation Phase 2 sekarang dapat membuktikan duration dan invocation count pada run development/staging berikutnya.

## Security Validation

- Authenticated and unauthenticated behavior tetap melalui resolver yang sama.
- `getWorkspaceForUser` masih memfilter user ID dan workspace ID.
- Semua `requireWorkspacePermission` dan `hasPermission` check tetap ada.
- Tidak ada perubahan role hierarchy, membership rule, permission rule, RLS, atau database schema.
- Test request-context concurrency memastikan dua request bersamaan memiliki context berbeda dan context tidak tersisa setelah request selesai.

## Performance Impact

Measured result: typecheck, lint, unit, integration, dan build lulus; runtime latency before/after belum diukur.

Estimated result: repeated generic active-workspace resolution turun menjadi satu per target request; review permission check invocation sengaja tidak turun, tetapi membership/workspace read-nya direuse.

Hypothesis: pengurangan query context akan mengecilkan application-code gap pada history detail, review, save-as-template, dan templates. Hipotesis ini harus dikonfirmasi dengan authenticated staging trace.

## Risks / Trade-offs

- Context reuse mengasumsikan role/workspace tidak perlu berubah di tengah satu request; ini sesuai batas request-scoped context dan tidak mengubah hasil authorization saat request dimulai.
- Mutation endpoint yang tidak memakai target boundary tidak mendapat deduplication, sehingga tidak ada perubahan global yang tidak terkontrol.
- Notification custom resolver sengaja tidak digabung karena fallback dan pemilihan workspace-nya berbeda.
- Tidak ada perubahan queue, provider, auth cookie handling, DB connection architecture, schema, migration, atau RLS.

# Performance Phase 3.1 — Context Propagation Audit

Tanggal audit: 2026-09-16

Phase ini audit-only. Tidak ada optimasi, perubahan authorization, perubahan query, perubahan schema/RLS, perubahan queue, atau perubahan provider yang dilakukan.

## 1. Request context architecture

`src/lib/request-context.ts` menyimpan promise resolver dalam `AsyncLocalStorage<RequestContext>`:

- `currentUserPromise` untuk auth;
- `personalWorkspacePromises` per user;
- `activeWorkspacePromises` per user;
- `workspacePromises` per kombinasi user/workspace;
- `authorizationPromises` per kombinasi user/requested-workspace.

`withRequestContext` memakai context yang sudah ada bila dipanggil nested; jika belum ada, ia membuat map dan counter baru. Promise disimpan sebelum `await`, sehingga pemanggilan concurrent dalam context yang sama menunggu promise yang sama. Tidak ada state cache module-level atau cache lintas user/request.

`withPerfRequest` membuat request context untuk boundary yang dipasangi wrapper. Pada development/staging, wrapper juga membuat `endpoint` dan `requestId`, lalu menulis ringkasan counter `[PERF][context]` ketika boundary selesai. Pada production, profiling tidak menulis log.

## 2. AsyncLocalStorage propagation

Propagation di dalam callback wrapper berjalan melalui `await`, nested async function, service function, dan `Promise.all`. Contoh yang terbukti dari source:

```text
withPerfRequest
  -> renderHistoryPage
     -> Promise.all(listHistoryPostsForUser, listAccountSummaries)
        -> requireWorkspacePermission
           -> getWorkspaceAuthorizationContext
              -> getActiveWorkspaceForUser
```

Kedua cabang `Promise.all` di atas tetap berada pada context yang sama. Hal yang sama berlaku pada `Promise.all` di templates, query data notifications, serta query post/events review. Nested `withRequestContext` tidak membuat context baru karena fungsi tersebut mengembalikan context yang sedang aktif.

Namun, React Server Component parent layout bukan child dari callback `withPerfRequest` page. `src/app/(app)/layout.tsx` menjalankan `requireUser`, `listUserWorkspaces`, dan `getActiveWorkspaceForUser` sebelum child page `/history` atau `/templates` membuka wrapper-nya. Akibatnya:

```text
HTTP request
  -> AppLayout [tanpa RequestContext dan tanpa requestId]
       -> auth/workspace resolution A
  -> HistoryPage atau TemplatesPage
       -> withPerfRequest [RequestContext + requestId baru]
            -> page resolution B
```

Ini adalah dua execution context dalam satu logical page request, bukan dua map yang bocor antar-request. React Server Components juga tidak meneruskan context child wrapper ke parent yang sudah selesai dirender.

## 3. `/history` call graph

```text
AppLayout (bypass)
  -> requireUser -> getCurrentUser -> ensurePersonalWorkspace
  -> Promise.all(
       listUserWorkspaces -> ensurePersonalWorkspace + workspace list query,
       getActiveWorkspaceForUser -> ensurePersonalWorkspace + preference + membership
     )

HistoryPage -> withPerfRequest("GET /history")
  -> requireUserId -> getCurrentUser -> ensurePersonalWorkspace [context miss]
  -> Promise.all(
       listHistoryPostsForUser -> listHistoryPostsPage -> permission -> active workspace -> 2 history queries,
       listAccountSummaries -> active workspace -> accounts query
     )
```

Di dalam page wrapper, active workspace dan membership promise dapat direuse oleh dua cabang. Pemanggilan dari layout berada di luar wrapper, sehingga tidak dapat direuse oleh page. `listUserWorkspaces` sendiri juga melakukan `ensurePersonalWorkspace` tanpa context pada layout.

## 4. History detail call graph

Untuk `/history?post=<id>`, setelah list selesai, page memanggil:

```text
getPostDetail
  -> loadPostSummary -> permission -> authorization context [same page context]
  -> loadTargets
  -> Promise.all(
       media query + optional signed Storage URL,
       executions query,
       getPostAnalyticsDetail -> authorization/membership reuse,
       optional campaign intelligence
     )
```

Permission invocation tetap dievaluasi; yang dapat menjadi cache hit adalah context workspace/authorization. `ReviewPanel` kemudian melakukan `fetch('/api/posts/:id/review')`, yaitu HTTP request terpisah dengan context dan request ID terpisah.

## 5. Review call graph

`/reviews` page saat ini belum memakai `withPerfRequest`, sehingga page dan layout-nya adalah bypass instrumentation. Untuk request detail:

```text
GET /api/posts/:id/review -> withPerfRequest
  -> getUserId -> getCurrentUser -> ensurePersonalWorkspace
  -> getReviewDetail
       -> getPostReviewForUser -> permission -> active workspace
            -> Promise.all(post query, review events query)
       -> permission kedua -> authorization context cache hit
       -> comments query
       -> comment mentions query [single batched query, sequential after comments]
```

Permission kedua tidak dihapus. Pada context route yang sama, workspace/authorization lookup yang sama dapat menjadi cache hit.

## 6. Templates call graph

```text
AppLayout (bypass)
  -> auth/workspace resolution

TemplatesPage -> withPerfRequest("GET /templates")
  -> requireUser -> auth + personal workspace [page context]
  -> Promise.all(
       listTemplatesForUser -> active workspace -> templates rows -> signed URL per media,
       getActiveWorkspaceForUser -> active workspace cache hit
     )
  -> local hasPermission
```

`/api/templates`, `/templates/[id]`, dan `/templates/new` belum dipasang wrapper; pemanggilan domain dari jalur tersebut tidak memiliki request context profiling.

## 7. Save-as-template call graph

```text
POST /api/posts/:id/save-as-template -> withPerfRequest
  -> getUserId -> auth + personal workspace
  -> requireWorkspacePermission("templates:create")
  -> getActiveWorkspaceId [active workspace context hit/miss]
  -> loadPostReusableContent
       -> active workspace [same context]
       -> source post query
       -> Promise.all(media query, targets query)
  -> resolveReusableTargets -> listActiveAccounts -> active workspace [same context]
  -> template insert
  -> optional signed Storage URL
```

Resolver workspace yang berulang di jalur ini berada pada context route yang sama setelah wrapper dimulai. Auth/layout browser tidak terlibat karena ini route handler terpisah.

## 8. True duplicates

Tidak ada TRUE DUPLICATE (kategori A) yang terbukti dari source atau test Phase 3: untuk user/workspace key yang sama di context yang sama, promise resolver disimpan sebelum operasi selesai dan counter membedakan resolve pertama dari cache hit. `requireWorkspacePermission` memang dapat dipanggil dua kali, tetapi itu adalah evaluasi authorization yang disengaja, bukan bukti duplicate DB lookup.

## 9. Expected repeated calls

Kategori B terjadi pada pemanggilan helper yang memang dibutuhkan oleh beberapa loader dalam satu request. Contohnya `getActiveWorkspaceForUser` dipanggil oleh list history dan account summaries, serta permission context dipanggil dua kali pada review detail. Setelah context terbentuk, pemanggilan berikutnya menjadi cache hit; `hasPermission` tetap dijalankan pada setiap invocation.

`ensurePersonalWorkspace` juga tetap harus menjadi bagian dari resolver active workspace karena helper mempertahankan guarantee provisioning personal workspace. Pada context yang sama, hanya resolusi pertama yang menjalankan promise internal.

## 10. Different requests

Kategori C berlaku untuk request yang tampak berurutan di browser tetapi bukan satu execution:

- render `/history?post=...` dan fetch client `/api/posts/:id/review`;
- navigasi, refresh, prefetch, dan polling client;
- request `/api/notifications?limit=8` yang dipicu notification center, terpisah dari page render;
- route handler `/api/templates` yang terpisah dari Server Component `/templates`.

Request ID hanya dapat membedakan bagian yang melewati `withPerfRequest`. Access log Next yang diberikan tidak memuat request ID, sehingga urutan HTTP tersebut belum dapat dicocokkan satu per satu ke `[PERF]` log.

## 11. Bypasses

Kategori E yang teridentifikasi:

- `src/app/(app)/layout.tsx` memanggil auth/workspace sebelum wrapper page;
- `/reviews` page dan page detail templates belum memakai `withPerfRequest`;
- `/api/templates`, `/api/workspaces`, `/api/notifications/unread-count`, dan banyak route handler lama memanggil domain langsung;
- worker, test, dan direct domain callers tidak melewati HTTP profiling boundary.

Pada bypass, `currentRequestContext()` bernilai `undefined`, sehingga behavior lama dipertahankan: tidak ada request-scoped deduplication dan `measurePerf` tidak dapat menulis `endpoint`/`requestId`. Ini bukan cache lintas user dan bukan authorization bypass.

## 12. Context propagation failures

Tidak ditemukan kehilangan context di dalam wrapper melalui `await`, `Promise.all`, atau nested async berdasarkan source dan test isolation. Failure yang nyata adalah boundary placement: parent layout berada di luar page wrapper. Karena itu resolver layout tidak memiliki request ID dan tidak berbagi map dengan resolver page pada logical HTTP render yang sama.

Nested context replacement juga tidak ditemukan; `withRequestContext` sengaja reuse context existing. Kategori D (different context) berlaku antara layout dan page. Kategori F tetap berlaku untuk pola durasi yang hanya disertai angka milliseconds tanpa `endpoint`, `requestId`, atau `[PERF][context]` summary.

## 13. Root cause

Akar masalah paling kuat adalah **instrumentation/request-context boundary terlalu rendah, yaitu dipasang pada beberapa page/route handler tetapi tidak mencakup `AppLayout`**. Akibatnya satu logical page request dapat melakukan auth/workspace resolution di layout tanpa deduplication, lalu melakukan resolution lagi di page dengan context baru. Log layout juga kehilangan correlation fields.

Pola `ensurePersonalWorkspace` sekitar `2131ms` lalu `675ms`, kemudian `662/672/663/672ms`, tidak dapat dinyatakan sebagai satu duplicate query hanya dari angka duration. Dengan source saat ini, penjelasan yang konsisten adalah kombinasi:

1. layout bypass menjalankan resolver sendiri;
2. page wrapper memulai context baru dan menjalankan resolver lagi;
3. client review/notification/prefetch dapat menimbulkan HTTP request berbeda.

Jika log memiliki `requestId` sama dan summary menunjukkan `personalWorkspaceResolveCount: 1` dengan cache hit berikutnya, itu expected repeated call. Jika request ID berbeda, itu different request. Jika tidak ada request ID, itu layout/bypass atau evidence tidak lengkap. Log yang diberikan belum memiliki correlation field, sehingga klasifikasi baris per baris untuk angka khusus tersebut tetap **UNKNOWN (F)**; root cause boundary placement didukung oleh source.

## 14. Recommended minimal fix

Perbaikan minimal yang direkomendasikan untuk fase berikutnya adalah memilih satu boundary request yang mencakup parent layout dan child page, lalu membuat correlation ID pada boundary tersebut. Setelah itu ukur ulang counter dan stage duration sebelum memutuskan optimasi resolver. Alternatifnya, pasang instrumentation eksplisit pada semua route/page yang memang ingin dibandingkan, tetapi jangan membuat global cache.

Rekomendasi ini **tidak diimplementasikan pada Phase 3.1**. Tidak ada klaim latency improvement sebelum authenticated staging trace dengan request ID dan context summary tersedia.

## 15. Risks

- Memindahkan boundary ke layout dapat mengubah scope deduplication dan harus diuji terhadap nested layouts, Server Components, redirect, error, dan concurrent render.
- Request-scoped reuse tidak boleh menjadi global cache; key user/workspace tetap wajib dipertahankan.
- Permission evaluation tidak boleh dihapus hanya karena authorization context direuse.
- `ensurePersonalWorkspace` memiliki fallback provisioning dan write membership; menggabungkan atau mengubah urutan query dapat memengaruhi race behavior.
- Logs harus tetap development/staging-only dan tidak boleh memuat token, credential, caption, atau parameter query sensitif.

## Phase 3.1 Root Cause Report

### A. ROOT CAUSE

Parent `AppLayout` berjalan di luar `withPerfRequest`, sehingga auth/workspace resolution layout dan child page memakai context berbeda; sebagian resolver juga memang bypass wrapper.

### B. BUKTI LOG

Evidence runtime yang tersedia hanya durasi `ensurePersonalWorkspace` sekitar `2131ms`, `675ms`, `662ms`, `672ms`, `663ms`, dan `672ms`, tanpa endpoint/request ID. Karena itu urutan tersebut tidak cukup untuk membuktikan duplicate query. Evidence source menunjukkan wrapper hanya mulai di page/route tertentu, sedangkan layout tidak terinstrumentasi.

### C. CONTEXT PROPAGATION FLOW

Di dalam wrapper: `withPerfRequest -> withRequestContext -> await/Promise.all/nested service` mempertahankan context yang sama. Pada page render: `AppLayout -> [bypass]` lalu `Page -> [new context]`, sehingga layout dan page tidak berbagi context.

### D. DUPLICATE YANG BENAR-BENAR TERJADI

Tidak ada kategori A yang terbukti dalam context yang sama. Promise deduplication bekerja pada key yang sama; test concurrent context juga memastikan isolation.

### E. CALL YANG SEBENARNYA EXPECTED

Repeated permission invocation dan helper invocation dalam satu context adalah expected. Authorization tetap dievaluasi; workspace promise dapat cache hit.

### F. CALL YANG TERJADI DI REQUEST BERBEDA

History detail dan review fetch, notification fetch, prefetch, polling, refresh, dan route templates API adalah execution terpisah. Hal tersebut harus dibandingkan dengan request ID, bukan urutan timestamp saja.

### G. CONTEXT BYPASS

App layout, `/reviews`, `/api/templates`, route handler lama, worker, test, dan direct domain caller tidak melewati boundary `withPerfRequest`. Resolver di sana tidak memiliki request ID dan tidak mendapat request-scoped dedupe.

### H. RECOMMENDED FIX

Evaluasi pemindahan/penyatuan boundary instrumentation ke level request yang mencakup layout dan page, kemudian ulangi trace. Jangan menerapkan fix pada audit ini.

### I. FILE YANG AKAN TERDAMPAK JIKA DIIMPLEMENTASIKAN

Minimal kandidat: `src/app/(app)/layout.tsx`, `src/lib/perf.ts`, `src/lib/request-context.ts`, dan target page/route boundary yang saat ini membungkus sendiri. Perubahan aktual ditunda.

### J. SECURITY IMPACT

Tidak ada perubahan security behavior pada Phase 3.1. Tidak ada perubahan RLS, role, permission, auth cookie, user/workspace key, atau authorization check. Risiko hanya muncul jika rekomendasi nanti diterapkan tanpa menjaga request scope dan key isolation.

### K. VALIDATION

Validasi wajib Phase 3.1 dijalankan setelah dokumentasi audit: lint, typecheck, unit test, integration test, combined test, build, dan `git diff --check`.

### L. PERFORMANCE IMPACT

NOT YET MEASURED. Phase 3.1 hanya memetakan root cause dan propagation; tidak mengklaim perbaikan latency.

# Performance Phase 3.2 — Request Boundary Unification

Tanggal implementasi: 2026-09-16

Phase ini mengimplementasikan root-cause fix dari Phase 3.1 dengan scope terbatas pada request boundary, `AsyncLocalStorage`, correlation ID, dan regression test. Tidak ada perubahan database, authorization rule, API contract, provider, queue, worker, polling, atau business behavior.

## 1. Problem

Sebelumnya `AppLayout` menjalankan auth/workspace resolver tanpa `withPerfRequest`, sedangkan beberapa child page membuka context sendiri. Satu lifecycle render app dapat menghasilkan context berbeda: resolver layout tidak memiliki `requestId`, lalu resolver page membuat cache map baru.

## 2. Phase 3.1 root cause

Root cause yang sudah dibuktikan dari source adalah boundary page terlalu rendah untuk mencakup parent layout. Repeated duration `ensurePersonalWorkspace` belum dapat dikorelasikan baris demi baris karena log lama tidak mempunyai `requestId`/`contextId`.

## 3. Actual implementation

Perubahan minimum yang diterapkan:

- `AppLayout` sekarang menjadi boundary terluar melalui `withPerfRequest("GET /(app)", ...)`.
- `withPerfRequest` mendeteksi perf context yang sudah aktif dan tidak membuat request ID baru untuk nested boundary.
- Nested boundary tetap boleh mengganti label endpoint lokal selama callback berjalan, lalu mengembalikan context perf parent setelah callback selesai.
- `RequestContext` mendapatkan `contextId` unik saat context dibuat.
- Semua resolver `[PERF]` yang memiliki request context mencatat `contextId`; endpoint route/page yang memiliki perf context mencatat `requestId` dan `contextId`.
- Ringkasan `[PERF][context]` hanya ditulis oleh root perf boundary agar tidak terjadi double summary.

## 4. Boundary yang dipilih

Boundary yang dipilih adalah `src/app/(app)/layout.tsx` untuk Server Component app shell, dengan route handler tetap memakai boundary masing-masing. Page `/history` dan `/templates` tetap memiliki label endpoint spesifik, tetapi nested `withPerfRequest` sekarang reuse request/context ID dari layout.

Route handler seperti `/api/notifications`, `/api/posts/:id/review`, dan `/api/posts/:id/save-as-template` tetap menjadi root boundary independen karena masing-masing adalah HTTP request lifecycle terpisah dari Server Component layout.

## 5. Mengapa boundary tersebut dipilih

Next.js App Router menempatkan layout sebagai wrapper segment yang menaungi child page. Repository juga melakukan auth dan active-workspace loading di `AppLayout`, sehingga boundary itu adalah titik terdekat yang tersedia untuk mengikutsertakan app shell dan child render dalam satu logical app request. Route handler tidak dipindahkan ke layout karena tidak berbagi lifecycle dengan Server Component.

## 6. Perubahan file

- `src/app/(app)/layout.tsx`: membuka root perf/request boundary untuk app pages.
- `src/lib/request-context.ts`: menambahkan `contextId` per context.
- `src/lib/perf.ts`: reuse nested perf context dan root-only context summary.
- `src/lib/api/response.ts`: menambahkan `contextId` pada serialization log.
- `src/lib/request-context.test.ts`: menguji request isolation dan nested boundary correlation.
- `docs/PERFORMANCE-AUDIT.md`: dokumentasi Phase 3.2.

Tidak ada perubahan pada Master Plan.

## 7. AsyncLocalStorage behavior

Satu root `withPerfRequest` membuat satu `RequestContext` dan satu perf correlation pair. Nested `withPerfRequest` menggunakan map request yang sama dan request/context ID yang sama, tetapi menjalankan callback dengan endpoint label nested. Setelah callback selesai, storage parent dipulihkan.

Pada production, performance log tetap nonaktif sesuai environment gating. `withRequestContext` tetap membuat context request-scoped agar deduplication behavior tidak bergantung pada logging.

## 8. Request isolation

`RequestContext` tetap dibuat dengan `AsyncLocalStorage`, bukan module-level map. `contextId` dibuat saat context baru dibuat; dua request concurrent memiliki object, map, dan ID berbeda. Cache key tetap menyertakan user/workspace identity. Tidak ada context yang disimpan lintas request atau lintas user.

## 9. Nested context behavior

Nested `withPerfRequest` tidak menghapus boundary page/route secara massal. Pada context yang sama, nested callback memakai `requestId` dan `contextId` parent, memakai endpoint label nested sementara, dan tidak menulis `[PERF][context]` kedua. Pada route handler yang berdiri sendiri, wrapper tetap membuat correlation pair sendiri.

## 10. Instrumentation changes

Instrumentation tetap dibatasi ke development/staging. Log resolver kini dapat dibaca dengan:

```text
endpoint + requestId + contextId + operation + durationMs
```

Untuk caller legitimate yang berada di `withRequestContext` tanpa perf boundary, log dapat memiliki `contextId` tanpa `requestId`. Caller di luar request context tetap tidak dipaksa membuat fake context. Counter resolve/hit yang sudah ada tetap dipakai untuk membedakan actual resolver work dari cache hit.

## 11. Test coverage

`src/lib/request-context.test.ts` mencakup:

- isolation dua request concurrent;
- context tetap tersedia setelah async boundary;
- nested perf boundary reuse request context;
- nested boundary reuse `requestId` dan `contextId`;
- endpoint label nested dipulihkan ke parent setelah callback selesai;
- storage bersih setelah root callback selesai.

## 12. Security impact

Tidak ada perubahan terhadap authentication, authorization, `hasPermission`, role, workspace membership filter, RLS, credential handling, atau API response contract. Reuse hanya berlaku pada request context yang sama; tidak ada global/cross-user cache. Permission check tetap dievaluasi pada setiap invocation.

## 13. Performance benchmark status

Boundary dan correlation sudah diperbaiki, tetapi authenticated staging benchmark belum dilakukan. Karena itu query/database belum dioptimalkan dan tidak ada angka before/after yang boleh diklaim.

**Performance impact: NOT YET MEASURED**

# Performance Phase 3.3 — Authenticated Staging Benchmark

## A. Benchmark Environment

Benchmark authenticated staging **belum dapat dijalankan** pada sesi ini. Repository hanya menyediakan `.env.local` dengan `APP_URL=http://localhost:3000`; tidak ada staging URL atau browser session authenticated yang tersedia. Aplikasi lokal dijalankan sementara dengan `APP_ENV=staging` hanya untuk sanity check instrumentation.

Tanggal observasi: **2026-09-16**, sekitar **03:32 UTC / 10:32 WIB**.

Tidak ada password, access token, refresh token, cookie, authorization header, client secret, atau OAuth code yang digunakan maupun dicetak.

## B. Methodology

Sanity check dilakukan dengan `HttpClient` tanpa cookie/session:

- warm-up dan measured request tidak dianggap sebagai authenticated benchmark;
- dua request dilakukan untuk masing-masing `/history`, `/templates`, dan `/api/notifications?limit=8`;
- redirect diikuti oleh client, sehingga `/history` dan `/templates` berakhir pada halaman login;
- tidak ada existing valid post ID yang tersedia, sehingga endpoint post tidak dipanggil dengan ID palsu;
- hasil di bawah hanya memverifikasi boundary/logging dan status unauthenticated.

## C. Endpoint Results

| Endpoint | Requests | Observed latency | App code | Context behavior | Notes |
|---|---:|---:|---:|---|---|
| `GET /history` | 2 | 963 ms, 104 ms | 340 ms, 68 ms pada `GET /login?next=%2Fhistory` | Tidak ada perf boundary pada login target | Redirect dari protected page; bukan authenticated result |
| `GET /templates` | 2 | 111 ms, 107 ms | 81 ms, 79 ms pada `GET /login?next=%2Ftemplates` | Tidak ada perf boundary pada login target | Redirect dari protected page; bukan authenticated result |
| `GET /api/notifications?limit=8` | 2 | 584 ms, 28 ms | 408 ms, 16 ms | Context baru per request | `401`; auth berhenti sebelum workspace resolver |
| `GET /history?page=1&post=<existing-post-id>` | — | — | — | — | Existing post ID tidak tersedia |
| `GET /api/posts/<existing-post-id>/review` | — | — | — | — | Existing post ID tidak tersedia |
| `POST /api/posts/<existing-post-id>/save-as-template` | — | — | — | — | Existing post ID tidak tersedia |

## D. Request/Context Correlation

Hanya request notifications mencapai perf boundary authenticated-capable route sebelum ditolak:

| Request | requestId | contextId | Outcome |
|---|---|---|---|
| notifications #1 | `25943666-6f2c-4de7-b847-6c749949b6232` | `aecb8a42-2d51-4329-b29b-afa159e6a2f3` | `401`, auth client 4 ms, `getUser` 1 ms |
| notifications #2 | `caba953e-bcfa-4ca2-a39b-dc62dd12a4322` | `64545704-90f2-4e4f-a41f-118eea58c984` | `401`, auth client 6 ms, `getUser` 0 ms |

Kedua request memiliki `requestId` dan `contextId` berbeda, sesuai isolasi antar HTTP request. Tidak ada evidence same-request/different-context.

## E. Resolver Results

| Resolver | Calls | Cache hit | Cache miss | Actual work | Notes |
|---|---:|---:|---:|---:|---|
| `getCurrentUser` | 0 authenticated | 0 | 0 | 0 | Request unauthenticated |
| `ensurePersonalWorkspace` | 0 | 0 | 0 | 0 | Tidak tercapai |
| `getWorkspaceForUser` | 0 | 0 | 0 | 0 | Tidak tercapai |
| `getActiveWorkspaceForUser` | 0 | 0 | 0 | 0 | Tidak tercapai |
| `getWorkspaceAuthorizationContext` | 0 | 0 | 0 | 0 | Tidak tercapai |
| `requireWorkspacePermission` | 0 | 0 | 0 | 0 | Auth gagal lebih awal |

## F. ensurePersonalWorkspace Analysis

Tidak ada panggilan `ensurePersonalWorkspace` pada sanity check. Sequence historis sekitar 2131 ms dan 662–675 ms tidak dapat dikonfirmasi atau diklasifikasikan pada sesi ini karena tidak ada authenticated request dan tidak ada `requestId/contextId` resolver yang dapat dikorelasikan.

## G. Cache Hit/Miss Analysis

Tidak ada cache hit/miss workspace atau authorization yang terukur. Request notifications berhenti pada `supabase.auth.getUser`, sehingga hasil ini tidak boleh digunakan untuk menilai reuse `ensurePersonalWorkspace` maupun resolver workspace lainnya.

## H. Phase 3.1 Comparison

Observasi Phase 3.1 (`/history` sekitar 4–10 s, history detail sekitar 4.9–10.0 s, notifications sekitar 5.9 s, review sekitar 5.0 s) adalah historical sampled observations, bukan controlled statistical baseline. Hasil unauthenticated lokal ini tidak comparable dan tidak menunjukkan improvement maupun regression.

## I. Current Bottleneck Evidence

Evidence yang tersedia hanya menunjukkan authentication/routing pada request tanpa session: `/api/notifications` mengembalikan `401`, sedangkan protected pages mengarah ke login. Tidak ada evidence yang cukup untuk mengidentifikasi bottleneck authenticated pada workspace, authorization, database, serialization, rendering, atau external service. Tidak dibuat ranking bottleneck.

## J. Limitations

- staging URL tidak dikonfigurasi di repository;
- browser session authenticated tidak tersedia;
- credentials sengaja tidak diminta atau dicetak;
- existing valid post ID tidak tersedia;
- hanya unauthenticated sanity check yang dapat dijalankan;
- jumlah dan jenis request tidak memenuhi syarat benchmark authenticated staging.

## K. Code Changes

No production logic changes; benchmark-only. Hanya laporan ini yang diperbarui.

## L. Validation

Sanity check berhasil dijalankan terhadap server lokal Next.js 16.3.4 dengan `APP_ENV=staging`. Tidak ada source code yang berubah pada Phase 3.3, sehingga full validation Phase 3.2 tetap menjadi hasil validasi terakhir: lint, typecheck, unit, integration, test:all, build, dan diff check berhasil.

## M. Security Impact

Tidak ada perubahan security behavior. Tidak ada credential atau token yang diproses untuk benchmark ini. Tidak ada perubahan auth, authorization, RLS, schema, migration, OAuth, provider, queue, Redis, worker, business logic, atau polling.

## N. Performance Conclusion

`Insufficient evidence for optimization decision.` Authenticated staging benchmark belum selesai; tidak ada klaim peningkatan performa.

## O. Recommended Next Investigation

Jalankan ulang enam endpoint target pada staging yang benar-benar authenticated, memakai existing valid post ID, lima measured requests setelah warm-up, dan kumpulkan log berdasarkan `requestId` lalu `contextId`. Setelah data itu tersedia, baru klasifikasikan resolver/database/rendering bottleneck. Jangan melakukan optimization pada Phase 3.3.
# Performance Phase 3.4 — Next.js Render/Request Boundary Investigation

### 3.4.1 Objective

Menentukan apakah log `GET /(app)` dan `GET /history` dengan `requestId/contextId` berbeda adalah dua HTTP request atau lifecycle/render boundary Next.js yang terinstrumentasi sebagai context berbeda. Audit ini evidence-only; tidak ada optimasi atau perubahan runtime.

### 3.4.2 Scope

Diaudit: `src/app/(app)/layout.tsx`, `src/app/(app)/history/page.tsx`, `history/loading.tsx`, `src/lib/perf.ts`, `src/lib/request-context.ts`, `src/lib/api/response.ts`, `src/proxy.ts`, auth/workspace/authorization helpers, history services/domain, `AppShell`, navigation/sidebar/header, `HistoryList`, `use-polling`, seluruh caller `withPerfRequest`, tests, dan Next.js 16.3.4 local docs untuk layout, navigation, prefetch, serta streaming.

### 3.4.3 Current Request/Render Architecture

`src/proxy.ts` berjalan pada matcher semua route non-static, membaca cookies, memanggil Supabase `getUser()`, dan melakukan redirect page protected. Proxy hanya membedakan page versus `/api`; tidak membuat `requestId`, `contextId`, render ID, atau RSC/prefetch/navigation marker.

`src/app/(app)/layout.tsx` adalah Server Component yang memberi label internal `GET /(app)`, menjalankan `requireUser()`, `listUserWorkspaces()`, dan `getActiveWorkspaceForUser()`, lalu mengembalikan Client Component `AppShell` dengan `children` React node. `src/app/(app)/history/page.tsx` adalah Server Component dengan wrapper terpisah `GET /history`, auth, settings, history list, accounts, dan optional post detail.

Source membedakan tiga scope: HTTP request, Next.js Server Component/RSC render lifecycle, dan AsyncLocalStorage callback context. Implementasi saat ini membuktikan scope ketiga, tetapi belum menghubungkannya secara eksplisit ke dua scope pertama.

### 3.4.4 Request Graph

```text
Browser
  ├─ document / RSC navigation / prefetch
  │    └─ proxy.ts (HTTP boundary; no perf context)
  │         └─ Next.js App Router
  │              └─ (app)/layout.tsx (Server Component)
  │                   └─ withPerfRequest("GET /(app)")
  │                        ├─ requireUser → getCurrentUser
  │                        │                 → ensurePersonalWorkspace
  │                        ├─ listUserWorkspaces
  │                        ├─ getActiveWorkspaceForUser
  │                        └─ AppShell (Client Component) → children node
  └─ possible separate RSC/navigation/prefetch/refresh
       └─ history/page.tsx (Server Component)
            └─ withPerfRequest("GET /history")
                 ├─ requireUserId → getCurrentUser
                 ├─ getSettingsForUser
                 ├─ listHistoryPostsForUser
                 │    └─ historyConditions → requireWorkspacePermission
                 │         → authorization/workspace → history.count+rows
                 ├─ listAccountSummaries → active workspace
                 └─ optional getPostDetail → auth + Promise.all detail work
```

Graph ini adalah source graph. Hubungan transport antara kedua cabang belum terbukti.

### 3.4.5 AppLayout Boundary Analysis

`AppLayout` memanggil `withPerfRequest("GET /(app)", () => renderAppLayout({ children }))`. Callback menunggu data layout dan mengembalikan `<AppShell>{children}</AppShell>`.

Confirmed dari source: `children` sudah berupa `React.ReactNode`; layout tidak memanggil fungsi child secara langsung; callback tidak membuat atau menunggu React render stream. Jadi callback mengukur execution layout dan pembuatan tree, bukan bukti bahwa seluruh child Server Component/RSC stream selesai di dalam ALS scope yang sama. Local Next docs menyatakan layout menerima `children` dan dipertahankan saat navigasi, tetapi tidak memberi bukti repository-level tentang timing ALS child execution.

### 3.4.6 withPerfRequest Analysis

`withPerfRequest` membuat `requestId` hanya pada perf root, mengambil `contextId` dari request context, menjalankan callback melalui `withRequestContext`, menunggu callback Promise, lalu menulis root summary pada `finally`. Nested call mewarisi ID yang sama dan hanya mengganti label endpoint.

Async work yang dibuat dan di-await di dalam callback tercakup. Jika callback mengembalikan React element, Promise selesai ketika element tree dikembalikan; itu bukan explicit await terhadap evaluasi descendant atau streaming RSC. Cleanup mengikuti lifetime `AsyncLocalStorage.run()` callback, bukan hook HTTP server.

### 3.4.7 AsyncLocalStorage Context Analysis

`request-context.ts` menyimpan `RequestContext` dengan promise maps untuk auth, personal/active workspace, membership, authorization, serta counters. `withRequestContext()` reuse store yang aktif atau membuat store baru dengan UUID `contextId`.

Scope aktual adalah callback-scoped dan async-propagated. Ia aman untuk nested async function dan `Promise.all()` yang dibuat saat callback aktif, tetapi tidak otomatis terikat ke HTTP request atau render stream. Test membuktikan isolasi concurrent callback dan nested reuse, bukan layout + child Server Component lifecycle. Tidak ada global request cache; caller di luar context tidak mengambil context request lain.

### 3.4.8 `/history` Execution Trace

`/history` → `HistoryPage` → `withPerfRequest("GET /history")` → `requireUserId` → `getCurrentUser` → `ensurePersonalWorkspace` bila authenticated → settings/cookies → `listHistoryPostsForUser` → `listHistoryPostsPage` → `historyConditions` → `requireWorkspacePermission("posts:view")` → authorization/workspace resolvers → `history.count+rows`. Paralel lainnya adalah `listAccountSummaries` dan active workspace. Dengan `post`, `getPostDetail` menambah summary authorization serta media, executions, analytics, dan campaign intelligence melalui `Promise.all()`.

`HistoryList` adalah Client Component. `usePolling` dapat memanggil `router.refresh()` ketika status processing/pending; ini bukti kemungkinan refresh RSC berikutnya, bukan bukti penyebab sample.

### 3.4.9 `/(app)` Execution Trace

`(app)` adalah route group sehingga bukan bagian URL publik. String `GET /(app)` ditulis manual di `layout.tsx`; ini label instrumentation internal, bukan verified HTTP endpoint. Pada `/history`, layout melakukan shared auth/workspace work dan mengembalikan `AppShell`; page melakukan history-specific work. Current logger tidak membedakan initial document, RSC navigation, prefetch, refresh, atau render attempt.

### 3.4.10 Proxy / Middleware Analysis

Proxy membaca cookies, memanggil Supabase auth, membaca pathname/search, membedakan `/api`, dan mengembalikan `NextResponse.next()` atau redirect. Proxy tidak memakai `withPerfRequest`, tidak mencatat correlation ID, dan tidak membaca marker RSC/prefetch/navigation. Maka log saat ini tidak dapat menggabungkan `GET /(app)` dan `GET /history` ke HTTP/RSC transport yang sama. Proposed instrumentation—**NOT IMPLEMENTED**—adalah transport ID plus safe method/path/RSC/prefetch/navigation/status fields.

### 3.4.11 Client Navigation / Prefetch Analysis

`AppSidebar` merender `next/link` untuk `NAV_ITEMS`, termasuk `/history`, tanpa explicit `prefetch`. `HistoryList` memakai `Link` untuk pagination/detail, dan campaign/calendar components juga menghasilkan `/history?post=...`. Next local docs menyatakan `Link` mendukung client navigation dan automatic prefetch pada kondisi produksi/viewport. Ini membuat prefetch POSSIBLE, bukan CONFIRMED karena tidak ada browser network trace atau header RSC/prefetch.

`usePolling` dapat membuat refresh terpisah. `NotificationBell` melakukan `fetch("/api/notifications?limit=8")` setelah mount; request itu independen dari layout/page render.

### 3.4.12 Resolver Correlation Matrix

| Resolver | Caller | Context | Request ID | Cache hit/miss | Same request? | Evidence |
|---|---|---|---|---|---|---|
| `getCurrentUser` | layout `requireUser`; history `requireUserId` | ALS map | Berbeda pada sample layout/history; transport ID unavailable | Hit hanya jika store sama | UNKNOWN | `auth/server.ts`, layout/page |
| `ensurePersonalWorkspace` | `getCurrentUser`, `listUserWorkspaces`, active workspace | personal map | Berbeda pada historical layout/history logs | Same-store hit didukung source | UNKNOWN | `domain/workspaces.ts` |
| `getActiveWorkspaceForUser` | layout, history/accounts | active map | Tidak tersedia per resolver | Same-store hit didukung source | UNKNOWN | workspace source |
| `getWorkspaceForUser` | active/authorization | membership map | Tidak tersedia | Same-store hit didukung source | UNKNOWN | workspace/authorization source |
| `getWorkspaceAuthorizationContext` | `requireWorkspacePermission` | authorization map | Tidak tersedia end-to-end | History detail menunjukkan reuse context | PARTIALLY CONFIRMED | authorization source + benchmark note |
| `requireWorkspacePermission` | history list/detail | authorization wrapper | `/history` sample | first ~695 ms, second ~0 ms | PARTIALLY CONFIRMED | supplied benchmark evidence |

ID berbeda diperlakukan sebagai context terpisah. Tidak disebut duplicate same-request tanpa correlation evidence.

### 3.4.13 Evidence From Benchmark

**CONFIRMED:** layout/history log memiliki `requestId/contextId` berbeda; timestamp berdekatan; history detail sekitar 4.6 s; Next.js sekitar 26 ms, proxy sekitar 135 ms, app code sekitar 4.4 s; resolver workspace/auth berada pada ratusan ms; second `requireWorkspacePermission` dalam context history sekitar 0 ms setelah first sekitar 695 ms.

Evidence tambahan dari diagnostic log authenticated terbaru memperkuat temuan ini:

- `GET /dashboard 200` berjalan bersamaan dengan root perf berlabel `GET /(app)`; ini menunjukkan `GET /(app)` adalah label internal layout, bukan path HTTP yang dikirim browser.
- Pada sekitar `03:53:03.978`, root layout dan root history mulai hampir pada milidetik yang sama, tetapi memiliki `requestId/contextId` berbeda. Pola pasangan yang sama muncul sedikitnya empat kali dalam rentang sekitar satu detik.
- Resolver history di tiap context tetap koheren secara internal (authorization, accounts, history rows, dan targets memakai context masing-masing), sehingga evidence ini membuktikan beberapa eksekusi root perf concurrent, bukan membuktikan duplicate query di satu context.
- Beberapa log resolver workspace pada periode yang sama tidak memiliki endpoint, `requestId`, atau `contextId`. Karena `measurePerf` hanya menambahkan field tersebut ketika ada active perf context, operasi-operasi itu terbukti berjalan di luar context perf aktif; asal lifecycle-nya masih tidak dapat dipastikan dari log saja.
- `GET /history 200` adalah request route yang terukur. `POST /history 200` pada log tersebut adalah server action `cancelPostAction`, bukan request GET history kedua.
- Sampel terbaru menunjukkan `GET /history` sekitar 2.9–4.0 s, `GET /api/notifications` sekitar 5.2 s, dan `GET /dashboard` sekitar 9.9 s. Angka ini adalah observasi latency, bukan bukti bahwa satu request dieksekusi dua kali.

**PROVEN dari source:** `GET /(app)` adalah label internal; wrapper layout dan page terpisah; nested call hanya reuse ID jika store sama; proxy tidak punya transport correlation; Link/polling dapat memicu client-driven work.

**LIKELY:** satu atau lebih RSC, prefetch, navigation, refresh, atau parallel render lifecycle menjelaskan root execution yang berdekatan dan context resolver yang tidak berkorelasi. Child render yang berjalan setelah callback layout selesai juga konsisten dengan source, tetapi belum terbukti sebagai penyebab pada log ini.

**UNKNOWN:** jumlah HTTP request yang tepat; apakah pasangan-pasangan tersebut berasal dari prefetch/RSC/navigation/refresh atau render parallel; apakah callback layout selesai sebelum child execution; dan apakah streaming/scheduling menyebabkan split context.

### 3.4.14 Root Cause Status

**PARTIALLY CONFIRMED.** Mismatch instrumentation boundary terbukti: `/(app)` adalah label layout dan history memiliki wrapper sendiri, sementara logger tidak punya HTTP/RSC correlation. Diagnostic terbaru juga mengonfirmasi beberapa root perf execution concurrent dengan ID berbeda dan sebagian resolver di luar active context. Penyebab transport pasti—beberapa HTTP request atau satu request dengan render/context split—belum terkonfirmasi.

### 3.4.15 Why Phase 3.2 Did / Did Not Solve It

Phase 3.2 menyelesaikan nested async callback reuse dan membuktikannya lewat test. Phase 3.2 tidak menambahkan transport correlation, tidak membungkus proxy, dan tidak membuktikan full RSC render/stream berada dalam callback layout. Karena itu Phase 3.2 tidak dapat membedakan independent HTTP/RSC lifecycle dari context split saat rendering.

### 3.4.16 Security Assessment

Tidak ditemukan risiko user isolation dari mekanisme ini: setiap root context memiliki store/UUID baru, concurrent isolation dites, cache tidak global, key tetap user/workspace-scoped, dan permission check tetap eksplisit. Ketidakpastian lifecycle adalah gap observability, bukan evidence data user A terbaca user B. Tidak ada cross-request cache atau fix security yang dibuat.

### 3.4.17 Performance Impact

Diagnostic terbaru menunjukkan latency aplikasi yang bermakna: history sekitar 2.9–4.0 s, notifications sekitar 5.2 s, dan dashboard sekitar 9.9 s pada sampel berbeda. Namun, concurrent root contexts dan resolver tanpa correlation belum cukup untuk mengatribusikan latency tersebut kepada duplicate same-request work. Performance impact: **OBSERVED LATENCY; NOT ATTRIBUTED; no improvement claim**.

### 3.4.18 Proposed Next Steps

Proposal saja, **NOT IMPLEMENTED**: tambahkan transport correlation ID di proxy; catat safe RSC/prefetch/navigation/path/method/status flags; cari supported render/stream hook; capture browser trace untuk initial document, prefetch, client navigation, dan `router.refresh()`; kelompokkan resolver berdasarkan transport ID → render ID → ALS `contextId`; korelasikan pasangan layout/history berdasarkan timestamp hanya sebagai investigative hint, bukan sebagai identitas request. Jangan membuat cache cross-request.

### 3.4.19 Changes Made

- source code modified: **NO**
- behavior changed: **NO**
- schema changed: **NO**
- migration changed: **NO**
- RLS changed: **NO**
- OAuth changed: **NO**
- provider changed: **NO**
- queue changed: **NO**
- Redis changed: **NO**
- worker changed: **NO**
- polling changed: **NO**
- Master Plan changed: **NO**
- commits/pushes: **NO**

Hanya `docs/PERFORMANCE-AUDIT.md` yang diperbarui. Perubahan dirty worktree lain dipertahankan.

# Phase 3.5 — Request Multiplication & Transport Correlation Audit

## 3.5.1 Objective

Menentukan transport/request yang benar-benar dapat menghasilkan execution `/history`, menghubungkannya dengan `transportId → requestId → contextId`, dan memisahkan evidence runtime dari kemungkinan lifecycle Next.js. Phase ini tidak melakukan optimasi.

## 3.5.2 Scope

Audit mencakup instrumentation perf dan AsyncLocalStorage, proxy, AppLayout, History, Dashboard, AppShell, navigation, Link/prefetch, `router.refresh()`, NotificationBell, notification API, Server Action, `revalidatePath`, loading boundaries, dan request yang dipanggil komponen client.

## 3.5.3 Baseline

Phase 3.4 menemukan pasangan context layout/history dengan ID berbeda, tetapi belum memiliki correlation transport. Baseline runtime menunjukkan history sekitar 2.9–4.0 s, notifications sekitar 5.2 s, dashboard sekitar 9.9 s, dan `POST /history` sekitar 10.5 s pada sampel berbeda. Angka tersebut bukan bukti duplicate request.

## 3.5.4 Instrumentation Added

Instrumentation minimal yang ditambahkan:

- `src/proxy.ts` membuat UUID v4 baru untuk setiap proxy invocation, mengklasifikasikan transport dari method/path/header, meneruskan metadata lewat header internal, dan menulis `[PERF][transport]`.
- `src/lib/transport.ts` berisi classifier murni dan validasi metadata. Hanya field aman yang dicatat: method, pathname, kind, boolean signal, status, durasi, dan UUID correlation.
- `src/lib/transport-server.ts` membaca header internal melalui async `headers()` tanpa mencatat header mentah.
- `src/lib/perf.ts` menambahkan `transportId` dan `transportKind` ke perf context serta semua measure yang berada dalam context tersebut.
- `src/lib/request-context.ts` menyimpan correlation transport secara request-scoped sehingga log resolver yang masih berada dalam request context tetap dapat dikaitkan.
- `cancelPostAction` dan `retryPlatformAction` sekarang dibungkus boundary perf khusus Server Action agar action execution memiliki `requestId/contextId`; behavior action tetap sama.
- Tidak ada cookie, Authorization header, OAuth value, token, request body, atau query mentah yang dicatat.

Jika request datang tanpa proxy metadata (misalnya unit test atau proses server non-request), correlation tetap `undefined`; sistem tidak mengarang transport ID.

## 3.5.5 Transport Classification

| Transport | Signal yang dipakai | Status klasifikasi |
|---|---|---|
| DOCUMENT | `GET`, bukan API, bukan RSC/prefetch | CONFIRMED sebagai classifier, runtime browser belum ditrace |
| RSC | header `rsc: 1` atau query `_rsc` | CONFIRMED sebagai classifier, runtime browser belum ditrace |
| PREFETCH | `Next-Router-Prefetch` bernilai `1/2/3` atau `purpose` mengandung `prefetch` | CONFIRMED sebagai classifier, runtime browser belum ditrace |
| SERVER_ACTION | `POST` dengan header `Next-Action` | CONFIRMED sebagai classifier; action source teridentifikasi |
| API | pathname `/api` atau `/api/...` | CONFIRMED sebagai classifier |
| UNKNOWN | method/signal ambigu | CONFIRMED sebagai fallback |

Classifier memakai beberapa signal dan memberi prioritas API → Server Action → prefetch → RSC → document. Nilai header yang berisi secret tidak pernah diteruskan ke log.

## 3.5.6 App Router Lifecycle Findings

Source dan dokumentasi Next.js menunjukkan App Router dapat memakai document request, RSC response untuk client navigation/refresh, dan prefetch sebelum klik. Layout shared menerima `children` dan tidak memanggil child page secara langsung. Streaming/RSC response dapat memiliki lifecycle lebih panjang daripada pembuatan React element.

Dari codebase sendiri, `<Link>` tidak menetapkan `prefetch`, sehingga prefetch default Next.js tetap berpotensi aktif di production. Namun, browser Network trace setelah instrumentation belum tersedia.

## 3.5.7 AppLayout Findings

`src/app/(app)/layout.tsx` menjalankan `requireUser`, `listUserWorkspaces`, dan `getActiveWorkspaceForUser`, lalu mengembalikan `AppShell` dengan `children`. `withPerfRequest("GET /(app)")` mengukur callback execution dan pembuatan element, bukan HTTP response atau keseluruhan RSC stream.

`AppLayout` dapat dieksekusi untuk document, RSC navigation, prefetch, atau refresh secara prinsip. Dari runtime lama, label `GET /(app)` tidak cukup untuk menentukan jenis transport. Setelah instrumentation, proxy log `[PERF][transport]` menjadi sumber correlation transport; trace authenticated baru tetap diperlukan untuk menghubungkan setiap pasangan secara langsung.

## 3.5.8 History Findings

`src/app/(app)/history/page.tsx` memiliki boundary terpisah `withPerfRequest("GET /history")`, lalu memuat user, settings, posts, accounts, dan optional detail. `loading.tsx` adalah loading boundary. `HistoryList` adalah client component dan memiliki:

- Link pagination/detail/create;
- `router.push()` untuk filter, clear filter, dan menutup detail;
- `router.refresh()` setelah `cancelPostAction` berhasil dan tombol retry load;
- `usePolling` yang dapat memanggil `router.refresh()` saat post masih processing/pending atau tab kembali visible.

Karena itu `/history` dapat memiliki execution tanpa full document melalui RSC refresh/navigation/prefetch. Ini adalah POSSIBLE/LIKELY dari framework dan source, bukan bukti browser-specific tanpa trace.

## 3.5.9 Dashboard Findings

`DashboardPage` tidak memiliki `withPerfRequest` sendiri; execution-nya berada di bawah AppLayout dan terlihat sebagai application code pada log route dashboard. `DashboardPolling` memakai `usePolling` untuk `router.refresh()` saat ada post publishing. `PublishingHealthCard` menjalankan fetch API reliability periodik dan tidak memanggil `router.refresh()`.

CONFIRMED dari source: dashboard dapat menghasilkan RSC refresh berulang selama status publishing in-flight. UNKNOWN: apakah refresh tersebut sedang terjadi pada sampel dashboard 9.9 s karena browser trace belum tersedia.

## 3.5.10 Notification Findings

`NotificationBell` bukan interval poller. Saat mount, ia menjadwalkan satu `setTimeout(..., 0)` untuk `GET /api/notifications?limit=8`, memasang listener `notification:refresh`, dan membersihkan keduanya saat unmount. Tidak ditemukan dispatcher `notification:refresh` di repository.

`AppHeader` berada di AppShell; perubahan workspace memakai `key={activeWorkspaceId}` pada NotificationBell sehingga dapat menyebabkan remount dan initial fetch baru. `NotificationCenter` melakukan fetch hanya sebagai respons filter/pagination/read/delete UI. Tidak ada evidence NotificationBell memanggil `router.refresh()` atau me-render ulang AppLayout/history secara langsung.

`GET /api/notifications` yang bersamaan dengan page request adalah EXPECTED MULTI-REQUEST FLOW dari AppShell mount, bukan duplicate `/history`.

## 3.5.11 Navigation, Link, and Prefetch Audit

Sidebar client component memakai `<Link>` untuk item navigasi termasuk `/history`, `/dashboard`, `/templates`, `/connected-accounts`, `/scheduled`, dan `/reviews`; banyak card juga memakai Link ke history dengan query `post`. Tidak ada `prefetch={false}` yang ditemukan pada link penting tersebut. Handler client memakai `router.push()` untuk filter/detail/settings dan `router.replace()` untuk menghapus query OAuth/toast.

Static code evidence: Link dapat memicu prefetch dan client navigation dapat menghasilkan RSC execution. Browser initiator, viewport state, dan apakah prefetch benar-benar terjadi belum tersedia.

## 3.5.12 Router Refresh Audit

`router.refresh()` ditemukan pada:

| File/area | Trigger | Relevansi `/history` |
|---|---|---|
| `src/hooks/use-polling.ts` | timer 5 detik saat enabled dan tab visible; immediate refresh saat kembali visible | dapat me-render ulang route aktif, termasuk history/dashboard |
| `src/components/posts/history-list.tsx` | cancel berhasil, retry load, tombol retry | langsung memuat ulang history melalui RSC |
| `src/components/dashboard/dashboard-polling.tsx` | publishing in-flight | memuat ulang route dashboard dan AppLayout |
| `src/components/app-header.tsx` | selesai switch workspace | refresh route aktif setelah API mutation |
| settings/templates/drafts/team/scheduled | mutation atau retry UI | route aktif; tidak ada bukti otomatis memuat history jika history tidak aktif |

Tidak ada `setInterval` yang memanggil `router.refresh()` secara langsung; polling memakai recursive timeout. Tidak ada perubahan interval atau refresh behavior.

## 3.5.13 Server Action and Revalidation Findings

Flow aktual cancel dari History:

`HistoryList cancel click → cancelPostAction → cancelPostForUser → revalidatePath(/dashboard, /scheduled, /history) → action response → router.refresh() pada success`.

`revalidatePath()` ditemukan di source dan hanya menandai path untuk invalidation; source tidak membuktikan bahwa pemanggilan itu sendiri mengirim request baru. `router.refresh()` setelah action adalah trigger client yang terkonfirmasi dari source. Apakah Next mengirim RSC follow-up pada runtime tertentu masih membutuhkan browser trace.

`POST /history` dan `cancelPostAction` tidak boleh disamakan durasinya: action duration dan access-log duration mengukur boundary berbeda. Phase ini menambahkan perf boundary pada action agar keduanya dapat dibandingkan pada run baru, tanpa mengubah hasil action.

## 3.5.14 Proxy Correlation Findings

Sebelum perubahan, `src/proxy.ts` hanya auth gate dan tidak memancarkan request correlation. Sekarang setiap invocation proxy mendapat `transportId`, request kind, safe RSC/prefetch/action signals, status, dan durasi pada `[PERF][transport]`.

Proxy dapat melihat method, pathname, query presence, `rsc`, `_rsc`, `Next-Router-Prefetch`, `purpose`, dan `Next-Action`. Header seperti `Next-Router-State-Tree` dan `Next-Url` tidak dicatat nilainya karena tidak diperlukan untuk classifier minimal. Header internal ditimpa oleh proxy, bukan menerima ID dari client.

## 3.5.15 Request Correlation Semantics

Correlation yang sekarang dimaksudkan:

`proxy transportId → withPerfRequest requestId → ALS contextId → AppLayout/page/resolver logs`.

`transportId` adalah server-assigned UUID per proxy invocation. `requestId` adalah ID per root perf boundary. `contextId` adalah ID per request-context store. Dengan demikian, dua contextId berbeda tetap bukan bukti duplicate; evidence kuat baru muncul bila transportId, kind, path, initiator, dan trigger juga cocok.

Jika child execution terjadi di luar callback/ALS boundary, log itu tetap dapat tanpa ID. Kondisi tersebut adalah observability gap yang harus dicari pada runtime, bukan alasan untuk membuat global state.

## 3.5.16 Browser Trace Procedure

Browser trace belum dijalankan dari environment Codex dengan sesi authenticated. Jalankan di Chrome DevTools Network dengan Preserve log dan, bila relevan, Disable cache. Jangan menyalin cookie, Authorization, token, OAuth code/state, atau body sensitif.

1. Initial History: buka `/history`, catat Document, Fetch/XHR, dan RSC sampai settle.
2. Dashboard → History: mulai `/dashboard`, klik History, catat seluruh request dan Initiator.
3. Idle History: tunggu 10–15 detik tanpa action untuk melihat refresh/polling.
4. Cancel: klik Cancel, catat Server Action POST, request RSC lanjutan, notification API, dan initiator.
5. Notifications: di dashboard tunggu 15–30 detik, lalu buka history dan lihat apakah API notification tetap berjalan.
6. Repeat navigation: dashboard → history → dashboard → history; bandingkan request dan `x-autopost-transport-id`/server logs.

## 3.5.17 Correlation Matrix

| Evidence | TransportId | RequestId | ContextId | Trigger | Status |
|---|---|---|---|---|---|
| Existing authenticated logs sebelum instrumentation | MISSING | PRESENT | PRESENT | UNKNOWN | POSSIBLE REQUEST MULTIPLICATION |
| Proxy `[PERF][transport]` pada run baru | PRESENT per proxy invocation | downstream only if perf boundary | downstream only if ALS active | UNKNOWN until browser trace | INSTRUMENTED, NOT YET OBSERVED |
| `GET /history` source route | available at runtime | page boundary | page ALS | document/RSC/prefetch/refresh possible | UNKNOWN transport until trace |
| `POST /history` cancel | available at runtime | action boundary after this change | action ALS after this change | user cancel | CONFIRMED SERVER ACTION source flow |
| NotificationBell initial fetch | API transport | API perf boundary | API ALS | AppHeader mount/remount | CONFIRMED EXPECTED API FLOW |

Tidak ada baris browser trace yang diarang. Runtime row pertama merujuk diagnostic lama yang memang belum memiliki transport ID.

## 3.5.18 Request Graph

Flow yang terbukti dari source:

```text
proxy
  └─ transportId + requestKind
       └─ App Router request
            ├─ AppLayout: withPerfRequest("GET /(app)")
            │    └─ AppShell/AppHeader
            │         └─ NotificationBell → GET /api/notifications
            └─ HistoryPage: withPerfRequest("GET /history")
                 └─ HistoryList
                      ├─ router.refresh() saat cancel/polling/retry
                      └─ cancelPostAction → revalidatePath → response
```

RSC versus document, prefetch, dan initiator browser pada graph di atas masih UNKNOWN sampai browser trace tersedia.

## 3.5.19 Request Multiplication Classification

**CONFIRMED:** ada beberapa jenis transport yang secara teknis dapat menghasilkan execution server; ada expected multi-request flow page + notification API; action cancel dan route history memakai request method/boundary berbeda.

**LIKELY:** Link prefetch, client navigation, dan `router.refresh()` dapat menjelaskan execution AppLayout/History yang berdekatan; Dashboard polling dapat menghasilkan RSC refresh saat publishing aktif.

**POSSIBLE:** request multiplication untuk user action tertentu, berdasarkan context berbeda dan overlap timestamp pada diagnostic lama.

**UNKNOWN:** apakah context pairs lama adalah transport berbeda, prefetch, RSC navigation, refresh, parallel render, retry browser, atau same transport dengan multiple execution. Tidak ada bukti yang cukup untuk menyebutnya `CONFIRMED DUPLICATE TRANSPORT`.

## 3.5.20 Performance Interpretation

- Per-request latency: baseline history 2.9–4.0 s, notifications sekitar 5.2 s, dashboard sekitar 9.9 s, dan action access log sekitar 10.5 s pada sampel berbeda.
- Concurrent workload: beberapa root perf execution dapat berjalan overlap; instrumentation baru memungkinkan penghitungan transport pada run berikutnya.
- User-visible latency: belum dapat dihitung dari server log saja karena RSC stream dan browser scheduling belum ditrace.
- Tidak ada optimasi, perubahan polling, penghapusan prefetch, atau penggabungan request yang dilakukan.

## 3.5.21 Confirmed Bottlenecks

Yang terkonfirmasi hanya latency aplikasi/resolver sebagai observed bottleneck pada sampel, bukan root cause multiplication. `withPerfRequest` juga terkonfirmasi hanya mengukur callback boundary, bukan keseluruhan HTTP/RSC response lifecycle.

## 3.5.22 Likely and Possible Findings

LIKELY: `router.refresh()` pada history/dashboard dan automatic Link prefetch adalah sumber execution tambahan yang valid menurut source/framework. POSSIBLE: beberapa execution lama berasal dari kombinasi refresh/prefetch/navigation. Tidak ada trigger spesifik yang boleh dipilih sebagai root cause sebelum browser trace menghubungkan initiator ke `transportId`.

## 3.5.23 Unknowns and Browser Requirement

**BROWSER TRACE REQUIRED.** Data yang dibutuhkan: timestamp, method, path, status, initiator, type, duration, apakah Document/Fetch/XHR, signal RSC/prefetch/action, dan response header relevant. Correlate dengan server `[PERF][transport]`, `requestId`, dan `contextId`; jangan mengirim secret.

## 3.5.24 Root Cause Status

**PARTIALLY CONFIRMED.** Transport correlation gap telah diperbaiki secara minimal dan static/runtime baseline menunjukkan beberapa execution concurrent, tetapi request multiplication untuk trigger yang sama belum terbukti. Phase berikutnya tidak boleh melakukan optimasi berdasarkan contextId saja.

## 3.5.25 Recommended Phase 3.6

Satu langkah berikutnya: lakukan browser trace authenticated pada scenario Initial History, Dashboard → History, Idle History, Cancel, dan Notification, lalu cocokkan hasilnya dengan `[PERF][transport]`. Pilihan optimasi Phase 3.6 harus ditentukan setelah trigger transport benar-benar terkonfirmasi.

## 3.5.26 Files Changed

- `src/lib/transport.ts`
- `src/lib/transport-server.ts`
- `src/lib/perf.ts`
- `src/lib/request-context.ts`
- `src/proxy.ts`
- `src/lib/actions/posts.ts`
- `src/lib/transport.test.ts`
- `docs/PERFORMANCE-AUDIT.md`

Master Plan tidak diubah. Perubahan dirty worktree lain dipertahankan.

## 3.5.27 Validation

Validation setelah instrumentation:

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- targeted transport/request-context tests: PASS; full unit suite pada run tersebut 341/341
- `npm run test:integration`: PASS; 138/138
- `npm run test:all`: PASS; unit 341/341 dan integration 138/138
- `npm run build`: PASS; Next.js 16.3.4, 22/22 halaman
- `git diff --check`: PASS
- local smoke request `GET /`: PASS; proxy menghasilkan `[PERF][transport]` dengan `requestKind: DOCUMENT` dan UUID correlation tanpa secret

## 3.5.28 Security Assessment

- no secrets logged: PASS by design and logger sanitization
- no token/cookie/Authorization/body exposure: PASS by design
- no auth behavior changed: PASS
- no RLS/schema/migration change: PASS
- no cross-request global state introduced: PASS
- correlation ID is server-generated and UUID-validated when read downstream

## 3.5.29 Changes Made

- optimization: **NO**
- business logic change: **NO**
- route/response contract change: **NO**
- auth/authz/RLS/schema/OAuth/provider/queue/Redis/worker/polling behavior change: **NO**
- diagnostic instrumentation: **YES, minimal**
- documentation update: **YES**
- commit/push: **NO**

# Phase 3.6 — Unified Request Context

## Objective

Memperbaiki fragmentasi request context yang terlihat pada trace authenticated: satu transport server dapat merender `AppLayout` dan page child melalui boundary `withPerfRequest` yang terpisah, tetapi resolver auth/workspace harus berbagi cache request-scoped yang sama. Transport berbeda tetap terisolasi.

Scope fase ini hanya request-context correlation dan deduplication. Tidak ada perubahan pada auth/authz semantics, RLS, schema, OAuth, provider, queue, Redis, worker, polling, atau business behavior.

## Phase 3.5 Baseline

Instrumentation Phase 3.5 membuktikan korelasi transport secara aman. Pada trace `GET /history` dengan `transportId=6338bdfd-...`, `AppLayout` memakai `contextId=fd7c7c6e-...` sedangkan `HistoryPage` memakai `contextId=b34e14a6-...`, walaupun keduanya `DOCUMENT` pada lifecycle transport yang sama. Resolver personal workspace berjalan sekitar 2.17 s pada kedua boundary.

Trace yang sama memperlihatkan `GET /api/notifications` memiliki transport ID sendiri, sehingga API request memang terpisah. Beberapa `GET /history` berikutnya juga memiliki transport ID berbeda; trigger browser masing-masing tetap memerlukan authenticated browser trace.

## Confirmed Root Cause

Root cause yang ditangani adalah context fragmentation pada batas RSC/layout/page. `AsyncLocalStorage` mempertahankan context selama callback async boundary aktif, tetapi sibling Server Component boundaries dapat dipanggil dari render server yang sama tanpa menjadi child callback ALS satu sama lain. Akibatnya dua root `withPerfRequest` sebelumnya membuat dua `RequestContext` dan dua promise maps.

Ini bukan global cache lintas user. Ini kegagalan berbagi context dalam satu server render/transport. Transport multiplication oleh browser belum dinyatakan selesai hanya dari server logs.

## Current Architecture Before Fix

- `RequestContext` berisi promise maps dan counters di `AsyncLocalStorage`.
- `withRequestContext` me-reuse store aktif, atau membuat context baru.
- `withPerfRequest` me-reuse perf/context saat nested dalam callback yang sama.
- `AppLayout` dan child page dapat menjadi dua root ALS callback saat React merender RSC.
- `contextId` dibuat ulang pada setiap root boundary tersebut.

## Context Fragmentation

Sebelum Phase 3.6, alurnya:

```text
transport DOCUMENT 6338bdfd-...
  ├─ AppLayout   → context fd7c7c6e-... → auth/workspace resolver
  └─ HistoryPage → context b34e14a6-... → auth/workspace resolver lagi
```

Promise deduplication efektif untuk nested/concurrent resolver dalam satu ALS store, tetapi tidak antara layout dan page yang sama-sama berada pada satu transport.

## Design Decision

Dipilih kombinasi berikut:

1. `AsyncLocalStorage` tetap menjadi isolasi runtime utama.
2. `cache(createRequestContext)` React dibuat sekali di module scope. React menginvalidasi cache server ini pada setiap server request/render, sehingga sibling Server Component boundaries dalam render yang sama dapat memperoleh object context yang sama.
3. `withRequestContext` tetap me-reuse ALS store bila sudah aktif. Bila belum aktif, ia mengambil context dari React render cache.
4. `expectedTransportId` menjadi guard. Jika context kandidat sudah memiliki transport ID berbeda, context baru dibuat; identity transport tidak ditentukan hanya dari pathname.
5. `requestId` tetap correlation execution/perf boundary. `contextId` menjadi identity shared request context. `transportId` tetap identity HTTP/RSC/action/API transport.
6. Tidak ada `Map` global, singleton cache lintas request, cookie baru, header rahasia, atau perubahan authorization.

## Implementation

### `src/lib/request-context.ts`

- menambahkan module-scope React `cache(createRequestContext)`;
- `withRequestContext` menerima optional `expectedTransportId`;
- context dengan transport ID berbeda tidak boleh direuse;
- `setRequestTransportCorrelation` menolak overwrite dari transport berbeda;
- menambahkan `perfBoundaryCount` sebagai counter request-scoped untuk observability reuse.

### `src/lib/perf.ts`

- membaca correlation transport sebelum memilih request context;
- meneruskan `transportId` sebagai affinity guard;
- menandai setiap boundary dengan `contextReused: true|false`;
- menulis `[PERF][boundary]` per boundary dan mempertahankan `[PERF][context]` summary pada root perf boundary ALS;
- resolver counters tetap berasal dari context object yang sama.

### Tests

- `src/lib/request-context.test.ts` memverifikasi concurrent request isolation, nested perf reuse, dan transport affinity.

## Security and Isolation

- Context hanya memuat promise references, counters, UUID correlation, dan metadata transport yang aman.
- User ID, workspace ID, cookie, bearer token, request body, authorization header, dan provider secret tidak ditambahkan ke log correlation.
- Concurrent requests tetap memperoleh object/context ID berbeda di luar render cache.
- Transport ID berbeda tidak dapat overwrite transport correlation pada context yang sudah terikat.
- Cache key resolver yang sudah memasukkan user/workspace identity tidak berubah.
- Auth/authz behavior, RLS, schema, migration, OAuth, provider, queue, Redis, worker, dan polling tidak berubah.

## Tests

Automated checks yang dijalankan setelah perubahan:

- targeted request-context/perf command: PASS; full unit suite pada command tersebut 343/343;
- transport classifier tests: PASS;
- request context isolation: PASS;
- nested perf boundary reuse: PASS;
- transport affinity guard: PASS.

Test runtime di luar React Server Component renderer sengaja tetap membuat context baru per root invocation; ini menjaga isolation untuk route handler, worker, dan unit test yang tidak memiliki React render dispatcher. Build Next menjadi validasi bundling/Server Component integration.

## Browser Verification

**REQUIRED / NOT RUN IN THIS TURN.** Tidak ada authenticated browser session yang tersedia untuk mengulang trace setelah perubahan tanpa meminta login/interaksi pengguna. Tidak ada klaim bahwa browser sudah membuktikan hasil akhir.

Saat diverifikasi, gunakan Initial History dan Dashboard → History, lalu cocokkan:

- satu `transportId` untuk satu document/RSC transport;
- `contextId` yang sama pada `AppLayout` dan `HistoryPage` jika keduanya berada pada transport tersebut;
- `contextReused: true` pada boundary kedua;
- `authResolveCount` dan `personalWorkspaceResolveCount` tidak bertambah dua kali akibat fragmentasi layout/page;
- `GET /api/notifications` tetap memiliki transport/context terpisah;
- browser initiator, type, status, duration, dan RSC/prefetch/action signals.

## Before / After Correlation

| Boundary | Before Phase 3.6 | Expected after Phase 3.6 |
|---|---|---|
| AppLayout pada `GET /history` | `transportId=6338bdfd-...`, `contextId=fd7c7c6e-...` | transport sama, shared context root |
| HistoryPage pada `GET /history` | `transportId=6338bdfd-...`, `contextId=b34e14a6-...` | transport sama, `contextId` sama dengan AppLayout, `contextReused=true` |
| `/api/notifications` | transport/context berbeda | tetap berbeda |
| browser `GET /history` berikutnya | transport ID berbeda | tetap transport/context berbeda |

Expected after values adalah implementation contract dan tetap memerlukan browser evidence. ID aktual setelah deploy harus dibaca dari log, bukan diinferensikan.

## Resolver Counts

Sebelum fix, sample authenticated menunjukkan personal workspace lookup sekitar 2.17 s pada layout dan sekitar 2.18 s pada page dalam transport yang sama. Setelah fix, kedua boundary berbagi promise map request context. Untuk input resolver identik yang overlap, resolver pertama menyumbang `*ResolveCount=1` dan pemanggilan berikutnya `*CacheHitCount`; ini harus dikonfirmasi pada `[PERF][context]` setelah browser rerun.

## Latency

Perubahan ini menghilangkan repeated in-flight resolver work akibat fragmentasi context layout/page. Ia tidak mengubah query SQL, index, network provider, atau browser scheduling. Latency improvement aktual belum boleh diberi angka sebelum authenticated before/after trace comparable.

Baseline Phase 3.5 tetap: history sekitar 2.9–4.0 s, notifications sekitar 5.2 s, dashboard sekitar 9.9 s, dan action access log sekitar 10.5 s pada sampel berbeda. Angka ini bukan benchmark Phase 3.6.

## Remaining Bottlenecks

- Browser masih perlu membuktikan apakah navigation, RSC refresh, prefetch, polling, retry, atau user action menghasilkan transport tambahan.
- Resolver/database latency dasar masih ada; unified context hanya mencegah kerja resolver yang sama diulang pada shared transport.
- `/api/notifications` tetap request terpisah dan tidak dipaksa masuk document context.
- `requestId` tetap dapat berbeda untuk execution boundary; gunakan `transportId` + `contextId` untuk grouping.
- Caller/page yang belum memakai `withPerfRequest` tetap tidak menghasilkan boundary perf detail sampai instrumentation fase terpisah.

## Status

**PARTIALLY ADDRESSED — BROWSER VERIFICATION REQUIRED.** Root cause context fragmentation sudah ditangani dalam code dan automated validation. Klaim bahwa seluruh gejala request multiplication pengguna selesai ditahan sampai browser trace authenticated setelah fix.

## Next Phase

Jalankan authenticated browser trace untuk Initial History, Dashboard → History, Idle History, Cancel, dan Notification. Jika transport tambahan terkonfirmasi, baru pilih optimasi trigger spesifik. Jika transport hanya satu tetapi latency tetap tinggi, lanjutkan profiling query/resolver berdasarkan counter dan duration terbaru.

## Files Changed

- `src/lib/request-context.ts`
- `src/lib/perf.ts`
- `src/lib/request-context.test.ts`
- `docs/PERFORMANCE-AUDIT.md`

Phase 3.5 transport files dan existing dirty worktree changes dipertahankan. Master Plan tidak diubah.

## Validation

Completed in this turn:

- `npm run typecheck`: PASS
- targeted request-context/perf test command: PASS; 343/343 unit tests in the run

Validation lengkap pada final handoff:

- `npm run lint`: PASS
- `npm run test:all`: PASS; unit 343/343 dan integration 138/138
- `npm run build`: PASS; Next.js 16.3.4, 22/22 halaman
- `git diff --check` pada seluruh worktree: BLOCKED oleh dua conflict marker pre-existing di `.agents/plans/Master Plan.md` line 804 dan 1540; file tersebut user-dirty dan tidak diubah
- local smoke `GET /`: PASS; HTTP 200 dan proxy menghasilkan `[PERF][transport]` dengan `requestKind: DOCUMENT`, UUID correlation, dan tanpa secret

## Git

- commit: **NOT CREATED**
- push: **NOT PERFORMED**
- unrelated/user dirty changes: **PRESERVED**

# Publish Trace Audit Result — 2026-09-16

## Scope and conclusion

Audit awal menemukan bahwa Publish Flow End-to-End Trace belum diimplementasikan. Tidak ada referensi untuk `publishTraceId`, `[POST-TRACE]`, atau event lifecycle publish yang diminta. Karena itu, trace minimal sekarang ditambahkan sebagai observability-only wiring; queue payload tetap resource-ID-only dan behavior publishing, provider, endpoint Meta, token handling, retry, idempotency, cancellation, scheduling, serta status semantics tidak diubah.

## Actual flow

```text
CreatePostForm (Publish button)
  -> createPostAction (Server Action)
  -> createPostForUser
  -> createPost transaction (posts + post_media + post_platforms)
  -> enqueuePublishJob (one BullMQ job per post_platform)
  -> publish-worker / PUBLISH_QUEUE_NAME
  -> executePublishJob
  -> getProvider("facebook")
  -> MetaProvider.publish
  -> graph.ts publishPagePhoto/publishPageVideo
  -> requestJson / Meta Graph API v26.0
  -> finishExecutionPublished/finishExecutionFailed
  -> recompute post-platform/post status
```

Draft publish has the corresponding path `publishDraftAction -> publishDraftForUser -> publishDraft`; the API routes `/api/posts` and `/api/drafts/[id]/publish` remain separately instrumented alternatives, while the current UI button uses the Server Action path.

## Required audit answers

1. **Apakah instrumentation Publish sudah ada?** Sebelum perubahan ini: **belum ada**. Sekarang: **sudah ada** untuk request, post mutation, queue, worker, execution, provider, Meta response, dan final status.
2. **Di mana Publish sebenarnya dimulai?** Di `src/components/posts/composer/create-post-form.tsx`, saat form submit memanggil `createPostAction(payload)`; draft memakai `publishDraftAction(...)`.
3. **Apa Server Action/API yang digunakan?** Jalur UI memakai `createPostAction` di `src/lib/actions/posts.ts`. Alternatifnya adalah `POST /api/posts` dan `POST /api/drafts/[id]/publish`.
4. **Di mana Post dibuat/ditemukan?** Post baru dibuat di `createPost` (`src/lib/domain/posts.ts`); draft yang dipublish ditemukan dan di-update di `publishDraft` pada file yang sama. `POST_CREATED`, `POST_UPDATED`, dan `PUBLISH_REQUEST` dicatat.
5. **Di mana Execution dibuat?** `executePublishJob` memanggil `startExecution` di `src/lib/domain/executions.ts`; event `EXECUTION_FOUND` dicatat bila attempt sebelumnya memang ada, lalu `EXECUTION_CREATED` untuk attempt baru.
6. **Di mana BullMQ job dibuat?** `enqueuePublishJob` di `src/lib/queue/publish.ts`, dipanggil setelah transaksi post commit dari `createPost`/`publishDraft`.
7. **Worker mana yang memproses job?** `src/workers/publish-worker.ts`, pada `PUBLISH_QUEUE_NAME`, lalu meneruskan ke `executePublishJob`.
8. **Provider mana yang digunakan Facebook?** `MetaProvider` di `src/providers/social/meta/index.ts`.
9. **Di mana request Meta dilakukan?** `src/providers/social/meta/graph.ts` memanggil helper terpusat `requestJson` di `src/providers/social/http.ts`; trace mencatat endpoint/method/status/duration tanpa URL query, body, atau credential.
10. **Apakah `publishTraceId` sudah melewati async boundary?** Ya. ID dibuat di action/API, diteruskan eksplisit melalui service/domain ke `enqueuePublishJob`, disimpan di payload BullMQ sebagai identifier non-secret, dibaca worker, lalu dipasang ke `AsyncLocalStorage` selama `executePublishJob`. Retry BullMQ mempertahankan payload yang sama.
11. **Mengapa log `[POST-TRACE]` belum muncul?** Bukan karena Facebook, Meta scope, queue, atau logger kehilangan correlation ID. Pada audit awal event dan wiring tersebut memang tidak ada di code path yang digunakan. Trace baru juga sengaja mengikuti gate `perfLoggingEnabled`: aktif pada `NODE_ENV=development` atau `APP_ENV=staging`, sama seperti log `[PERF]` yang terlihat pada log pengguna; production tetap silent. Setelah deploy/restart, entrypoint/queue events terlihat di proses web, sedangkan `WORKER_JOB_RECEIVED` sampai Meta events terlihat di proses worker; keduanya harus dikumpulkan saat membandingkan satu `publishTraceId`.
12. **File yang diubah:** `src/lib/publishing/trace.ts` (baru), `src/lib/actions/posts.ts`, `src/app/api/posts/route.ts`, `src/app/api/drafts/[id]/publish/route.ts`, `src/lib/services/posts.ts`, `src/lib/domain/posts.ts`, `src/lib/domain/executions.ts`, `src/lib/queue/publish.ts`, `src/workers/publish-worker.ts`, `src/lib/publishing/execute.ts`, `src/providers/social/http.ts`, dan dokumen ini. Perubahan existing user/worktree lain dipertahankan.
13. **Test yang dijalankan:** `npm run typecheck`, `npm run lint`, `npm run test:all`, dan `npm run build`; tidak ada request Facebook atau post Facebook nyata yang dibuat.
14. **Git status:** tidak ada commit atau push. Worktree tetap dirty karena perubahan user yang sudah ada; `.agents/plans/Master Plan.md` tidak disentuh.

## Instrumentation coverage

| Stage | Event | Location |
|---|---|---|
| request | `PUBLISH_REQUEST` | Server Action dan API entrypoints |
| post mutation | `POST_CREATED`, `POST_UPDATED` | `createPost` / `publishDraft` |
| enqueue | `QUEUE_ENQUEUE_START`, `QUEUE_ENQUEUE_SUCCESS`, `QUEUE_ENQUEUE_FAILED` | `createPost` / `publishDraft` |
| worker | `WORKER_JOB_RECEIVED` | `publish-worker.ts` |
| execution | `EXECUTION_PROCESSING`, `EXECUTION_FOUND`, `EXECUTION_CREATED` | `executePublishJob` |
| provider | `PROVIDER_START` | `publishing/execute.ts` sebelum `provider.publish` |
| Meta HTTP | `META_REQUEST_START`, `META_RESPONSE`, `META_RESPONSE_ERROR` | `requestJson` |
| result | `EXECUTION_SUCCESS`, `EXECUTION_FAILED` | execution completion/error handlers |
| post status | `POST_STATUS_UPDATED` | setelah recompute status |

## Security and limitations

Trace fields dibatasi pada correlation/resource IDs, platform, operation, endpoint name, method, status, attempt, error code, retryability, dan timing. Tidak ada access token, refresh token, OAuth code, client secret, cookie, Authorization header, API key, credential URL, request body, caption, atau media URL di payload/log trace. Recovery sweep dan manual retry yang membuat job baru di luar request awal tidak dapat mewarisi trace ID historis karena ID tersebut tidak disimpan di database; behavior recovery tetap tidak diubah.

## Validation record

Automated checks for this audit:

- `npm run typecheck`: **PASS**
- `npm run lint`: **PASS**
- `npm run test:all`: **PASS**; unit 344/344 dan integration 138/138
- `npm run build`: **PASS**; Next.js 16.3.4, 22/22 halaman
- `src/lib/publishing/trace.test.ts`: **PASS**; correlation ID tetap tersedia setelah async boundary
- `git diff --check` scoped (excluding the existing Master Plan file): **PASS**
- `git diff --check` full worktree: dua conflict marker pre-existing di `.agents/plans/Master Plan.md` line 804 dan 1540; file tersebut tidak diubah
- no real Facebook API request/post: **CONFIRMED**
- no commit/push: **CONFIRMED**

# BullMQ Custom Job ID Fix — 2026-09-16

## Root cause

The verified draft-publish path was `publishDraftAction -> publishDraftForUser -> publishDraft -> enqueuePublishJob -> Queue.add("publish", ..., { jobId })`. `publishJobId` in `src/lib/queue/publish.ts` generated `${postPlatformId}:${attempt}`. The installed BullMQ version is **5.81.4** (`package-lock.json`); its installed `Job` implementation rejects a custom ID containing `:` unless it has the reserved three-part repeatable-job shape. The publish ID had only two parts, so BullMQ threw `Custom Id cannot contain :` before a worker could receive the job.

## Minimal fix

The canonical format is now `${postPlatformId}-${attempt}`. It remains deterministic for the same target and attempt, remains unique across targets and attempts, and is still the exact ID stored in `post_platforms.bullmq_job_id`, looked up by `removePublishJob`, used by cancellation/retry bookkeeping, and passed to execution tracking. The recovery fallback now uses the same canonical helper directly. No queue name, payload resource-ID rule, retry option, delay, worker, provider, Meta API, or status behavior was changed.

## Verification scope

The focused queue test verifies that IDs contain no colon, remain deterministic, differ by target/attempt, and contain no credential-like value. Existing integration coverage verifies enqueue bookkeeping, job removal/cancellation, retries, scheduled jobs, recovery, idempotency, and multi-platform execution. Tests use the in-memory queue/fake providers where appropriate; no real Facebook API request or post was made.

An earlier diagnostic trace was verified only through `QUEUE_ENQUEUE_FAILED`; no claim is made that Facebook/Meta execution succeeded. The later runtime excerpt reviewed below contained no `[POST-TRACE]` events. After restarting the web and worker processes, a fresh publish should be checked across both process logs: web process for `QUEUE_ENQUEUE_SUCCESS`, worker process for `WORKER_JOB_RECEIVED` and subsequent events.

The supplied performance observation (`publishDraftAction` about 10.7 seconds and full Server Action about 17.0 seconds) is unchanged and intentionally out of scope for this phase.

# Publish Runtime Verification After BullMQ Job ID Fix

## Runtime evidence reviewed

The supplied runtime excerpt for post `a6200e21-6ca5-43b7-919f-31eed135ac75` contains only:

```text
POST /drafts/<id> 200 in 17.2s
publishDraftAction(...) in 11186ms
```

It contains no `[POST-TRACE]` event. Therefore the excerpt proves only that the request/server-action transport returned HTTP 200 and reports its duration. It does not prove queue acceptance, worker receipt, provider execution, a Meta request, execution completion, or the final post status. No Facebook success is claimed from this excerpt.

## Verified code path after the fix

The current UI Publish button uses:

```text
CreatePostForm
  -> publishDraftAction
  -> publishDraftForUser
  -> publishDraft
  -> enqueuePublishJob
  -> Queue.add("publish", payload, { jobId })
  -> publish-worker
  -> executePublishJob
  -> MetaProvider.publish
  -> requestJson / Meta Graph API
  -> execution result and post status recomputation
```

`enqueuePublishJob` uses the real BullMQ queue `publish-post-platform`. The canonical custom job ID is now `${postPlatformId}-${attempt}`. It is deterministic and contains no colon. This is the ID returned to the domain and stored in `post_platforms.bullmq_job_id`; cancellation and retry continue to use that stored value without parsing it. The BullMQ 5.81.4 colon restriction is documented in the preceding fix section.

The server action returns `{ ok: true, postId, status }` when the domain function returns. The domain logs `QUEUE_ENQUEUE_START`, awaits `enqueuePublishJob`, and logs `QUEUE_ENQUEUE_SUCCESS` only after `Queue.add` resolves; failures log `QUEUE_ENQUEUE_FAILED`. The queue payload contains only `postPlatformId`, `attempt`, and the non-secret `publishTraceId`.

## Runtime versus code/test proof

| Stage | Code/test status | Proven for the supplied runtime? |
|---|---|---|
| `PUBLISH_REQUEST` and post update | Wired in the Server Action/domain | No; absent from the excerpt |
| `QUEUE_ENQUEUE_START` / `QUEUE_ENQUEUE_SUCCESS` | Wired around the real `Queue.add`; ID fix covered by unit/integration tests | No |
| `WORKER_JOB_RECEIVED` | Wired in `src/workers/publish-worker.ts` | No |
| `EXECUTION_PROCESSING` / creation | Wired in `executePublishJob` | No |
| `PROVIDER_START` | Wired before `MetaProvider.publish` | No |
| `META_REQUEST_START` / response | Wired in central `requestJson` | No |
| `EXECUTION_SUCCESS` / `EXECUTION_FAILED` | Wired in execution completion handlers | No |
| `POST_STATUS_UPDATED` | Wired after status recomputation | No |

The integration suite proves the application wiring with an in-memory queue and fake providers; it is not evidence that this particular production request reached Redis, the worker, Facebook, or Meta. The web server and worker are separate processes, so the web log must be checked for enqueue events and the worker log for worker/execution/provider/Meta events using the same trace ID. The trace logger is also gated by `perfLoggingEnabled()` (`NODE_ENV=development` or `APP_ENV=staging`); the supplied excerpt alone cannot establish whether the running process had the current code, whether both processes were restarted, or whether its logs were collected.

## Failure-state finding

If `Queue.add` fails after `publishDraft` commits its transaction, the post has already been set to `processing` (or `scheduled`) and its target remains `pending`. No execution row is created because the worker never runs. The enqueue error is logged and swallowed, so the Server Action can still return `ok: true` with `status: "processing"`. The recovery sweep can later reclaim and enqueue pending work, but until that happens the post can appear stuck in processing. This audit records the behavior and does not change it.

## Required next runtime check

Restart both the web and worker processes with the current build, perform one fresh publish, and collect both process logs. The minimum proof chain is `PUBLISH_REQUEST` -> `QUEUE_ENQUEUE_SUCCESS` (including queue name, attempt, and returned job ID) -> `WORKER_JOB_RECEIVED` -> provider/Meta events -> execution result -> `POST_STATUS_UPDATED`. Until that dual-process trace exists, the exact stopping point for the supplied request is: after the HTTP/server-action timing line, with no observable publish-stage event.

No Facebook API request or Facebook post was made during this audit. No OAuth, permissions, token handling, provider behavior, queue architecture, retry/cancellation/idempotency behavior, database schema, RLS policy, or Master Plan was changed.

# Publish Runtime Trace Visibility Investigation

## Evidence and code path

The runtime timing entry proves that a request reached `publishDraftAction`'s Server Action boundary, but it does not prove that the running process executed the current source body. Repository search found exactly one production definition of `publishDraftAction`: `src/lib/actions/posts.ts`. The Publish button calls it from `src/components/posts/composer/create-post-form.tsx`; there is no duplicate, wrapper, re-export, compatibility implementation, or generated source definition elsewhere. The API route `src/app/api/drafts/[id]/publish/route.ts` is a separate path and is not the current UI button path.

The first executable statements in `publishDraftAction` are now:

```text
logger.info("[PUBLISH-ENTRY]", safe post/platform fields)
createPublishTraceId()
logPublishTrace(traceId, "PUBLISH_REQUEST", ...)
```

`PUBLISH_REQUEST` is therefore genuinely called from the production action body, not merely declared in the trace helper. It is then passed through `publishDraftForUser` -> `publishDraft` -> `enqueuePublishJob`; the worker reads the identifier from the BullMQ payload. The trace helper is production code, not test-only code, and the worker/provider/Meta call sites are also production call sites.

## Visibility finding

`logPublishTrace` uses the same `logger.info` implementation as the visible `[PERF]` messages, but it has an additional guard: it emits only when `perfLoggingEnabled()` is true. That condition is `NODE_ENV=development` or `APP_ENV=staging`. The logger itself has no level filter, namespace filter, or suppression rule; it writes info messages to `console.log`. `withPerfRequest` and `measurePerf` use the same environment gate for `[PERF]` output.

The supplied runtime excerpt contains no `[PUBLISH-ENTRY]` and no `[POST-TRACE]`. Because the current web process was not running/listening on port 3000 during this repository inspection, and process command-line inspection was restricted by Windows permissions, the exact deployed process/worktree and environment cannot be proven from this session. The source and `.next` artifacts in this repository contain the trace wiring, but that is not proof that the process producing the supplied log used those artifacts.

The exact pre-change visibility cause is consequently not provable from the supplied excerpt alone. The code-supported possibilities are: the running action process was not this current source/build, `NODE_ENV`/`APP_ENV` disabled the trace guard, or the web and worker streams were not collected together. The `[PERF]` lines do not eliminate these possibilities because they may come from a different request boundary or process. The new unconditional, credential-free `[PUBLISH-ENTRY]` marker is the minimal discriminator for the next fresh publish:

```text
[PUBLISH-ENTRY] present, [POST-TRACE] absent  -> trace environment guard/helper visibility issue
[PUBLISH-ENTRY] absent                       -> wrong action process/source or logger stream
both present                                 -> continue checking trace ID and async queue handoff
```

The diagnostic logs only the post ID, platform names, and timestamp. It does not log content, media URLs, tokens, cookies, authorization headers, OAuth codes, secrets, or credentials. No queue/worker/provider/Meta behavior was changed, and no success is claimed for Facebook publishing.

## Validation and next check

The next runtime check must restart the web process from this repository and perform one fresh draft publish. Capture the web process output containing `[PUBLISH-ENTRY]`, `[POST-TRACE] PUBLISH_REQUEST`, and enqueue events, then capture the separate worker output containing `WORKER_JOB_RECEIVED` and later events. Compare the non-secret `publishTraceId` across streams. The action timing line alone remains insufficient evidence of queue or Meta execution.

# Performance Phase 4 — Safe Read-Path and Draft-Publish Optimization

Tanggal: 2026-09-18

## Evidence

The existing audit already showed that `createPost` uses one batched account query, but `publishDraft` still called `getAccountRecord` inside the target loop. That made account validation scale as one workspace/account lookup per target. The same loop then performed provider validation serially, which remains unchanged because provider validation order and first-error behavior are part of the existing contract.

`listAccountSummaries` also used `select()` and therefore fetched encrypted access/refresh-token columns even though the function only returns account display metadata. The tokens were not sent to the client, but fetching them was unnecessary database work and unnecessary handling of sensitive columns.

## Changes

1. `publishDraft` now resolves all requested accounts with the existing workspace-scoped `getAccountRecordsForWorkspace` batch query, then validates targets in the original order.
2. `listAccountSummaries` now selects only the columns required by its response: account ID, platform, platform account ID, username, display name, avatar URL, and status.

No caching, schema/index migration, queue/worker change, provider change, OAuth change, polling change, or media-upload change was made.

## Static Query Comparison

| Operation | Before | After |
|---|---:|---:|
| Draft account validation for `N` targets | `N` account queries | `1` batch query |
| Account summary columns | Full `social_accounts` row including encrypted credential columns | 7 non-credential columns |

These are source-level query-count/column comparisons. A production latency percentage was not claimed because no authenticated controlled before/after benchmark was available in this run.

## Validation

The existing unit and integration suites cover draft publishing, account ownership/status validation, account summaries, queue lifecycle, worker execution, and provider behavior. Full validation after this phase is recorded in the final response. No credentials, tokens, or private media were logged.
