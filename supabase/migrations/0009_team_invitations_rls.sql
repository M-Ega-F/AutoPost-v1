-- Phase 12C: invitations are server-only capabilities.
--
-- The invitation table contains target email addresses and token hashes. It
-- must not be queryable through the Supabase Data API, even by workspace
-- members. The server domain layer performs the authorized, filtered reads.
REVOKE ALL ON public.workspace_invitations FROM anon, authenticated;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations FORCE ROW LEVEL SECURITY;

-- Keep member reads restricted to each user's own membership at the Data API
-- boundary. Team member lists are returned by the server API after the
-- centralized members:view check.
