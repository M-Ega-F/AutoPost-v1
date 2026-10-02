# Social platform connections

AutoPost supports seven platform targets:

| Platform | Environment variables | OAuth callback |
| --- | --- | --- |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | `/api/oauth/instagram/callback` |
| Facebook | `META_CLIENT_ID`, `META_CLIENT_SECRET` | `/api/oauth/facebook/callback` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `/api/oauth/tiktok/callback` |
| Threads | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` | `/api/oauth/threads/callback` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `/api/oauth/linkedin/callback` |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | `/api/oauth/youtube/callback` |
| X | `X_CLIENT_ID` and optionally `X_CLIENT_SECRET` | `/api/oauth/x/callback` |

Instagram uses Meta's standalone Instagram Login flow at
`instagram.com/oauth/authorize`; it does not discover accounts through
Facebook Pages or `/me/accounts`. The server exchanges the code at
`api.instagram.com/oauth/access_token`, upgrades the token server-side through
`graph.instagram.com/access_token`, and reads the Instagram User from
`graph.instagram.com/{version}/me`. Configure the exact callback URL in the
Instagram Login settings of the Meta App Dashboard.

Instagram Login requests `instagram_business_basic` and
`instagram_business_content_publish`. The Facebook Page flow remains separate
and continues to use `META_CLIENT_ID`, `META_CLIENT_SECRET`, and Facebook's
`/me/accounts` discovery.

The new provider scopes are intentionally limited to publishing:

- Threads: `threads_basic`, `threads_content_publish`
- LinkedIn: `openid`, `profile`, `w_member_social`
- YouTube: `https://www.googleapis.com/auth/youtube.upload`
- X: `tweet.read`, `tweet.write`, `users.read`, `offline.access`

## YouTube

YouTube uses Google's server-side OAuth flow with offline access. After consent,
the provider discovers the selected Google account's channel with
`channels.list?part=snippet&mine=true` and stores the channel ID as the stable
social account identity. Access and refresh tokens remain encrypted in the
existing social account storage; they are not sent to the browser or queue.

The provider supports video-only posts. Create Post stores a title and one of
`private`, `unlisted`, or `public` as YouTube-specific post metadata, while the
existing caption becomes the video description. Upload uses YouTube's
resumable `videos.insert` endpoint and stores the returned YouTube video ID as
the external post ID. Public uploads still depend on Google's API project
verification and the channel's permissions/quota.

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

The enum extension is additive. Apply the latest generated Drizzle migration to
an existing database before creating posts for the new targets.

Provider configuration is lazy, so the app can still start when optional
credentials for one of the platforms have not been added yet. That platform
will remain disconnected until its variables are configured and the OAuth
callback is registered.
