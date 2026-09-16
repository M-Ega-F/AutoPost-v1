-- Phase 17B: campaign activity is visible only to members of its workspace.
-- Campaign planning fields remain covered by the Phase 17A campaigns policy.
REVOKE ALL ON public.campaign_activity FROM anon, authenticated;

ALTER TABLE public.campaign_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_activity FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_activity_workspace_member ON public.campaign_activity;
CREATE POLICY campaign_activity_workspace_member ON public.campaign_activity
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaign_activity.workspace_id
      AND wm.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaign_activity.workspace_id
      AND wm.user_id = (select auth.uid())
  ));
