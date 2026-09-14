-- Media library assets are private user-owned metadata. Storage objects remain
-- private and are accessed through short-lived signed URLs from the server.

REVOKE ALL ON public.media_assets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_assets_select_own ON public.media_assets;
CREATE POLICY media_assets_select_own ON public.media_assets
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS media_assets_insert_own ON public.media_assets;
CREATE POLICY media_assets_insert_own ON public.media_assets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS media_assets_update_own ON public.media_assets;
CREATE POLICY media_assets_update_own ON public.media_assets
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS media_assets_delete_own ON public.media_assets;
CREATE POLICY media_assets_delete_own ON public.media_assets
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
