-- =====================================================================
-- 0001_rls_policies.sql
-- Row Level Security layer for AutoPost MVP
--
-- Idempotent: every policy is dropped before it is created, and every
-- ALTER TABLE is unconditional. Safe to re-run.
--
-- Ownership model
--   Direct ownership : social_accounts.user_id, posts.user_id
--   Derived ownership: post_media      -> posts
--                      post_platforms -> posts
--                      post_executions-> post_platforms -> posts
--
-- Notes
--   * auth.uid() is always wrapped in (select auth.uid()) so Postgres
--     caches it as an InitPlan instead of evaluating it per row.
--   * Every policy is scoped TO authenticated. The backend worker uses
--     the Supabase service_role key, which bypasses RLS and therefore
--     needs no policies.
--   * UPDATE policies carry both USING and WITH CHECK so a row cannot
--     be re-pointed at another user.
--   * post_platforms additionally verifies social_accounts ownership on
--     INSERT/UPDATE: foreign key checks bypass RLS, so without that
--     extra check an authenticated user could attach another user's
--     social account to their own post and make the service_role worker
--     publish to the victim's account.
-- =====================================================================


-- =====================================================================
-- 1. PRIVILEGES
-- =====================================================================

-- anon must have nothing at all in the public schema.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- authenticated gets exactly the DML it needs, nothing more.
-- (No TRUNCATE, no REFERENCES, no TRIGGER, no DDL.)
--
-- social_accounts is deliberately absent here: it gets NO table-level
-- grant, only a column-level SELECT grant in section 8, so that the
-- token columns are never reachable by a client. Granting at table
-- level first would make the token columns unprotected (see section 8).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_platforms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_executions TO authenticated;


-- =====================================================================
-- 2. ENABLE + FORCE RLS
-- FORCE matters: without it the table owner bypasses RLS.
-- =====================================================================

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media FORCE ROW LEVEL SECURITY;

ALTER TABLE public.post_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_platforms FORCE ROW LEVEL SECURITY;

ALTER TABLE public.post_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_executions FORCE ROW LEVEL SECURITY;


-- =====================================================================
-- 3. POLICIES — social_accounts (direct ownership)
-- =====================================================================

DROP POLICY IF EXISTS social_accounts_select_own ON public.social_accounts;
CREATE POLICY social_accounts_select_own ON public.social_accounts
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS social_accounts_insert_own ON public.social_accounts;
CREATE POLICY social_accounts_insert_own ON public.social_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS social_accounts_update_own ON public.social_accounts;
CREATE POLICY social_accounts_update_own ON public.social_accounts
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS social_accounts_delete_own ON public.social_accounts;
CREATE POLICY social_accounts_delete_own ON public.social_accounts
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));


-- =====================================================================
-- 4. POLICIES — posts (direct ownership)
-- =====================================================================

DROP POLICY IF EXISTS posts_select_own ON public.posts;
CREATE POLICY posts_select_own ON public.posts
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS posts_insert_own ON public.posts;
CREATE POLICY posts_insert_own ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS posts_update_own ON public.posts;
CREATE POLICY posts_update_own ON public.posts
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS posts_delete_own ON public.posts;
CREATE POLICY posts_delete_own ON public.posts
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));


-- =====================================================================
-- 5. POLICIES — post_media (ownership via post_media.post_id -> posts.id)
-- Index-backed: post_media_post_id_index.
-- =====================================================================

DROP POLICY IF EXISTS post_media_select_own ON public.post_media;
CREATE POLICY post_media_select_own ON public.post_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_media.post_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_media_insert_own ON public.post_media;
CREATE POLICY post_media_insert_own ON public.post_media
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_media.post_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_media_update_own ON public.post_media;
CREATE POLICY post_media_update_own ON public.post_media
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_media.post_id
        AND p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_media.post_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_media_delete_own ON public.post_media;
CREATE POLICY post_media_delete_own ON public.post_media
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_media.post_id
        AND p.user_id = (select auth.uid())
    )
  );


-- =====================================================================
-- 6. POLICIES — post_platforms (ownership via post_platforms.post_id -> posts.id)
-- Index-backed: post_platforms_post_id_index and social_accounts PK.
--
-- SELECT / DELETE only follow the post chain.
-- INSERT / UPDATE ALSO require that social_account_id belongs to the
-- caller. Foreign key checks bypass RLS, so the post-chain check alone
-- would let an authenticated user attach another user's social account
-- to their own post and have the service_role worker publish to the
-- victim's account.
-- =====================================================================

DROP POLICY IF EXISTS post_platforms_select_own ON public.post_platforms;
CREATE POLICY post_platforms_select_own ON public.post_platforms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_platforms.post_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_platforms_insert_own ON public.post_platforms;
CREATE POLICY post_platforms_insert_own ON public.post_platforms
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_platforms.post_id
        AND p.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM public.social_accounts sa
      WHERE sa.id = post_platforms.social_account_id
        AND sa.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_platforms_update_own ON public.post_platforms;
CREATE POLICY post_platforms_update_own ON public.post_platforms
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_platforms.post_id
        AND p.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM public.social_accounts sa
      WHERE sa.id = post_platforms.social_account_id
        AND sa.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_platforms.post_id
        AND p.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM public.social_accounts sa
      WHERE sa.id = post_platforms.social_account_id
        AND sa.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_platforms_delete_own ON public.post_platforms;
CREATE POLICY post_platforms_delete_own ON public.post_platforms
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_platforms.post_id
        AND p.user_id = (select auth.uid())
    )
  );


-- =====================================================================
-- 7. POLICIES — post_executions
-- Ownership walks up two levels:
--   post_executions.post_platform_id -> post_platforms.id -> post_platforms.post_id -> posts.id
-- Index-backed: post_executions_post_platform_id_index and post_platforms (PK).
-- =====================================================================

DROP POLICY IF EXISTS post_executions_select_own ON public.post_executions;
CREATE POLICY post_executions_select_own ON public.post_executions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.post_platforms pp
      JOIN public.posts p ON p.id = pp.post_id
      WHERE pp.id = post_executions.post_platform_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_executions_insert_own ON public.post_executions;
CREATE POLICY post_executions_insert_own ON public.post_executions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.post_platforms pp
      JOIN public.posts p ON p.id = pp.post_id
      WHERE pp.id = post_executions.post_platform_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_executions_update_own ON public.post_executions;
CREATE POLICY post_executions_update_own ON public.post_executions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.post_platforms pp
      JOIN public.posts p ON p.id = pp.post_id
      WHERE pp.id = post_executions.post_platform_id
        AND p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.post_platforms pp
      JOIN public.posts p ON p.id = pp.post_id
      WHERE pp.id = post_executions.post_platform_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS post_executions_delete_own ON public.post_executions;
CREATE POLICY post_executions_delete_own ON public.post_executions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.post_platforms pp
      JOIN public.posts p ON p.id = pp.post_id
      WHERE pp.id = post_executions.post_platform_id
        AND p.user_id = (select auth.uid())
    )
  );


-- =====================================================================
-- 8. TOKEN COLUMN PROTECTION (must stay last)
--
-- SECURITY CRITICAL (plan 7: "Frontend tidak boleh menerima token").
--
-- Why a column-level GRANT and NOT a column-level REVOKE:
-- A column privilege is effective if it is held on that column OR on
-- its whole table, so a column-level REVOKE cannot subtract anything
-- from a table-level grant. Measured on the live Supabase database:
-- after
--   REVOKE SELECT, UPDATE (encrypted_access_token,
--     encrypted_refresh_token) ON public.social_accounts
--     FROM authenticated;
-- the relacl entry for authenticated went from arwdDxtm to awdDxtm —
-- SELECT (r) was stripped from the WHOLE TABLE rather than from two
-- columns, UPDATE (w) was left intact, and pg_attribute.attacl stayed
-- NULL for every column (no column ACL was materialised). The client
-- could not read connected accounts at all.
--
-- So we do the opposite: REVOKE ALL at table level, then GRANT SELECT
-- on the non-token columns only. The column-level GRANT materialises
-- pg_attribute.attacl for exactly the granted columns, so
-- encrypted_access_token and encrypted_refresh_token are never
-- granted and stay unreadable and unwritable for authenticated.
--
-- Consequence: authenticated has SELECT on social_accounts and nothing
-- else. INSERT/UPDATE/DELETE on social_accounts therefore go
-- exclusively through the backend worker using the Supabase
-- service_role key, which bypasses RLS and keeps the full arwdDxtm
-- grant. The social_accounts INSERT / UPDATE / DELETE policies in
-- section 3 are INERT for authenticated today — they are kept only for
-- future use, should client-side writes ever be granted.
--
-- Client queries MUST list columns explicitly. select * (and TABLE
-- social_accounts) still fails here with
--   ERROR: permission denied for table social_accounts
-- because * expands to every column, including the two token columns
-- the role has no privilege on. It does NOT silently omit them.
-- =====================================================================

REVOKE ALL ON public.social_accounts FROM authenticated;

GRANT SELECT (
  id,
  user_id,
  platform,
  platform_account_id,
  username,
  display_name,
  avatar_url,
  token_expires_at,
  scopes,
  status,
  last_validated_at,
  last_error_code,
  last_error_message,
  metadata,
  created_at,
  updated_at
) ON public.social_accounts TO authenticated;
