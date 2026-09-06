# OAUTH &amp; SOCIAL ACCOUNT INTEGRATION PLAN

## Multi-Social Auto Poster MVP

---

# 1. Current Project Status

The application core has been built and validated.

Current working features:

- Public landing page
- Signup
- Login
- Logout
- Protected routes
- Dashboard
- Create Post
- Media file preview
- Media URL preview
- Local browser media preview
- Caption input
- Platform selection
- Post creation flow
- Scheduling architecture
- BullMQ architecture
- Worker architecture
- Supabase database
- Supabase Auth
- RLS
- Integration tests

Current validation:

```text
TypeScript       PASS
ESLint           PASS
Unit Tests       PASS
Integration      PASS
Next Build       PASS

```

Current blocker:

```text
No social accounts connected

```

Connected Accounts page currently shows:

```text
Instagram → Not connected
Facebook  → Not connected
TikTok    → Not connected

```

OAuth routes already exist, but provider credentials are not configured.

---

# 2. Goal

Enable users to connect their own:

1. Instagram Professional Account
2. Facebook Page
3. TikTok Account

The user must be able to:

```text
Connected Accounts
        ↓
Click Connect
        ↓
OAuth Authorization
        ↓
Grant Permission
        ↓
Return to AutoPost
        ↓
Account Saved
        ↓
Ready for Publishing

```

---

# 3. Important Architecture Rule

The application uses a provider architecture.

Core posting logic must NOT directly depend on:

```text
Meta Graph API
TikTok API

```

Architecture:

```text
                    SocialProvider
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     Instagram       Facebook         TikTok
     Provider        Provider        Provider
          │              │              │
          └──────────────┼──────────────┘
                         │
                   OAuth Service
                         │
                  social_accounts
                         │
                  Encrypted Tokens

```

---

# 4. Security Requirements

OAuth tokens must:

```text
Backend only                 ✅
Worker only                  ✅
Encrypted at rest            ✅
Never sent to frontend       ✅
Never included in queue      ✅
Never included in logs       ✅
Never returned by API        ✅

```

BullMQ jobs must only contain resource IDs.

Example:

```json
{
  "postId": "uuid",
  "platformId": "uuid"
}

```

Never:

```json
{
  "accessToken": "secret",
  "refreshToken": "secret"
}

```

---

# 5. Environment Configuration

Required environment variables:

```env
APP_URL=http://localhost:3000

```

Production:

```env
APP_URL=https://your-domain.com

```

---

# 6. Meta Integration

Meta will handle:

```text
Instagram
Facebook Page

```

One Meta Developer App may support both integrations.

---

# 7. Meta Developer Setup

## Step 1

Go to Meta for Developers.

Create a new App.

Recommended app type:

```text
Business

```

---

## Step 2

Add required products.

At minimum evaluate and configure:

```text
Facebook Login
Instagram Graph API
Pages API

```

Do not add unnecessary Meta products.

---

## Step 3

Configure OAuth Redirect URLs.

Local development:

```text
http://localhost:3000/api/oauth/instagram/callback

```

Facebook:

```text
http://localhost:3000/api/oauth/facebook/callback

```

Production later:

```text
https://your-domain.com/api/oauth/instagram/callback

```

```text
https://your-domain.com/api/oauth/facebook/callback

```

---

# 8. Meta Environment Variables

Add to `.env.local`:

```env
META_CLIENT_ID=
META_CLIENT_SECRET=

```

Do NOT expose:

```text
META_CLIENT_SECRET

```

to:

```text
NEXT_PUBLIC_
Browser
Client Component
Frontend

```

---

# 9. Instagram Requirements

The system must validate the connected account.

Instagram publishing requires the supported account type and Meta configuration.

After OAuth:

```text
OAuth Token
      ↓
Fetch Meta Account
      ↓
Find Connected Facebook Page
      ↓
Find Instagram Account
      ↓
Validate Account
      ↓
Save social_accounts

```

The application should not assume OAuth success automatically means publishing capability is available.

---

# 10. Facebook Page Requirements

The system publishes to:

```text
Facebook Pages

```

Not arbitrary personal profiles.

After OAuth:

```text
OAuth Token
      ↓
Fetch User Pages
      ↓
Validate Page Access
      ↓
Select Available Page
      ↓
Save Account

```

If multiple Pages are available:

The application should use the existing MVP account-selection architecture.

Do not automatically create unnecessary UI unless required.

---

# 11. TikTok Integration

TikTok uses a separate developer application.

---

# 12. TikTok Developer Setup

Create a TikTok developer application.

Enable the required:

```text
Login Kit
Content Posting API

```

Configure OAuth.

Local redirect:

```text
http://localhost:3000/api/oauth/tiktok/callback

```

Production:

```text
https://your-domain.com/api/oauth/tiktok/callback

```

---

# 13. TikTok Environment Variables

Add:

```env
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

```

Never expose:

```text
TIKTOK_CLIENT_SECRET

```

to the browser.

---

# 14. OAuth Flow

Every provider must follow a similar architecture.

```text
USER

Click Connect
      ↓

AUTPOST

Generate OAuth State
      ↓

PROVIDER

Authorization Page
      ↓

USER

Approve Permission
      ↓

PROVIDER

OAuth Callback
      ↓

AUTPOST SERVER

Validate State
      ↓

Exchange Code
      ↓

Get Access Token
      ↓

Get Refresh Token if available
      ↓

Fetch Account Metadata
      ↓

Validate Account
      ↓

Encrypt Tokens
      ↓

Save social_accounts
      ↓

Redirect Connected Accounts

```

---

# 15. OAuth State Security

OAuth state must protect against:

```text
CSRF
OAuth callback manipulation
Account injection

```

State must:

```text
Be random
Be temporary
Be validated
Expire
Be associated with the user
Be single-use

```

Do not trust callback parameters without validation.

---

# 16. social_accounts

The table stores account metadata.

Concept:

```text
social_accounts

id
user_id

provider
platform

platform_account_id

account_name
account_username
account_avatar_url

access_token_encrypted
refresh_token_encrypted

token_expires_at

created_at
updated_at

```

Tokens must remain encrypted.

---

# 17. Account Ownership

Every social account belongs to exactly one user.

```text
User A
   │
   ├── Instagram
   ├── Facebook Page
   └── TikTok

User B
   │
   └── Instagram

```

User A must never access User B's accounts.

Validation layers:

```text
Application Ownership Check
        +
Supabase RLS
        +
Server-side OAuth Validation

```

---

# 18. Token Encryption

Tokens must be encrypted before database storage.

Architecture:

```text
OAuth Token
      ↓
Encryption
      ↓
Encrypted Token
      ↓
Database

```

When publishing:

```text
Database
      ↓
Encrypted Token
      ↓
Decrypt Server Side
      ↓
Provider API

```

Never decrypt tokens in:

```text
Frontend
Browser
Queue
Logs

```

---

# 19. Token Expiration

Providers may expire tokens.

Before publishing:

```text
Get social account
        ↓
Check token expiration
        ↓

Valid?
   │
   ├── YES
   │     ↓
   │   Publish
   │
   └── NO
         ↓
      Refresh Token
         ↓
      Update encrypted token
         ↓
      Publish

```

If refresh fails:

```text
Platform → failed

Account → reconnect required

```

Other platforms must continue.

---

# 20. Disconnect Account

User can disconnect a social account.

Flow:

```text
Connected Account
       ↓
Click Disconnect
       ↓
Ownership Validation
       ↓
Delete / revoke credentials
       ↓
Remove Account

```

After disconnect:

```text
Existing scheduled posts
        ↓
Worker checks account
        ↓
Account missing
        ↓
Platform execution failed

```

Do not silently publish using stale credentials.

---

# 21. Instagram OAuth Testing

Test:

### Test 1

```text
Click Connect Instagram

```

Expected:

```text
Redirect to Meta OAuth

```

---

### Test 2

Login to Meta.

Expected:

```text
Meta authentication works

```

---

### Test 3

Grant permissions.

Expected:

```text
Return to AutoPost

```

---

### Test 4

Check:

```text
Connected Accounts

```

Expected:

```text
Instagram
Connected
Account Name

```

---

# 22. Facebook OAuth Testing

Test:

```text
Connect Facebook

```

Expected:

```text
Meta OAuth
        ↓
Page Access
        ↓
Return
        ↓
Facebook Page Connected

```

Verify:

```text
Page ID
Page Name
Account Ownership

```

---

# 23. TikTok OAuth Testing

Test:

```text
Connect TikTok

```

Expected:

```text
TikTok OAuth
        ↓
Authorize
        ↓
Callback
        ↓
Account Connected

```

Verify:

```text
Account ID
Display Name
Token Stored Encrypted

```

---

# 24. Database Verification

After connecting an account:

Check:

```text
social_accounts

```

Verify:

```text
Correct user_id          PASS
Correct provider         PASS
Correct account ID       PASS
Account metadata         PASS
Token encrypted          PASS
No plaintext token       PASS

```

---

# 25. Security Testing

Verify:

### User A

Connect Instagram.

### User B

Try to access User A account.

Expected:

```text
Not accessible

```

Verify:

```text
RLS
Ownership
API
UI

```

---

# 26. Duplicate Account Prevention

A social account should not accidentally create duplicates.

Example:

```text
Instagram Account X

```

Connect:

```text
First time

```

Expected:

```text
1 account

```

Reconnect:

Expected behavior must follow existing application architecture:

```text
Update existing account
OR
Reject duplicate

```

Never create unlimited duplicates.

---

# 27. OAuth Failure Handling

Handle:

```text
User cancels OAuth
Invalid state
Expired state
Invalid code
Token exchange failure
Provider API failure
Missing permissions
Unsupported account
Account already connected

```

The UI must show approved error copy from:

```text
Design.md

```

Do not expose:

```text
Provider secrets
Raw provider errors
Tokens
Internal stack traces

```

---

# 28. Development Mode

During local development:

```env
APP_URL=http://localhost:3000

```

OAuth redirect URLs must match exactly.

Do not use:

```text
localhost:3000
127.0.0.1:3000

```

interchangeably unless both are registered.

Choose one.

Recommended:

```text
http://localhost:3000

```

---

# 29. Production Mode

Before production:

Update:

```env
APP_URL=https://your-domain.com

```

Register production callbacks:

```text
https://your-domain.com/api/oauth/instagram/callback

https://your-domain.com/api/oauth/facebook/callback

https://your-domain.com/api/oauth/tiktok/callback

```

---

# 30. Implementation Order

Follow this exact order.

---

## PHASE 1

Environment verification.

Verify:

```text
APP_URL
META_CLIENT_ID
META_CLIENT_SECRET

```

Expected:

```text
Meta provider configured

```

---

## PHASE 2

Test Meta OAuth infrastructure.

Verify:

```text
OAuth start
OAuth state
Callback
Token exchange

```

---

## PHASE 3

Connect Facebook.

Verify:

```text
Page discovery
Page metadata
Database storage
Encryption

```

---

## PHASE 4

Connect Instagram.

Verify:

```text
Instagram discovery
Professional account validation
Database storage
Encryption

```

---

## PHASE 5

Disconnect testing.

Verify:

```text
Account removed
Ownership protected
Tokens unavailable

```

---

## PHASE 6

Configure TikTok credentials.

Verify:

```text
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET

```

---

## PHASE 7

TikTok OAuth.

Verify:

```text
OAuth
Callback
Token exchange
Account discovery
Storage

```

---

## PHASE 8

Cross-platform verification.

Connect:

```text
Instagram
Facebook
TikTok

```

Expected:

```text
All accounts visible

```

---

# 31. Create Post Integration

After accounts connect:

```text
Create Post
      ↓
Select Media
      ↓
Caption
      ↓
Select Platform Accounts
      ↓
Publish Now

```

Expected:

```text
Connected account available

```

The previous error:

```text
Connect an account to publish.

```

must no longer appear when a valid account is connected.

---

# 32. Publish Now Test

Test:

```text
Instagram
Facebook
TikTok

```

Flow:

```text
Create Post
      ↓
Select Platforms
      ↓
Publish Now
      ↓
Post Created
      ↓
Media Persisted
      ↓
Queue Job
      ↓
Worker
      ↓
Provider

```

---

# 33. Schedule Test

Test:

```text
Schedule post

```

Flow:

```text
Create Post
      ↓
Select Platform
      ↓
Set Date
      ↓
Set Time
      ↓
Timezone
      ↓
Convert to UTC
      ↓
Database
      ↓
BullMQ Delayed Job

```

---

# 34. Multi Platform Test

Test:

```text
Instagram
Facebook
TikTok

```

Expected:

```text
3 independent executions

```

Architecture:

```text
Post
 │
 ├── Instagram Execution
 │
 ├── Facebook Execution
 │
 └── TikTok Execution

```

---

# 35. Partial Failure Test

Critical scenario:

```text
Instagram → FAIL

Facebook → SUCCESS

TikTok → SUCCESS

```

Expected:

```text
Post

partial_failure

```

Platform status:

```text
Instagram

failed

```

```text
Facebook

success

```

```text
TikTok

success

```

---

# 36. Retry Test

User clicks:

```text
Retry Instagram

```

Expected:

```text
Instagram processed again

```

Must NOT:

```text
Repost Facebook
Repost TikTok

```

Architecture:

```text
Failed Platform
       ↓
New Execution
       ↓
New Queue Job
       ↓
Worker

```

---

# 37. Worker Token Test

Before publish:

```text
Worker
   ↓
Load social account
   ↓
Decrypt token
   ↓
Check expiration
   ↓
Refresh if needed
   ↓
Provider publish

```

Verify:

```text
Token never enters queue

```

---

# 38. Logging Security Test

Search logs.

Verify no logs contain:

```text
META_CLIENT_SECRET
TIKTOK_CLIENT_SECRET

access_token

refresh_token

encrypted token

```

Logging should contain only:

```text
postId
platformId
executionId
provider
status
safe error code

```

---

# 39. Required Validation

After implementation:

```bash
npm run typecheck

```

```bash
npm run lint

```

```bash
npm test

```

```bash
npm run test:integration

```

```bash
npm run build

```

All must pass.

---

# 40. Manual Test Checklist

## Authentication

- Signup
- Login
- Logout

## Meta

- Connect Facebook
- Connect Instagram
- Disconnect Facebook
- Disconnect Instagram

## TikTok

- Connect TikTok
- Disconnect TikTok

## Create Post

- Upload Image
- Upload Video
- Paste Image URL
- Paste Video URL

## Publishing

- Publish Now
- Schedule
- Cancel Scheduled Post
- Retry Failed Platform

## Worker

- Worker Execution
- Retry
- Crash Recovery
- Duplicate Prevention

---

# 41. Definition of Done

OAuth integration is complete only when:

```text
Instagram OAuth              PASS

Facebook OAuth               PASS

TikTok OAuth                 PASS

Tokens encrypted             PASS

Tokens hidden from frontend  PASS

Account ownership            PASS

RLS                          PASS

Disconnect                   PASS

Create Post account select   PASS

Publish Now                  PASS

Schedule                     PASS

Worker                       PASS

Retry                        PASS

Partial Failure              PASS

TypeScript                   PASS

Lint                         PASS

Unit Tests                   PASS

Integration Tests            PASS

Build                        PASS

```

---

# 42. Current Next Step

Start with:

# META OAUTH SETUP

Required first:

```text
Create Meta Developer App
        ↓
Configure Facebook Login
        ↓
Configure Instagram API
        ↓
Register localhost callbacks
        ↓
Get Client ID
        ↓
Get Client Secret
        ↓
Add to .env.local
        ↓
Restart Next.js
        ↓
Connect Facebook
        ↓
Connect Instagram

```

After Meta is working:

```text
TikTok OAuth

```

After all accounts connect:

```text
Real Publish Testing

```

---

# IMPORTANT RULE

Do not implement unnecessary features.

This project remains an MVP.

Primary goal:

> Upload content once → select platforms → publish now or schedule → automatically process → see results.

Priorities:

```text
Simple
↓
Fast
↓
Reliable
↓
Time Saving

```

