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
