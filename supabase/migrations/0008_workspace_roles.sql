-- Phase 12B: expand roles while keeping membership mutations closed until the
-- owner-protected member-management workflow exists.
ALTER TYPE public.workspace_member_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.workspace_member_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.workspace_member_role ADD VALUE IF NOT EXISTS 'viewer';

-- There is no role/member mutation API in this phase. Removing direct
-- authenticated UPDATE/DELETE access prevents an owner from accidentally
-- removing the last owner through a raw client call.
REVOKE UPDATE, DELETE ON public.workspace_members FROM authenticated;
DROP POLICY IF EXISTS workspace_members_update_self ON public.workspace_members;
DROP POLICY IF EXISTS workspace_members_delete_self ON public.workspace_members;
