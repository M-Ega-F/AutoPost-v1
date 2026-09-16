-- Phase 17G: workspace isolation for optimization actions and experiments.
-- Apply through the reviewed Supabase migration workflow. The application also
-- scopes every query by workspace and verifies campaign ownership.
revoke all on table public.campaign_optimization_actions from anon, authenticated;
revoke all on table public.experiments from anon, authenticated;
revoke all on table public.experiment_variants from anon, authenticated;
revoke all on table public.experiment_result_snapshots from anon, authenticated;

alter table public.campaign_optimization_actions enable row level security;
alter table public.campaign_optimization_actions force row level security;
alter table public.experiments enable row level security;
alter table public.experiments force row level security;
alter table public.experiment_variants enable row level security;
alter table public.experiment_variants force row level security;
alter table public.experiment_result_snapshots enable row level security;
alter table public.experiment_result_snapshots force row level security;

create policy "optimization actions workspace members" on public.campaign_optimization_actions
  for all to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = campaign_optimization_actions.workspace_id and wm.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = campaign_optimization_actions.workspace_id and wm.user_id = (select auth.uid())));

create policy "experiments workspace members" on public.experiments
  for all to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiments.workspace_id and wm.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiments.workspace_id and wm.user_id = (select auth.uid())));

create policy "experiment variants workspace members" on public.experiment_variants
  for all to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_variants.workspace_id and wm.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_variants.workspace_id and wm.user_id = (select auth.uid())));

create policy "experiment results workspace members" on public.experiment_result_snapshots
  for all to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_result_snapshots.workspace_id and wm.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_result_snapshots.workspace_id and wm.user_id = (select auth.uid())));
