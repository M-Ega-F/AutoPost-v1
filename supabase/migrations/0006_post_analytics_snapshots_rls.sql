-- Analytics snapshots are append-only, user-owned records. Provider failures
-- are stored as safe status values; they never mutate the post lifecycle.

REVOKE ALL ON public.post_analytics_snapshots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_analytics_snapshots TO authenticated;

ALTER TABLE public.post_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_analytics_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_analytics_snapshots_select_own ON public.post_analytics_snapshots;
CREATE POLICY post_analytics_snapshots_select_own ON public.post_analytics_snapshots
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS post_analytics_snapshots_insert_own ON public.post_analytics_snapshots;
CREATE POLICY post_analytics_snapshots_insert_own ON public.post_analytics_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS post_analytics_snapshots_update_own ON public.post_analytics_snapshots;
CREATE POLICY post_analytics_snapshots_update_own ON public.post_analytics_snapshots
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS post_analytics_snapshots_delete_own ON public.post_analytics_snapshots;
CREATE POLICY post_analytics_snapshots_delete_own ON public.post_analytics_snapshots
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
