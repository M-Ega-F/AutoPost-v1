-- Phase 16C: review collaboration and automation records stay workspace scoped.
REVOKE ALL ON public.post_review_comment_mentions, public.post_review_automation_events FROM anon, authenticated;

ALTER TABLE public.post_review_comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_review_comment_mentions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_review_comment_mentions_workspace_member ON public.post_review_comment_mentions;
CREATE POLICY post_review_comment_mentions_workspace_member ON public.post_review_comment_mentions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = post_review_comment_mentions.workspace_id
      AND wm.user_id = (select auth.uid())
  ) AND EXISTS (
    SELECT 1 FROM public.post_review_comments c
    WHERE c.id = post_review_comment_mentions.comment_id
      AND c.workspace_id = post_review_comment_mentions.workspace_id
  ) AND EXISTS (
    SELECT 1 FROM public.workspace_members mentioned
    WHERE mentioned.workspace_id = post_review_comment_mentions.workspace_id
      AND mentioned.user_id = post_review_comment_mentions.mentioned_user_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = post_review_comment_mentions.workspace_id
      AND wm.user_id = (select auth.uid())
  ) AND EXISTS (
    SELECT 1 FROM public.post_review_comments c
    WHERE c.id = post_review_comment_mentions.comment_id
      AND c.workspace_id = post_review_comment_mentions.workspace_id
  ) AND EXISTS (
    SELECT 1 FROM public.workspace_members mentioned
    WHERE mentioned.workspace_id = post_review_comment_mentions.workspace_id
      AND mentioned.user_id = post_review_comment_mentions.mentioned_user_id
  ));

ALTER TABLE public.post_review_automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_review_automation_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_review_automation_events_workspace_member ON public.post_review_automation_events;
CREATE POLICY post_review_automation_events_workspace_member ON public.post_review_automation_events
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = post_review_automation_events.workspace_id
      AND wm.user_id = (select auth.uid())
  ) AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_review_automation_events.post_id
      AND p.workspace_id = post_review_automation_events.workspace_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = post_review_automation_events.workspace_id
      AND wm.user_id = (select auth.uid())
  ) AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_review_automation_events.post_id
      AND p.workspace_id = post_review_automation_events.workspace_id
  ));
