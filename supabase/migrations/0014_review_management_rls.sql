-- Phase 16B: review comments are workspace-scoped collaboration data.
-- The application uses its server-side authorization layer for writes; this
-- policy is defense in depth for Supabase roles.
REVOKE ALL ON public.post_review_comments FROM anon, authenticated;

ALTER TABLE public.post_review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_review_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_review_comments_workspace_member ON public.post_review_comments;
CREATE POLICY post_review_comments_workspace_member ON public.post_review_comments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = post_review_comments.workspace_id
        AND wm.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_review_comments.post_id
        AND p.workspace_id = post_review_comments.workspace_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = post_review_comments.workspace_id
        AND wm.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_review_comments.post_id
        AND p.workspace_id = post_review_comments.workspace_id
    )
  );
