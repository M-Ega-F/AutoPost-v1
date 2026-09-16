-- Phase 17H: workspace isolation for historical experiment learning.
-- Apply through the reviewed Supabase migration workflow; the local Supabase
-- CLI is not installed in this workspace, so this file remains pending review.
revoke all on table public.experiment_learnings from anon, authenticated;

alter table public.experiment_learnings enable row level security;
alter table public.experiment_learnings force row level security;

create policy "experiment learnings workspace members" on public.experiment_learnings
  for all to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_learnings.workspace_id and wm.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_learnings.workspace_id and wm.user_id = (select auth.uid())));
