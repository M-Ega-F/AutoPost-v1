# Social platform connections

AutoPost supports six platform targets:

| Platform | Environment variables | OAuth callback |
| --- | --- | --- |
| Instagram | `META_CLIENT_ID`, `META_CLIENT_SECRET` | `/api/oauth/instagram/callback` |
| Facebook | `META_CLIENT_ID`, `META_CLIENT_SECRET` | `/api/oauth/facebook/callback` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `/api/oauth/tiktok/callback` |
| Threads | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` | `/api/oauth/threads/callback` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `/api/oauth/linkedin/callback` |
| X | `X_CLIENT_ID` and optionally `X_CLIENT_SECRET` | `/api/oauth/x/callback` |

The new provider scopes are intentionally limited to publishing:

- Threads: `threads_basic`, `threads_content_publish`
- LinkedIn: `openid`, `profile`, `w_member_social`
- X: `tweet.read`, `tweet.write`, `users.read`, `offline.access`

## Analytics support

Analytics is capability-based and currently unavailable for all connected
platforms in this release. The existing OAuth grants are publish/profile grants
and are not expanded automatically for analytics permissions. TikTok's video
metrics query also requires the `video.list` scope, which is not part of the
current consent set. The app therefore stores an explicit unavailable snapshot
with nullable metrics instead of returning invented values. The provider
interface is ready for a platform adapter once its approved analytics scope is
added through an intentional reconnect.

## Threads

Threads uses the official OAuth flow at `threads.net/oauth/authorize`, then
exchanges the authorization code server-side and upgrades the short-lived token
to a long-lived token before reading `/me`. The resulting Threads profile ID is
stored as the stable `platform_account_id`, so reconnecting the same profile
updates its existing account row instead of creating a duplicate.

The provider supports the existing single-media post flow for JPEG, PNG, WebP,
MP4 and MOV content, subject to the shared Threads limits: 500-character
captions, 100 MB media, and video duration between 1 and 300 seconds. Carousel
and text-only posts are not part of this MVP because the shared composer stores
one media asset per post.

Publishing is performed by the existing queue and worker: the provider creates
a Threads media container and then publishes it. Token errors are normalized to
reconnect-required status, while rate limits remain retryable. No Threads token
is returned by account APIs, placed in a queue payload, or written to logs.

Add the exact callback URL for each provider to its developer console. The
application reads these credentials only on the server. The X provider uses
OAuth 2.0 PKCE and stores its verifier in an HttpOnly cookie during the OAuth
round trip.

The enum extension is additive. Apply `drizzle/0001_add_social_platforms.sql`
or `supabase/migrations/0002_add_social_platforms.sql` to an existing database
before creating posts for the new targets.

Provider configuration is lazy, so the app can still start when optional
credentials for one of the platforms have not been added yet. That platform
will remain disconnected until its variables are configured and the OAuth
callback is registered.
