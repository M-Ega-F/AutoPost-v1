-- Phase 12A: workspace membership is the database boundary for app data.
-- This migration intentionally replaces the earlier user_id-only policies.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
-- social_accounts stays column-protected: access tokens never go to clients.
REVOKE ALL ON public.social_accounts FROM authenticated;
GRANT SELECT (
  id, user_id, workspace_id, platform, platform_account_id, username,
  display_name, avatar_url, token_expires_at, scopes, status,
  last_validated_at, last_error_code, last_error_message, metadata,
  created_at, updated_at
) ON public.social_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_platforms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_analytics_snapshots TO authenticated;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members FORCE ROW LEVEL SECURITY;

-- Remove every earlier user-only policy so policies cannot combine with OR and
-- accidentally expose another workspace owned by the same user.
DROP POLICY IF EXISTS social_accounts_select_own ON public.social_accounts;
DROP POLICY IF EXISTS social_accounts_insert_own ON public.social_accounts;
DROP POLICY IF EXISTS social_accounts_update_own ON public.social_accounts;
DROP POLICY IF EXISTS social_accounts_delete_own ON public.social_accounts;
DROP POLICY IF EXISTS posts_select_own ON public.posts;
DROP POLICY IF EXISTS posts_insert_own ON public.posts;
DROP POLICY IF EXISTS posts_update_own ON public.posts;
DROP POLICY IF EXISTS posts_delete_own ON public.posts;
DROP POLICY IF EXISTS post_media_select_own ON public.post_media;
DROP POLICY IF EXISTS post_media_insert_own ON public.post_media;
DROP POLICY IF EXISTS post_media_update_own ON public.post_media;
DROP POLICY IF EXISTS post_media_delete_own ON public.post_media;
DROP POLICY IF EXISTS post_platforms_select_own ON public.post_platforms;
DROP POLICY IF EXISTS post_platforms_insert_own ON public.post_platforms;
DROP POLICY IF EXISTS post_platforms_update_own ON public.post_platforms;
DROP POLICY IF EXISTS post_platforms_delete_own ON public.post_platforms;
DROP POLICY IF EXISTS post_executions_select_own ON public.post_executions;
DROP POLICY IF EXISTS post_executions_insert_own ON public.post_executions;
DROP POLICY IF EXISTS post_executions_update_own ON public.post_executions;
DROP POLICY IF EXISTS post_executions_delete_own ON public.post_executions;
DROP POLICY IF EXISTS content_templates_select_own ON public.content_templates;
DROP POLICY IF EXISTS content_templates_insert_own ON public.content_templates;
DROP POLICY IF EXISTS content_templates_update_own ON public.content_templates;
DROP POLICY IF EXISTS content_templates_delete_own ON public.content_templates;
DROP POLICY IF EXISTS media_assets_select_own ON public.media_assets;
DROP POLICY IF EXISTS media_assets_insert_own ON public.media_assets;
DROP POLICY IF EXISTS media_assets_update_own ON public.media_assets;
DROP POLICY IF EXISTS media_assets_delete_own ON public.media_assets;
DROP POLICY IF EXISTS post_analytics_snapshots_select_own ON public.post_analytics_snapshots;
DROP POLICY IF EXISTS post_analytics_snapshots_insert_own ON public.post_analytics_snapshots;
DROP POLICY IF EXISTS post_analytics_snapshots_update_own ON public.post_analytics_snapshots;
DROP POLICY IF EXISTS post_analytics_snapshots_delete_own ON public.post_analytics_snapshots;

CREATE POLICY workspaces_select_member ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
    )
  );

CREATE POLICY workspaces_insert_owner ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY workspaces_update_owner ON public.workspaces
  FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY workspaces_delete_owner ON public.workspaces
  FOR DELETE TO authenticated
  USING (owner_id = (select auth.uid()));

CREATE POLICY workspace_members_select_self ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY workspace_members_insert_owner ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_id = (select auth.uid())
    )
  );

CREATE POLICY workspace_members_update_self ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_id = (select auth.uid())
    )
  );

CREATE POLICY workspace_members_delete_self ON public.workspace_members
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Direct workspace-owned resources.
CREATE POLICY social_accounts_workspace_member ON public.social_accounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = social_accounts.workspace_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = social_accounts.workspace_id AND wm.user_id = (select auth.uid())));

CREATE POLICY posts_workspace_member ON public.posts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = posts.workspace_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = posts.workspace_id AND wm.user_id = (select auth.uid())));

CREATE POLICY content_templates_workspace_member ON public.content_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_templates.workspace_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = content_templates.workspace_id AND wm.user_id = (select auth.uid())));

CREATE POLICY media_assets_workspace_member ON public.media_assets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = media_assets.workspace_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = media_assets.workspace_id AND wm.user_id = (select auth.uid())));

-- Derived resources follow the post workspace. Platform writes also verify the
-- connected account belongs to that same workspace.
CREATE POLICY post_media_workspace_member ON public.post_media
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = post_media.post_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = post_media.post_id AND wm.user_id = (select auth.uid())));

CREATE POLICY post_platforms_workspace_member ON public.post_platforms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = post_platforms.post_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = post_platforms.post_id AND wm.user_id = (select auth.uid()))
    AND EXISTS (SELECT 1 FROM public.posts p JOIN public.social_accounts sa ON sa.workspace_id = p.workspace_id WHERE p.id = post_platforms.post_id AND sa.id = post_platforms.social_account_id)
  );

CREATE POLICY post_executions_workspace_member ON public.post_executions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.post_platforms pp JOIN public.posts p ON p.id = pp.post_id JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE pp.id = post_executions.post_platform_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.post_platforms pp JOIN public.posts p ON p.id = pp.post_id JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE pp.id = post_executions.post_platform_id AND wm.user_id = (select auth.uid())));

CREATE POLICY post_analytics_snapshots_workspace_member ON public.post_analytics_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = post_analytics_snapshots.post_id AND wm.user_id = (select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.posts p JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id WHERE p.id = post_analytics_snapshots.post_id AND wm.user_id = (select auth.uid())));

-- user_preferences remains user-specific; its active_workspace_id is only a
-- pointer and all server-side callers verify membership before using it.
DROP POLICY IF EXISTS user_preferences_select_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_insert_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_update_own ON public.user_preferences;
DROP POLICY IF EXISTS user_preferences_delete_own ON public.user_preferences;

CREATE POLICY user_preferences_select_own ON public.user_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY user_preferences_insert_own ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND (active_workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = user_preferences.active_workspace_id
        AND wm.user_id = (select auth.uid())
    ))
  );

CREATE POLICY user_preferences_update_own ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND (active_workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = user_preferences.active_workspace_id
        AND wm.user_id = (select auth.uid())
    ))
  );

CREATE POLICY user_preferences_delete_own ON public.user_preferences
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
