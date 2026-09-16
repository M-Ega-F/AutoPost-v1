-- Phase 17C: campaign automation registry is workspace-scoped defense in depth.
REVOKE ALL ON public.campaign_automation_events FROM anon, authenticated;

ALTER TABLE public.campaign_automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_automation_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_automation_events_workspace_member ON public.campaign_automation_events;
CREATE POLICY campaign_automation_events_workspace_member ON public.campaign_automation_events
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaign_automation_events.workspace_id
      AND wm.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaign_automation_events.workspace_id
      AND wm.user_id = (select auth.uid())
  ));
