-- RoadShield AI — row level security policies

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.ai_detections enable row level security;
alter table public.hazards enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.task_updates enable row level security;
alter table public.hazard_images enable row level security;
alter table public.hazard_confirmations enable row level security;
alter table public.status_history enable row level security;
alter table public.notifications enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.saved_locations enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- roles
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- hazards: verified/active/resolved are public to signed-in users; reporters see their own; staff see all
create policy hazards_select on public.hazards for select to authenticated
  using (
    status in ('verified', 'assigned', 'in_progress', 'resolved')
    or reporter_id = (select auth.uid())
    or (select public.is_staff())
  );

create policy ai_detections_select on public.ai_detections for select to authenticated
  using (requested_by = (select auth.uid()) or (select public.is_staff()));

create policy hazard_images_select on public.hazard_images for select to authenticated
  using (
    (select public.is_staff())
    or uploader_id = (select auth.uid())
    or (
      privacy_approved
      and kind in ('report', 'additional')
      and exists (
        select 1 from public.hazards h
        where h.id = hazard_id and h.status in ('verified', 'assigned', 'in_progress', 'resolved')
      )
    )
  );

create policy confirmations_select on public.hazard_confirmations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy status_history_select on public.status_history for select to authenticated
  using (exists (select 1 from public.hazards h where h.id = hazard_id));

create policy tasks_select on public.maintenance_tasks for select to authenticated
  using (assigned_to = (select auth.uid()) or (select public.is_admin()));

create policy task_updates_select on public.task_updates for select to authenticated
  using (exists (select 1 from public.maintenance_tasks t where t.id = task_id));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy push_tokens_select on public.device_push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_tokens_delete on public.device_push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

create policy saved_locations_select on public.saved_locations for select to authenticated
  using (user_id = (select auth.uid()));
create policy saved_locations_insert on public.saved_locations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy saved_locations_update on public.saved_locations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_locations_delete on public.saved_locations for delete to authenticated
  using (user_id = (select auth.uid()));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select public.is_admin()));
