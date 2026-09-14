-- Phase 13: notifications are recipient-owned and workspace-scoped.
-- Creation is server-domain-only; clients may read and mutate only their own
-- notifications in a workspace where they are still an active member.

REVOKE ALL ON public.notifications FROM anon;
REVOKE INSERT, REFERENCES, TRIGGER, TRUNCATE ON public.notifications FROM authenticated;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_recipient ON public.notifications;
CREATE POLICY notifications_select_recipient ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = notifications.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS notifications_update_recipient ON public.notifications;
CREATE POLICY notifications_update_recipient ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = notifications.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    recipient_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = notifications.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS notifications_delete_recipient ON public.notifications;
CREATE POLICY notifications_delete_recipient ON public.notifications
  FOR DELETE TO authenticated
  USING (
    recipient_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = notifications.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );
