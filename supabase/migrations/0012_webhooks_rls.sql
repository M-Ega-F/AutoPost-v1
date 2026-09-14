-- Phase 15: webhook configuration and delivery history are server-domain data.
-- The application uses a privileged database connection after checking the
-- signed-in user's workspace permission. Keep the Supabase client roles from
-- reading encrypted secrets or delivery payloads directly.

REVOKE ALL ON public.webhooks FROM anon, authenticated;
REVOKE ALL ON public.webhook_deliveries FROM anon, authenticated;

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhooks_workspace_member ON public.webhooks;
CREATE POLICY webhooks_workspace_member ON public.webhooks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = webhooks.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = webhooks.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS webhook_deliveries_workspace_member ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_workspace_member ON public.webhook_deliveries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = webhook_deliveries.workspace_id
        AND wm.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.webhooks w
      WHERE w.id = webhook_deliveries.webhook_id
        AND w.workspace_id = webhook_deliveries.workspace_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = webhook_deliveries.workspace_id
        AND wm.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.webhooks w
      WHERE w.id = webhook_deliveries.webhook_id
        AND w.workspace_id = webhook_deliveries.workspace_id
    )
  );
