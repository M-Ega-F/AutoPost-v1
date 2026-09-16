-- Phase 17E: historical campaign intelligence is workspace-scoped defense in depth.
REVOKE ALL ON public.campaign_intelligence_snapshots FROM anon, authenticated;

ALTER TABLE public.campaign_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_intelligence_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_intelligence_snapshots_workspace_member ON public.campaign_intelligence_snapshots;
CREATE POLICY campaign_intelligence_snapshots_workspace_member ON public.campaign_intelligence_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaign_intelligence_snapshots.workspace_id
      AND wm.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaign_intelligence_snapshots.workspace_id
      AND wm.user_id = (select auth.uid())
  ));
