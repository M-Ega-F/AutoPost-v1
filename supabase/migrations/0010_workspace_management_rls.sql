-- Phase 12D: workspace metadata is editable by owners and admins only.
--
-- Workspace lifecycle operations (creation, transfer, leave and deletion)
-- remain server-domain operations. The Data API may only update safe metadata
-- columns and may never change ownership.

REVOKE UPDATE ON public.workspaces FROM authenticated;
GRANT UPDATE (name, slug, description, avatar_url, timezone)
  ON public.workspaces TO authenticated;

DROP POLICY IF EXISTS workspaces_update_owner ON public.workspaces;

CREATE POLICY workspaces_update_manager ON public.workspaces
  FOR UPDATE TO authenticated
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
        AND wm.role IN ('owner', 'admin')
    )
  );
