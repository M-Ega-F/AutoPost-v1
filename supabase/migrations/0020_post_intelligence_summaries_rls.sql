-- Phase 17F: derived post intelligence is workspace-scoped defense in depth.
REVOKE ALL ON public.post_intelligence_summaries FROM anon, authenticated;

ALTER TABLE public.post_intelligence_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_intelligence_summaries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_intelligence_summaries_workspace_member ON public.post_intelligence_summaries;
CREATE POLICY post_intelligence_summaries_workspace_member ON public.post_intelligence_summaries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = post_intelligence_summaries.workspace_id
      AND wm.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = post_intelligence_summaries.workspace_id
      AND wm.user_id = (select auth.uid())
  ));
