-- Content templates are reusable user-owned content, never publishable rows.
-- The backend still applies user_id predicates because it uses service_role.

REVOKE ALL ON public.content_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_templates TO authenticated;

ALTER TABLE public.content_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_templates_select_own ON public.content_templates;
CREATE POLICY content_templates_select_own ON public.content_templates
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS content_templates_insert_own ON public.content_templates;
CREATE POLICY content_templates_insert_own ON public.content_templates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS content_templates_update_own ON public.content_templates;
CREATE POLICY content_templates_update_own ON public.content_templates
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS content_templates_delete_own ON public.content_templates;
CREATE POLICY content_templates_delete_own ON public.content_templates
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
