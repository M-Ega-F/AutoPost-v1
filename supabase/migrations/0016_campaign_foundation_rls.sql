-- Phase 17A: campaigns are visible only inside a workspace the caller belongs to.
-- Server-side domain authorization remains authoritative for role-sensitive writes.
REVOKE ALL ON public.campaigns FROM anon, authenticated;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_workspace_member ON public.campaigns;
CREATE POLICY campaigns_workspace_member ON public.campaigns
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaigns.workspace_id
      AND wm.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = campaigns.workspace_id
      AND wm.user_id = (select auth.uid())
  ));
