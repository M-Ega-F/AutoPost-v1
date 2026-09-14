-- Phase 16A: review history is workspace-scoped audit data.
REVOKE ALL ON public.post_review_events FROM anon, authenticated;

ALTER TABLE public.post_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_review_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_review_events_workspace_member ON public.post_review_events;
CREATE POLICY post_review_events_workspace_member ON public.post_review_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = post_review_events.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = post_review_events.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );
