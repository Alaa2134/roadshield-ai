-- RoadShield AI — moderation, maintenance and administration RPCs.
-- Every function re-checks the caller's role server-side; the mobile UI is never trusted.

-- ---------------------------------------------------------------- moderation (admin)
create or replace function public.transition_hazard(
  p_hazard_id uuid,
  p_to public.report_status,
  p_note text default null,
  p_duplicate_of uuid default null,
  p_approve_images boolean default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_h public.hazards;
  v_task record;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select * into v_h from public.hazards where id = p_hazard_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_to in ('assigned', 'in_progress', 'reopened') then
    raise exception 'USE_DEDICATED_ACTION' using errcode = 'P0001';
  end if;
  if not app_private.can_transition(v_h.status, p_to) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001',
      detail = v_h.status::text || ' -> ' || p_to::text;
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'note';
  end if;
  if p_to = 'duplicate' then
    if p_duplicate_of is null or p_duplicate_of = p_hazard_id
       or not exists (select 1 from public.hazards d where d.id = p_duplicate_of) then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'duplicate_of';
    end if;
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);

  update public.hazards
  set status = p_to,
      reviewed_by = v_uid,
      verified_at = case when p_to = 'verified' then coalesce(verified_at, now()) else verified_at end,
      resolved_at = case when p_to = 'resolved' then now() else null end,
      duplicate_of = case when p_to = 'duplicate' then p_duplicate_of else duplicate_of end
  where id = p_hazard_id;

  -- keep maintenance tasks consistent with the report state
  for v_task in
    select t.id from public.maintenance_tasks t
    where t.hazard_id = p_hazard_id and t.status in ('assigned', 'in_progress', 'completion_requested')
  loop
    if p_to = 'resolved' then
      update public.maintenance_tasks set status = 'completed', completed_at = now() where id = v_task.id;
      insert into public.task_updates (task_id, author_id, status, note)
      values (v_task.id, v_uid, 'completed', coalesce(p_note, 'Resolved by administrator'));
    elsif p_to in ('verified', 'rejected', 'duplicate') then
      update public.maintenance_tasks set status = 'cancelled' where id = v_task.id;
      insert into public.task_updates (task_id, author_id, status, note)
      values (v_task.id, v_uid, 'cancelled', coalesce(p_note, 'Cancelled by administrator'));
    end if;
  end loop;

  if p_approve_images is not null then
    update public.hazard_images
    set privacy_approved = p_approve_images
    where hazard_id = p_hazard_id and kind in ('report', 'additional');
  end if;

  perform app_private.audit('hazard.transition', 'hazard', p_hazard_id::text,
    jsonb_build_object('from', v_h.status, 'to', p_to, 'note', p_note,
                       'duplicate_of', p_duplicate_of, 'approve_images', p_approve_images));

  return jsonb_build_object('id', p_hazard_id, 'from', v_h.status, 'status', p_to);
end;
$$;

create or replace function public.set_image_privacy(p_image_id uuid, p_approved boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  update public.hazard_images set privacy_approved = coalesce(p_approved, false) where id = p_image_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform app_private.audit('image.privacy', 'hazard_image', p_image_id::text,
                            jsonb_build_object('approved', p_approved));
end;
$$;

create or replace function public.set_traffic_exposure(p_hazard_id uuid, p_level smallint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_level is not null and p_level not between 1 and 5 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'level';
  end if;
  update public.hazards set traffic_exposure = p_level where id = p_hazard_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform app_private.audit('hazard.traffic_exposure', 'hazard', p_hazard_id::text,
                            jsonb_build_object('level', p_level));
end;
$$;

-- ---------------------------------------------------------------- maintenance
-- Admins assign to any officer; officers can claim (self-assign) verified hazards.
create or replace function public.assign_hazard(
  p_hazard_id uuid,
  p_officer_id uuid default null,
  p_due_date date default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid := coalesce(p_officer_id, auth.uid());
  v_is_admin boolean := public.is_admin();
  v_h public.hazards;
  v_old record;
  v_task_id uuid;
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if not v_is_admin and v_target <> v_uid then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.user_roles r
    where r.user_id = v_target and r.role in ('maintenance_officer', 'admin')
  ) then
    raise exception 'INVALID_ASSIGNEE' using errcode = 'P0001';
  end if;
  if p_due_date is not null and p_due_date < current_date then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'due_date';
  end if;

  select * into v_h from public.hazards where id = p_hazard_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_h.status not in ('verified', 'reopened', 'assigned', 'in_progress') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  for v_old in
    select t.id, t.assigned_to from public.maintenance_tasks t
    where t.hazard_id = p_hazard_id and t.status in ('assigned', 'in_progress', 'completion_requested')
  loop
    if not v_is_admin then
      raise exception 'ALREADY_ASSIGNED' using errcode = 'P0001';
    end if;
    update public.maintenance_tasks set status = 'cancelled' where id = v_old.id;
    insert into public.task_updates (task_id, author_id, status, note)
    values (v_old.id, v_uid, 'cancelled', 'Reassigned');
  end loop;

  insert into public.maintenance_tasks (hazard_id, assigned_to, assigned_by, due_date)
  values (p_hazard_id, v_target, v_uid, p_due_date)
  returning id into v_task_id;

  insert into public.task_updates (task_id, author_id, status, note)
  values (v_task_id, v_uid, 'assigned', null);

  if v_h.status <> 'assigned' then
    perform set_config('app.status_note', '', true);
    update public.hazards set status = 'assigned' where id = p_hazard_id;
  end if;

  if v_target <> v_uid then
    perform app_private.notify(
      v_target, 'maintenance_progress',
      'New maintenance task',
      v_h.public_code || ': ' || app_private.category_label(v_h.category, 'en') || ' assigned to you.',
      'مهمة صيانة جديدة',
      v_h.public_code || ': تم إسناد ' || app_private.category_label(v_h.category, 'ar') || ' إليك.',
      jsonb_build_object('hazard_id', p_hazard_id, 'task_id', v_task_id, 'public_code', v_h.public_code)
    );
  end if;

  perform app_private.audit('task.assign', 'maintenance_task', v_task_id::text,
    jsonb_build_object('hazard_id', p_hazard_id, 'assigned_to', v_target, 'due_date', p_due_date));

  return jsonb_build_object('task_id', v_task_id, 'hazard_id', p_hazard_id, 'assigned_to', v_target);
end;
$$;

create or replace function public.update_task(
  p_task_id uuid,
  p_status public.task_status default null,
  p_note text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_t public.maintenance_tasks;
  v_h public.hazards;
  v_ok boolean := false;
  v_admin record;
begin
  select * into v_t from public.maintenance_tasks where id = p_task_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not (v_is_admin or v_t.assigned_to = v_uid) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if v_t.status in ('completed', 'cancelled') then
    raise exception 'TASK_CLOSED' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'note';
  end if;
  if (p_status is null or p_status = v_t.status) and coalesce(btrim(p_note), '') = '' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'empty_update';
  end if;

  select * into v_h from public.hazards where id = v_t.hazard_id for update;

  if p_status is not null and p_status <> v_t.status then
    v_ok := case
      when v_t.status = 'assigned' and p_status = 'in_progress' then true
      when v_t.status = 'in_progress' and p_status = 'completion_requested' then true
      when v_t.status = 'completion_requested' and p_status = 'in_progress' then true
      when v_is_admin and p_status in ('completed', 'cancelled') then true
      else false
    end;
    if not v_ok then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001',
        detail = v_t.status::text || ' -> ' || p_status::text;
    end if;

    update public.maintenance_tasks
    set status = p_status,
        started_at = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
        completion_requested_at = case when p_status = 'completion_requested' then now()
                                       else completion_requested_at end,
        completed_at = case when p_status = 'completed' then now() else completed_at end
    where id = p_task_id;

    perform set_config('app.status_note', coalesce(p_note, ''), true);

    if p_status = 'in_progress' and v_h.status = 'assigned' then
      update public.hazards set status = 'in_progress' where id = v_h.id;
    elsif p_status = 'completed' and v_h.status in ('assigned', 'in_progress') then
      update public.hazards set status = 'resolved', resolved_at = now() where id = v_h.id;
    elsif p_status = 'cancelled' and v_h.status in ('assigned', 'in_progress') then
      update public.hazards set status = 'verified' where id = v_h.id;
    elsif p_status = 'completion_requested' then
      for v_admin in select r.user_id from public.user_roles r where r.role = 'admin' loop
        perform app_private.notify(
          v_admin.user_id, 'maintenance_progress',
          'Completion requested',
          v_h.public_code || ' is ready for completion review.',
          'طلب اعتماد إنجاز',
          'البلاغ ' || v_h.public_code || ' جاهز لمراجعة الإنجاز.',
          jsonb_build_object('hazard_id', v_h.id, 'task_id', p_task_id, 'public_code', v_h.public_code)
        );
      end loop;
    end if;
  end if;

  insert into public.task_updates (task_id, author_id, status, note)
  values (p_task_id, v_uid, case when p_status is distinct from v_t.status then p_status end,
          nullif(btrim(p_note), ''));

  perform app_private.audit('task.update', 'maintenance_task', p_task_id::text,
    jsonb_build_object('from', v_t.status, 'to', coalesce(p_status, v_t.status), 'note', p_note));

  return jsonb_build_object('task_id', p_task_id, 'status', coalesce(p_status, v_t.status));
end;
$$;

create or replace function public.attach_task_image(
  p_task_id uuid,
  p_path text,
  p_kind public.image_kind,
  p_privacy_blurred boolean default false,
  p_width integer default null,
  p_height integer default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.maintenance_tasks;
  v_id uuid;
begin
  select * into v_t from public.maintenance_tasks where id = p_task_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not (public.is_admin() or v_t.assigned_to = v_uid) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_kind not in ('before', 'after') then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'kind';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_uid::text then
    raise exception 'INVALID_IMAGE_PATH' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'hazard-images' and o.name = p_path) then
    raise exception 'IMAGE_NOT_UPLOADED' using errcode = 'P0001';
  end if;
  if (select count(*) from public.hazard_images i where i.task_id = p_task_id) >= 12 then
    raise exception 'TOO_MANY_IMAGES' using errcode = 'P0001';
  end if;

  insert into public.hazard_images (hazard_id, task_id, uploader_id, storage_path, kind,
                                    privacy_blurred, width, height)
  values (v_t.hazard_id, p_task_id, v_uid, p_path, p_kind, coalesce(p_privacy_blurred, false),
          nullif(p_width, 0), nullif(p_height, 0))
  on conflict (storage_path) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.task_updates (task_id, author_id, status, note)
    values (p_task_id, v_uid, null, case p_kind when 'before' then 'Added a before photo'
                                                 else 'Added an after photo' end);
  end if;
  return v_id;
end;
$$;

-- Officer / admin work queue, ordered by explainable priority.
-- scope: 'mine' (my open tasks), 'unassigned' (verified, no open task),
--        'all_open' (admin: every open task), 'history' (closed tasks).
create or replace function public.officer_queue(
  p_scope text default 'mine',
  p_search text default null,
  p_category public.hazard_category default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  hazard_id uuid, public_code text, category public.hazard_category,
  severity public.hazard_severity, status public.report_status,
  latitude double precision, longitude double precision, address text, city text,
  confirmations_count integer, created_at timestamptz, verified_at timestamptz,
  priority jsonb, priority_score integer,
  task_id uuid, task_status public.task_status, assigned_to uuid, assignee_name text,
  due_date date, task_updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_search text := nullif(btrim(p_search), '');
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_scope = 'all_open' and not v_is_admin then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  return query
  with base as (
    select h.*, public.priority(h) as prio, t.id as t_id, t.status as t_status,
           t.assigned_to as t_assignee, t.due_date as t_due, t.updated_at as t_updated
    from public.hazards h
    left join lateral (
      select t1.* from public.maintenance_tasks t1
      where t1.hazard_id = h.id
        and (
          (p_scope in ('mine', 'all_open', 'unassigned')
             and t1.status in ('assigned', 'in_progress', 'completion_requested'))
          or (p_scope = 'history' and t1.status in ('completed', 'cancelled'))
        )
      order by t1.updated_at desc
      limit 1
    ) t on true
    where (p_category is null or h.category = p_category)
      and (
        v_search is null
        or h.public_code ilike '%' || v_search || '%'
        or h.address ilike '%' || v_search || '%'
        or h.city ilike '%' || v_search || '%'
      )
  )
  select b.id, b.public_code, b.category, b.severity, b.status, b.latitude, b.longitude,
         b.address, b.city, b.confirmations_count, b.created_at, b.verified_at,
         b.prio, (b.prio ->> 'score')::integer,
         b.t_id, b.t_status, b.t_assignee, p.full_name, b.t_due, b.t_updated
  from base b
  left join public.profiles p on p.id = b.t_assignee
  where case p_scope
    when 'mine' then b.t_id is not null and b.t_assignee = v_uid
    when 'all_open' then b.t_id is not null
    when 'unassigned' then b.t_id is null and b.status in ('verified', 'reopened')
    when 'history' then b.t_id is not null and (v_is_admin or b.t_assignee = v_uid)
    else false
  end
  order by
    case when p_scope = 'history' then null else (b.prio ->> 'score')::integer end desc nulls last,
    b.t_updated desc nulls last,
    b.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------- analytics
create or replace function public.admin_metrics(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365) - 1);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'period_days', v_days,
    'totals', (
      select jsonb_build_object(
        'total_reports', count(*),
        'active_hazards', count(*) filter (where h.status in ('verified', 'assigned', 'in_progress')),
        'pending_verification', count(*) filter (where h.status in ('submitted', 'under_review', 'reopened')),
        'resolved', count(*) filter (where h.status = 'resolved'),
        'closed', count(*) filter (where h.status in ('rejected', 'duplicate')),
        'reports_in_period', count(*) filter (where h.created_at >= v_since),
        'resolved_in_period', count(*) filter (where h.resolved_at >= v_since)
      )
      from public.hazards h
    ),
    'resolution_hours', (
      select jsonb_build_object(
        'count', count(*),
        'avg', round((avg(extract(epoch from (h.resolved_at - h.created_at))) / 3600)::numeric, 1),
        'median', round((percentile_cont(0.5) within group (
                    order by extract(epoch from (h.resolved_at - h.created_at))) / 3600)::numeric, 1),
        'p90', round((percentile_cont(0.9) within group (
                    order by extract(epoch from (h.resolved_at - h.created_at))) / 3600)::numeric, 1)
      )
      from public.hazards h
      where h.status = 'resolved' and h.resolved_at >= v_since
    ),
    'by_status', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
      from (select h.status, count(*) as n from public.hazards h group by h.status) s
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category', s.category, 'count', s.n) order by s.n desc), '[]'::jsonb)
      from (
        select h.category, count(*) as n from public.hazards h
        where h.created_at >= v_since group by h.category
      ) s
    ),
    'by_region', (
      select coalesce(jsonb_agg(jsonb_build_object('region', s.region, 'count', s.n) order by s.n desc), '[]'::jsonb)
      from (
        select coalesce(nullif(btrim(h.city), ''), 'unknown') as region, count(*) as n
        from public.hazards h where h.created_at >= v_since
        group by 1 order by 2 desc limit 10
      ) s
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'reported', (select count(*) from public.hazards h
                     where h.created_at >= d.day and h.created_at < d.day + interval '1 day'),
        'resolved', (select count(*) from public.hazards h
                     where h.resolved_at >= d.day and h.resolved_at < d.day + interval '1 day')
      ) order by d.day), '[]'::jsonb)
      from generate_series(v_since, date_trunc('day', now()), interval '1 day') as d(day)
    ),
    'priority_levels', (
      select jsonb_build_object(
        'high', count(*) filter (where p.lvl = 'high'),
        'medium', count(*) filter (where p.lvl = 'medium'),
        'low', count(*) filter (where p.lvl = 'low')
      )
      from (
        select public.priority(h) ->> 'level' as lvl from public.hazards h
        where h.status in ('submitted', 'under_review', 'reopened', 'verified', 'assigned', 'in_progress')
      ) p
    ),
    'workload', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'officer_id', pr.id,
        'name', pr.full_name,
        'assigned', w.assigned,
        'in_progress', w.in_progress,
        'completion_requested', w.completion_requested,
        'completed_in_period', w.completed
      ) order by (w.assigned + w.in_progress + w.completion_requested) desc), '[]'::jsonb)
      from public.user_roles r
      join public.profiles pr on pr.id = r.user_id
      cross join lateral (
        select
          count(*) filter (where t.status = 'assigned') as assigned,
          count(*) filter (where t.status = 'in_progress') as in_progress,
          count(*) filter (where t.status = 'completion_requested') as completion_requested,
          count(*) filter (where t.status = 'completed' and t.completed_at >= v_since) as completed
        from public.maintenance_tasks t where t.assigned_to = pr.id
      ) w
      where r.role = 'maintenance_officer'
    ),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'citizens', count(*) filter (where r.role = 'citizen'),
        'officers', count(*) filter (where r.role = 'maintenance_officer'),
        'admins', count(*) filter (where r.role = 'admin')
      )
      from public.user_roles r
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.priority_heatmap(p_cell_deg double precision default 0.005)
returns table (
  latitude double precision, longitude double precision,
  hazard_count integer, avg_priority numeric, max_priority integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cell double precision := least(greatest(coalesce(p_cell_deg, 0.005), 0.001), 1.0);
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return query
  select (floor(x.latitude / v_cell) + 0.5) * v_cell,
         (floor(x.longitude / v_cell) + 0.5) * v_cell,
         count(*)::integer,
         round(avg(x.score), 1),
         max(x.score)::integer
  from (
    select h.latitude, h.longitude, (public.priority(h) ->> 'score')::integer as score
    from public.hazards h
    where h.status in ('verified', 'assigned', 'in_progress', 'reopened')
  ) x
  group by floor(x.latitude / v_cell), floor(x.longitude / v_cell)
  order by 5 desc;
end;
$$;

-- ---------------------------------------------------------------- user administration
create or replace function public.admin_list_users(
  p_search text default null,
  p_role public.user_role default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, email text, full_name text, role public.user_role, created_at timestamptz,
  last_sign_in_at timestamptz, email_confirmed boolean, suspended_at timestamptz,
  report_count bigint, open_tasks bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_search text := nullif(btrim(p_search), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return query
  select u.id, u.email::text, p.full_name, r.role, u.created_at, u.last_sign_in_at,
         (u.email_confirmed_at is not null), p.suspended_at,
         (select count(*) from public.hazards h where h.reporter_id = u.id),
         (select count(*) from public.maintenance_tasks t
          where t.assigned_to = u.id and t.status in ('assigned', 'in_progress', 'completion_requested'))
  from auth.users u
  join public.profiles p on p.id = u.id
  join public.user_roles r on r.user_id = u.id
  where (v_search is null or u.email ilike '%' || v_search || '%' or p.full_name ilike '%' || v_search || '%')
    and (p_role is null or r.role = p_role)
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.user_role;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select r.role into v_old from public.user_roles r where r.user_id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_old = p_role then
    return;
  end if;
  if v_old = 'admin' and (select count(*) from public.user_roles r where r.role = 'admin') <= 1 then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;

  update public.user_roles
  set role = p_role, granted_by = auth.uid(), granted_at = now()
  where user_id = p_user_id;

  perform app_private.audit('role.change', 'user', p_user_id::text,
                            jsonb_build_object('from', v_old, 'to', p_role));
  perform app_private.notify(
    p_user_id, 'system_announcement',
    'Your access was updated',
    'Your RoadShield role is now: ' || case p_role when 'admin' then 'Administrator'
      when 'maintenance_officer' then 'Maintenance officer' else 'Citizen' end || '.',
    'تم تحديث صلاحياتك',
    'أصبح دورك في RoadShield: ' || case p_role when 'admin' then 'مسؤول النظام'
      when 'maintenance_officer' then 'مسؤول صيانة' else 'مواطن' end || '.',
    jsonb_build_object('role', p_role)
  );
end;
$$;

create or replace function public.admin_set_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_SUSPEND_SELF' using errcode = 'P0001';
  end if;
  update public.profiles
  set suspended_at = case when p_suspended then coalesce(suspended_at, now()) else null end
  where id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform app_private.audit(case when p_suspended then 'user.suspend' else 'user.unsuspend' end,
                            'user', p_user_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.list_officers()
returns table (id uuid, full_name text, email text, role public.user_role, open_tasks bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return query
  select p.id, p.full_name, u.email::text, r.role,
         (select count(*) from public.maintenance_tasks t
          where t.assigned_to = p.id and t.status in ('assigned', 'in_progress', 'completion_requested'))
  from public.user_roles r
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = p.id
  where r.role in ('maintenance_officer', 'admin') and p.suspended_at is null
  order by r.role desc, p.full_name;
end;
$$;

create or replace function public.send_announcement(
  p_title_en text, p_body_en text, p_title_ar text, p_body_ar text
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title_en), '') = '' or coalesce(btrim(p_body_en), '') = ''
     or coalesce(btrim(p_title_ar), '') = '' or coalesce(btrim(p_body_ar), '') = ''
     or char_length(p_title_en) > 120 or char_length(p_title_ar) > 120
     or char_length(p_body_en) > 500 or char_length(p_body_ar) > 500 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'announcement';
  end if;

  perform app_private.enforce_rate_limit('send_announcement', 5, interval '1 day');

  insert into public.notifications (user_id, type, title_en, body_en, title_ar, body_ar, data)
  select p.id, 'system_announcement', btrim(p_title_en), btrim(p_body_en),
         btrim(p_title_ar), btrim(p_body_ar), '{}'::jsonb
  from public.profiles p
  where p.suspended_at is null;
  get diagnostics v_count = row_count;

  perform app_private.audit('announcement.send', 'notification', null,
                            jsonb_build_object('title_en', p_title_en, 'recipients', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- function privileges
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated;
