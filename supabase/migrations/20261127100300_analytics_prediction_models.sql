-- RoadShield OS — read models: financial roll-ups, dashboards, GIS feeds, explainable cost
-- prediction, budget optimisation, and the AI model / dataset registry.
--
-- Read functions are SECURITY INVOKER where possible so row level security does the
-- tenant filtering; SECURITY DEFINER read functions check the caller's org role first.

-- ================================================================ project financials
create or replace function app_private.project_money(p_project uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with p as (select * from public.maintenance_projects where id = p_project),
  est as (
    select e.total, e.version, e.created_at from public.cost_estimates e
    where e.project_id = p_project and e.status = 'approved' order by e.version desc limit 1
  ),
  commit as (
    select coalesce(sum(c.amount), 0)
         + coalesce((select sum(x.amount) from public.change_orders x join public.contracts c2 on c2.id = x.contract_id
                     where c2.project_id = p_project and x.status = 'approved'), 0) as amount
    from public.contracts c where c.project_id = p_project and c.status <> 'terminated'
  )
  select jsonb_build_object(
    'currency', (select currency from p),
    'approved_budget', coalesce((select sum(amount) from public.budgets where project_id = p_project and status = 'approved'), 0),
    'pending_budget', coalesce((select sum(amount) from public.budgets where project_id = p_project and status = 'submitted'), 0),
    'approved_estimate', (select total from est),
    'estimate_version', (select version from est),
    'committed', (select amount from commit),
    'invoiced_approved', coalesce((select sum(total_amount) from public.invoices where project_id = p_project and status = 'approved'), 0),
    'invoiced_pending', coalesce((select sum(total_amount) from public.invoices where project_id = p_project and status = 'submitted'), 0),
    'verified_actual', coalesce((select sum(amount) from public.cost_items where project_id = p_project and status = 'approved'), 0),
    'pending_actual', coalesce((select sum(amount) from public.cost_items where project_id = p_project and status = 'submitted'), 0),
    'paid', coalesce((select sum(amount) from public.payments where project_id = p_project), 0)
  );
$$;

create or replace function public.project_financials(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid := app_private.project_org(p_project);
  m jsonb;
  v_budget numeric; v_commit numeric; v_actual numeric; v_est numeric;
begin
  if v_org is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not public.has_org_role(v_org, array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  m := app_private.project_money(p_project);
  v_budget := (m ->> 'approved_budget')::numeric;
  v_commit := (m ->> 'committed')::numeric;
  v_actual := (m ->> 'verified_actual')::numeric;
  v_est := (m ->> 'approved_estimate')::numeric;

  return m || jsonb_build_object(
    -- Remaining available = approved budget − the larger of commitment and verified actual cost.
    'remaining_available', v_budget - greatest(v_commit, v_actual),
    'budget_utilization_pct', case when v_budget > 0 then round(greatest(v_commit, v_actual) * 100 / v_budget, 1) end,
    'variance_vs_estimate', case when v_est is not null then v_actual - v_est end,
    'variance_vs_estimate_pct', case when v_est > 0 then round((v_actual - v_est) * 100 / v_est, 1) end,
    'cost_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'verified', verified, 'pending', pending) order by verified desc)
      from (select category,
                   sum(amount) filter (where status = 'approved') as verified,
                   sum(amount) filter (where status = 'submitted') as pending
            from public.cost_items where project_id = p_project and status in ('approved', 'submitted')
            group by category) b), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('month', month, 'verified_actual', actual, 'paid', paid) order by month)
      from (
        select to_char(mon, 'YYYY-MM') as month,
               coalesce((select sum(amount) from public.cost_items where project_id = p_project and status = 'approved'
                         and date_trunc('month', cost_date) = mon), 0) as actual,
               coalesce((select sum(amount) from public.payments where project_id = p_project
                         and date_trunc('month', paid_on) = mon), 0) as paid
        from (select distinct date_trunc('month', cost_date) as mon from public.cost_items
              where project_id = p_project and status = 'approved'
              union select distinct date_trunc('month', paid_on) from public.payments where project_id = p_project) months
      ) t), '[]'::jsonb),
    'definitions', jsonb_build_object(
      'approved_budget', 'Sum of approved budget allocations for this project',
      'committed', 'Active contract amounts plus approved change orders',
      'invoiced_approved', 'Contractor invoices (incl. tax) approved for payment',
      'verified_actual', 'Actual cost items approved by finance (four-eyes)',
      'paid', 'Payments recorded against approved invoices',
      'remaining_available', 'approved_budget − max(committed, verified_actual)')
  );
end;
$$;

-- List view for the dashboard. SECURITY INVOKER: rows and money follow the caller's RLS.
create or replace function public.project_list(p_org uuid)
returns table (id uuid, code text, name text, status public.project_status, priority smallint,
               currency text, contractor_name text, road_count bigint, road_km numeric,
               planned_start date, planned_end date, approved_budget numeric, verified_actual numeric,
               committed numeric, paid numeric, open_work_orders bigint, updated_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.code, p.name, p.status, p.priority, p.currency::text, c.name,
    (select count(*) from public.project_roads pr where pr.project_id = p.id),
    (select round(coalesce(sum(r.length_m), 0) / 1000, 2) from public.project_roads pr
       join public.road_segments r on r.id = pr.road_id where pr.project_id = p.id),
    p.planned_start, p.planned_end,
    (select sum(b.amount) from public.budgets b where b.project_id = p.id and b.status = 'approved'),
    (select sum(ci.amount) from public.cost_items ci where ci.project_id = p.id and ci.status = 'approved'),
    (select sum(ct.amount) from public.contracts ct where ct.project_id = p.id and ct.status <> 'terminated')
      + coalesce((select sum(x.amount) from public.change_orders x join public.contracts ct2 on ct2.id = x.contract_id
                  where ct2.project_id = p.id and x.status = 'approved'), 0),
    (select sum(pm.amount) from public.payments pm where pm.project_id = p.id),
    (select count(*) from public.work_orders w where w.project_id = p.id
       and w.status in ('draft', 'issued', 'in_progress', 'submitted', 'rejected')),
    p.updated_at
  from public.maintenance_projects p
  left join public.contractors c on c.id = p.contractor_id
  where p.org_id = p_org
  order by p.priority, p.updated_at desc;
$$;

-- ================================================================ org overview
create or replace function public.org_overview(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_net jsonb;
  v_fin jsonb := null;
  v_year smallint := extract(year from now())::smallint;
  v_area extensions.geometry;
begin
  if not public.is_org_staff(p_org) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select service_area into v_area from public.organizations where id = p_org;

  v_net := jsonb_build_object(
    'road_segments', (select count(*) from public.road_segments where org_id = p_org),
    'managed_km', (select round(coalesce(sum(length_m), 0) / 1000, 2) from public.road_segments where org_id = p_org),
    'inspected_segments', (select count(distinct road_id) from public.road_inspections where org_id = p_org and status = 'approved'),
    'inspected_km', (select round(coalesce(sum(r.length_m), 0) / 1000, 2) from public.road_segments r
                     where r.org_id = p_org and r.condition <> 'unknown'),
    'segments_requiring_maintenance', (select count(*) from public.road_segments where org_id = p_org
                                       and condition in ('poor', 'critical')),
    'condition_distribution', (
      select jsonb_object_agg(c::text, coalesce(x.km, 0))
      from unnest(enum_range(null::public.road_condition)) c
      left join (select condition, round(sum(length_m) / 1000, 2) km from public.road_segments
                 where org_id = p_org group by condition) x on x.condition = c),
    'verified_defects', (select count(*) from public.inspection_defects d join public.road_inspections i on i.id = d.inspection_id
                         where d.org_id = p_org and i.status = 'approved'),
    'verified_citizen_hazards', case when v_area is null then null else (
      select count(*) from public.hazards h where h.status in ('verified', 'assigned', 'in_progress')
        and extensions.st_intersects(h.location::extensions.geometry, v_area)) end,
    'pending_inspections', (select count(*) from public.road_inspections where org_id = p_org and status = 'submitted'),
    'projects_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                           from (select status, count(*) n from public.maintenance_projects where org_id = p_org group by status) s),
    'active_projects', (select count(*) from public.maintenance_projects where org_id = p_org and status in ('approved', 'in_progress')),
    'open_work_orders', (select count(*) from public.work_orders where org_id = p_org
                         and status in ('issued', 'in_progress', 'submitted', 'rejected')),
    'members', (select count(*) from public.org_members where org_id = p_org)
  );

  if public.can_read_org_finance(p_org) then
    v_fin := jsonb_build_object(
      'currency', (select default_currency from public.organizations where id = p_org),
      'fiscal_year', v_year,
      'approved_budget_fy', coalesce((select sum(amount) from public.budgets where org_id = p_org and status = 'approved' and fiscal_year = v_year), 0),
      'approved_budget_total', coalesce((select sum(amount) from public.budgets where org_id = p_org and status = 'approved'), 0),
      'committed', coalesce((select sum(amount) from public.contracts where org_id = p_org and status <> 'terminated'), 0)
                 + coalesce((select sum(amount) from public.change_orders where org_id = p_org and status = 'approved'), 0),
      'verified_actual', coalesce((select sum(amount) from public.cost_items where org_id = p_org and status = 'approved'), 0),
      'paid', coalesce((select sum(amount) from public.payments where org_id = p_org), 0),
      'pending_approvals', (select count(*) from public.cost_items where org_id = p_org and status = 'submitted')
                         + (select count(*) from public.invoices where org_id = p_org and status = 'submitted')
                         + (select count(*) from public.budgets where org_id = p_org and status = 'submitted')
                         + (select count(*) from public.cost_estimates where org_id = p_org and status = 'submitted'),
      -- Backlog: latest approved estimates of projects not yet completed and not cancelled.
      'maintenance_backlog', coalesce((
        select sum(e.total) from public.maintenance_projects p
        join lateral (select total from public.cost_estimates e where e.project_id = p.id and e.status = 'approved'
                      order by version desc limit 1) e on true
        where p.org_id = p_org and p.status in ('planning', 'approved', 'in_progress')), 0),
      'projects_without_estimate', (select count(*) from public.maintenance_projects p where p.org_id = p_org
        and p.status in ('planning', 'approved', 'in_progress')
        and not exists (select 1 from public.cost_estimates e where e.project_id = p.id and e.status = 'approved'))
    );
    v_fin := v_fin || jsonb_build_object('remaining_available',
      (v_fin ->> 'approved_budget_total')::numeric
        - greatest((v_fin ->> 'committed')::numeric, (v_fin ->> 'verified_actual')::numeric));
  end if;

  return jsonb_build_object('network', v_net, 'finance', v_fin, 'generated_at', now());
end;
$$;

create or replace function public.org_spending_trend(p_org uuid, p_months integer default 12)
returns table (month text, verified_actual numeric, invoiced_approved numeric, paid numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_read_org_finance(p_org) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
    select to_char(m, 'YYYY-MM'),
      coalesce((select sum(amount) from public.cost_items where org_id = p_org and status = 'approved'
                and date_trunc('month', cost_date) = m), 0),
      coalesce((select sum(total_amount) from public.invoices where org_id = p_org and status = 'approved'
                and date_trunc('month', invoice_date) = m), 0),
      coalesce((select sum(amount) from public.payments where org_id = p_org and date_trunc('month', paid_on) = m), 0)
    from generate_series(date_trunc('month', now()) - make_interval(months => least(greatest(p_months, 1), 60) - 1),
                         date_trunc('month', now()), interval '1 month') m
    order by m;
end;
$$;

create or replace function public.org_activity(p_org uuid, p_limit integer default 30)
returns table (id bigint, action text, entity_type text, entity_id text, actor_name text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_org_role(p_org, array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return query
    select a.id, a.action, a.entity_type, a.entity_id, p.full_name,
           -- Money details are only shown to finance readers.
           case when public.can_read_org_finance(p_org) then a.details else a.details - 'amount' - 'total' - 'net' end,
           a.created_at
    from public.audit_logs a left join public.profiles p on p.id = a.actor_id
    where a.org_id = p_org order by a.created_at desc limit least(greatest(p_limit, 1), 200);
end;
$$;

-- ================================================================ GIS feeds
create or replace function public.roads_geojson(p_org uuid, p_condition public.road_condition[] default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
    'type', 'Feature', 'id', r.id,
    'geometry', extensions.st_asgeojson(r.geom, 6)::jsonb,
    'properties', jsonb_build_object(
      'id', r.id, 'name', r.name, 'name_ar', r.name_ar, 'ref', r.ref, 'highway', r.highway_class,
      'condition', r.condition, 'length_m', r.length_m,
      'active_projects', (select count(*) from public.project_roads pr join public.maintenance_projects p on p.id = pr.project_id
                          where pr.road_id = r.id and p.status in ('planning', 'approved', 'in_progress'))
    ))), '[]'::jsonb))
  from public.road_segments r
  where r.org_id = p_org and (p_condition is null or r.condition = any (p_condition));
$$;

create or replace function public.defects_geojson(p_org uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
    'type', 'Feature', 'id', d.id,
    'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(d.longitude, d.latitude)),
    'properties', jsonb_build_object('id', d.id, 'class', d.defect_class, 'severity', d.severity,
      'area_m2', d.area_m2, 'road_id', i.road_id, 'inspected_at', i.inspected_at)
  )), '[]'::jsonb))
  from public.inspection_defects d join public.road_inspections i on i.id = d.inspection_id
  where d.org_id = p_org and i.status = 'approved' and d.latitude is not null and d.longitude is not null;
$$;

create or replace function public.road_detail(p_road uuid)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare r public.road_segments; v_fin boolean;
begin
  select * into r from public.road_segments where id = p_road;   -- RLS: staff of the road's org only
  if r.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_fin := public.has_org_role(r.org_id, array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[]);
  return jsonb_build_object(
    'road', jsonb_build_object('id', r.id, 'org_id', r.org_id, 'osm_way_id', r.osm_way_id, 'name', r.name, 'name_ar', r.name_ar,
      'ref', r.ref, 'highway_class', r.highway_class, 'surface_osm', r.surface_osm, 'lanes_osm', r.lanes_osm,
      'oneway', r.oneway, 'width_m', r.width_m, 'length_m', r.length_m, 'city', r.city, 'region', r.region,
      'condition', r.condition, 'condition_assessed_at', r.condition_assessed_at,
      'source', r.source, 'source_license', r.source_license, 'source_retrieved_at', r.source_retrieved_at,
      'geometry', extensions.st_asgeojson(r.geom, 6)::jsonb,
      'centroid', jsonb_build_array(extensions.st_x(extensions.st_centroid(r.geom)), extensions.st_y(extensions.st_centroid(r.geom)))),
    'inspections', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'inspected_at', i.inspected_at,
        'condition', i.condition, 'status', i.status, 'notes', i.notes, 'inspector', p.full_name,
        'defects', (select count(*) from public.inspection_defects d where d.inspection_id = i.id))
        order by i.inspected_at desc)
      from public.road_inspections i left join public.profiles p on p.id = i.inspector_id where i.road_id = p_road), '[]'::jsonb),
    'defects', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'class', d.defect_class, 'severity', d.severity,
        'length_m', d.length_m, 'width_m', d.width_m, 'depth_mm', d.depth_mm, 'area_m2', d.area_m2,
        'inspected_at', i.inspected_at) order by i.inspected_at desc)
      from public.inspection_defects d join public.road_inspections i on i.id = d.inspection_id
      where i.road_id = p_road and i.status = 'approved'), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name,
        'status', p.status, 'contractor', c.name, 'planned_start', p.planned_start, 'planned_end', p.planned_end,
        'actual_end', p.actual_end,
        'verified_actual', case when v_fin then (select sum(ci.amount) from public.cost_items ci
                                                  where ci.project_id = p.id and ci.status = 'approved') end,
        'currency', p.currency) order by p.created_at desc)
      from public.project_roads pr join public.maintenance_projects p on p.id = pr.project_id
      left join public.contractors c on c.id = p.contractor_id where pr.road_id = p_road), '[]'::jsonb),
    'budgets', case when v_fin then coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.label,
        'fiscal_year', b.fiscal_year, 'amount', b.amount, 'currency', b.currency, 'status', b.status))
      from public.budgets b where b.road_id = p_road), '[]'::jsonb) end,
    'citizen_hazards', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'code', h.public_code,
        'category', h.category, 'severity', h.severity, 'status', h.status, 'created_at', h.created_at))
      from public.hazards h where h.status in ('verified', 'assigned', 'in_progress', 'resolved')
        and extensions.st_dwithin(h.location, r.geom::extensions.geography, 25)), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'filename', d.filename,
        'storage_path', d.storage_path, 'created_at', d.created_at))
      from public.org_documents d where d.entity_type = 'road' and d.entity_id = p_road), '[]'::jsonb)
  );
end;
$$;

create or replace function public.search_roads(p_org uuid, p_query text, p_limit integer default 20)
returns table (id uuid, name text, name_ar text, ref text, highway_class text, condition public.road_condition,
               length_m numeric, lon double precision, lat double precision)
language sql stable security invoker set search_path = ''
as $$
  select r.id, r.name, r.name_ar, r.ref, r.highway_class, r.condition, r.length_m,
         extensions.st_x(extensions.st_centroid(r.geom)), extensions.st_y(extensions.st_centroid(r.geom))
  from public.road_segments r
  where r.org_id = p_org and (
    r.name ilike '%' || p_query || '%' or r.name_ar ilike '%' || p_query || '%' or r.ref ilike '%' || p_query || '%'
    or r.osm_way_id::text = p_query)
  order by r.length_m desc limit least(greatest(p_limit, 1), 100);
$$;

-- ================================================================ explainable cost prediction
-- Model rs-cost-comparables-v1: verified actual cost per verified damaged m² of completed
-- projects of the same organization, currency and (when set) repair method.
-- Requires >= 5 comparables; otherwise returns status 'insufficient_data'. No invented values.
create or replace function public.predict_project_cost(p_project uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_p public.maintenance_projects;
  v_min_n constant integer := 5;
  v_n integer;
  v_q jsonb;
begin
  select * into v_p from public.maintenance_projects where id = p_project;
  if v_p.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not public.has_org_role(v_p.org_id, array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_p.verified_damaged_area_m2 is null or v_p.verified_damaged_area_m2 <= 0 then
    return jsonb_build_object('status', 'insufficient_data', 'model', 'rs-cost-comparables-v1',
      'reason', 'verified_damaged_area_required',
      'message', 'Insufficient verified data to generate a reliable prediction. Record the engineer-verified damaged area first.');
  end if;

  create temporary table if not exists pg_temp.rs_comp (project_id uuid, code text, name text, area numeric, actual numeric,
    unit_cost numeric, finished date) on commit drop;
  delete from pg_temp.rs_comp;
  insert into pg_temp.rs_comp
  select p.id, p.code, p.name, p.verified_damaged_area_m2, a.actual, a.actual / p.verified_damaged_area_m2, p.actual_end
  from public.maintenance_projects p
  join lateral (select sum(amount) actual from public.cost_items ci where ci.project_id = p.id and ci.status = 'approved') a on true
  where p.org_id = v_p.org_id and p.id <> v_p.id and p.status in ('completed', 'closed')
    and p.currency = v_p.currency and p.verified_damaged_area_m2 > 0 and a.actual > 0
    and (v_p.repair_method is null or p.repair_method = v_p.repair_method);
  select count(*) into v_n from pg_temp.rs_comp;

  if v_n < v_min_n then
    return jsonb_build_object('status', 'insufficient_data', 'model', 'rs-cost-comparables-v1',
      'reason', 'too_few_comparables', 'comparables_found', v_n, 'comparables_required', v_min_n,
      'message', 'Insufficient verified data to generate a reliable prediction.');
  end if;

  select jsonb_build_object(
    'p25', percentile_cont(0.25) within group (order by unit_cost),
    'p50', percentile_cont(0.50) within group (order by unit_cost),
    'p75', percentile_cont(0.75) within group (order by unit_cost),
    'oldest', min(finished), 'newest', max(finished)) into v_q from pg_temp.rs_comp;

  return jsonb_build_object(
    'status', 'ok', 'model', 'rs-cost-comparables-v1', 'currency', v_p.currency,
    'verified_damaged_area_m2', v_p.verified_damaged_area_m2,
    'range_low', round((v_q ->> 'p25')::numeric * v_p.verified_damaged_area_m2, 2),
    'median', round((v_q ->> 'p50')::numeric * v_p.verified_damaged_area_m2, 2),
    'range_high', round((v_q ->> 'p75')::numeric * v_p.verified_damaged_area_m2, 2),
    'unit_cost_per_m2', jsonb_build_object('p25', round((v_q ->> 'p25')::numeric, 2),
      'p50', round((v_q ->> 'p50')::numeric, 2), 'p75', round((v_q ->> 'p75')::numeric, 2)),
    'uncertainty', case
      when (v_q ->> 'p50')::numeric = 0 then 'high'
      when ((v_q ->> 'p75')::numeric - (v_q ->> 'p25')::numeric) / (v_q ->> 'p50')::numeric < 0.3 then 'low'
      when ((v_q ->> 'p75')::numeric - (v_q ->> 'p25')::numeric) / (v_q ->> 'p50')::numeric < 0.7 then 'moderate'
      else 'high' end,
    'comparables_used', v_n,
    'reference_data', jsonb_build_object('oldest_completion', v_q ->> 'oldest', 'newest_completion', v_q ->> 'newest'),
    'cost_drivers', (
      select jsonb_agg(jsonb_build_object('category', category, 'share_pct', share) order by share desc)
      from (select ci.category, round(sum(ci.amount) * 100 / nullif((select sum(actual) from pg_temp.rs_comp), 0), 1) share
            from public.cost_items ci where ci.status = 'approved' and ci.project_id in (select project_id from pg_temp.rs_comp)
            group by ci.category) s),
    'comparables', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'area_m2', area,
        'verified_actual', actual, 'unit_cost_per_m2', round(unit_cost, 2), 'completed', finished)
        order by abs(area - v_p.verified_damaged_area_m2)) from (select * from pg_temp.rs_comp
        order by abs(area - v_p.verified_damaged_area_m2) limit 8) c),
    'assumptions', jsonb_build_array(
      'Cost scales linearly with verified damaged area.',
      'Comparable projects are from the same organization and currency' ||
        case when v_p.repair_method is not null then ' and use the same repair method.' else '.' end,
      'Historical costs are not adjusted for inflation.',
      'Range is the interquartile range (25th–75th percentile) of comparable unit costs.')
  );
end;
$$;

-- ================================================================ budget optimisation
-- Greedy allocation over candidate projects (planning/approved, with an approved estimate).
-- Cost = latest approved estimate. Scores are computed from verified records only.
create or replace function public.optimize_budget(
  p_org uuid, p_funding numeric, p_strategy text, p_save_name text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_cur char(3);
  v_left numeric := p_funding;
  v_selected jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_excluded jsonb;
  c record;
  v_result jsonb;
  v_km numeric := 0;
  v_safety numeric := 0;
begin
  perform app_private.require_org_role(p_org, array['owner','finance_manager','executive_viewer']::public.org_role[]);
  if p_strategy not in ('safety_first', 'max_coverage', 'balanced', 'critical_damage') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'strategy';
  end if;
  if p_funding is null or p_funding <= 0 then raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'funding'; end if;
  select default_currency into v_cur from public.organizations where id = p_org;

  create temporary table if not exists pg_temp.rs_cand (project_id uuid, code text, name text, priority smallint,
    cost numeric, km numeric, safety numeric, critical integer, score numeric) on commit drop;
  delete from pg_temp.rs_cand;
  insert into pg_temp.rs_cand
  select p.id, p.code, p.name, p.priority, e.total,
    coalesce((select sum(r.length_m) / 1000 from public.project_roads pr join public.road_segments r on r.id = pr.road_id
              where pr.project_id = p.id), 0),
    -- Safety score: approved defects on the project's roads weighted by engineer severity,
    -- plus verified citizen hazards within 25 m of those roads.
    coalesce((select sum(case d.severity when 'low' then 1 when 'medium' then 2 when 'high' then 4 else 8 end)
              from public.project_roads pr join public.road_inspections i on i.road_id = pr.road_id and i.status = 'approved'
              join public.inspection_defects d on d.inspection_id = i.id where pr.project_id = p.id), 0)
    + coalesce((select sum(case h.severity when 'low' then 1 when 'medium' then 2 when 'high' then 4 else 8 end)
              from public.hazards h where h.status in ('verified', 'assigned', 'in_progress')
                and exists (select 1 from public.project_roads pr join public.road_segments r on r.id = pr.road_id
                            where pr.project_id = p.id and extensions.st_dwithin(h.location, r.geom::extensions.geography, 25))), 0),
    coalesce((select count(*) from public.project_roads pr join public.road_inspections i on i.road_id = pr.road_id and i.status = 'approved'
              join public.inspection_defects d on d.inspection_id = i.id where pr.project_id = p.id and d.severity in ('high', 'critical')), 0)
    + coalesce((select count(*) from public.project_roads pr join public.road_segments r on r.id = pr.road_id
              where pr.project_id = p.id and r.condition = 'critical'), 0),
    0
  from public.maintenance_projects p
  join lateral (select total from public.cost_estimates e where e.project_id = p.id and e.status = 'approved'
                order by version desc limit 1) e on true
  where p.org_id = p_org and p.status in ('planning', 'approved') and p.currency = v_cur and e.total > 0;

  -- Normalised scores (0..1) so strategies are comparable.
  update pg_temp.rs_cand set score = case p_strategy
    when 'safety_first' then safety
    when 'critical_damage' then critical
    when 'max_coverage' then km
    else 0.4 * coalesce(safety / nullif((select max(safety) from pg_temp.rs_cand), 0), 0)
       + 0.3 * coalesce(km / nullif((select max(km) from pg_temp.rs_cand), 0), 0)
       + 0.3 * (6 - priority) / 5.0 end;

  for c in
    select * from pg_temp.rs_cand
    where p_strategy <> 'critical_damage' or critical > 0
    order by case when p_strategy in ('safety_first', 'critical_damage') then score end desc nulls last,
             case when p_strategy in ('max_coverage', 'balanced') then score / cost end desc nulls last,
             priority, cost
  loop
    if c.cost <= v_left then
      v_left := v_left - c.cost; v_km := v_km + c.km; v_safety := v_safety + c.safety;
      v_selected := v_selected || jsonb_build_object('project_id', c.project_id, 'code', c.code, 'name', c.name,
        'cost', c.cost, 'road_km', round(c.km, 2), 'safety_score', c.safety, 'critical_items', c.critical,
        'priority', c.priority, 'score', round(c.score, 4));
    else
      v_skipped := v_skipped || jsonb_build_object('project_id', c.project_id, 'code', c.code, 'name', c.name,
        'cost', c.cost, 'reason', 'exceeds_remaining_funds');
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('project_id', p.id, 'code', p.code, 'name', p.name,
    'reason', case when p.currency <> v_cur then 'different_currency' else 'no_approved_estimate' end)), '[]'::jsonb)
  into v_excluded from public.maintenance_projects p
  where p.org_id = p_org and p.status in ('planning', 'approved')
    and p.id not in (select project_id from pg_temp.rs_cand);

  v_result := jsonb_build_object(
    'strategy', p_strategy, 'currency', v_cur, 'total_funding', p_funding,
    'allocated', p_funding - v_left, 'unallocated', v_left,
    'selected', v_selected, 'not_funded', v_skipped, 'excluded', v_excluded,
    'totals', jsonb_build_object('projects', jsonb_array_length(v_selected), 'road_km', round(v_km, 2), 'safety_score', v_safety),
    'candidates', (select count(*) from pg_temp.rs_cand),
    'method', 'rs-budget-greedy-v1: candidates are planning/approved projects with an approved estimate; '
      || case p_strategy
           when 'safety_first' then 'ordered by safety score (severity-weighted verified defects and citizen hazards)'
           when 'critical_damage' then 'only projects with high/critical defects or critical road condition, ordered by count'
           when 'max_coverage' then 'ordered by road kilometres per unit cost'
           else 'ordered by (0.4·safety + 0.3·coverage + 0.3·priority, each normalised) per unit cost' end
      || '; projects are funded in that order while funds remain. Results are decision support and require human review.',
    'generated_at', now());

  if p_save_name is not null and length(trim(p_save_name)) > 1 then
    perform app_private.require_org_role(p_org, array['owner','finance_manager']::public.org_role[]);
    insert into public.budget_scenarios (org_id, name, strategy, total_funding, currency, result, created_by)
    values (p_org, trim(p_save_name), p_strategy, p_funding, v_cur, v_result, auth.uid());
    perform app_private.audit_org(p_org, 'budget_scenario.save', 'budget_scenario', null,
      jsonb_build_object('name', p_save_name, 'strategy', p_strategy));
  end if;
  return v_result;
end;
$$;

-- ================================================================ AI model & dataset registry
create table public.ml_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 120),
  version text not null check (char_length(version) <= 60),
  task text not null check (task in ('damage_detection', 'cost_regression')),
  source_url text not null check (char_length(source_url) <= 500),
  license text not null check (char_length(license) <= 120),
  license_url text check (char_length(license_url) <= 500),
  license_verified boolean not null default false,
  license_notes text check (char_length(license_notes) <= 2000),
  citation text check (char_length(citation) <= 2000),
  classes text[] not null default '{}',
  countries text[] not null default '{}',
  num_images integer check (num_images >= 0),
  archive_sha256 text check (archive_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'registered' check (status in ('registered', 'downloaded', 'validated', 'retired')),
  created_at timestamptz not null default now(),
  constraint ml_datasets_unique unique (name, version)
);

create table public.ml_models (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('damage_detector', 'cost_model')),
  name text not null check (char_length(name) <= 120),
  version text not null check (char_length(version) <= 120),
  architecture text not null check (char_length(architecture) <= 120),
  framework text not null check (char_length(framework) <= 60),
  license text not null check (char_length(license) <= 120),
  dataset_id uuid references public.ml_datasets (id) on delete set null,
  provenance text not null check (provenance in ('trained_by_roadshield', 'third_party_pretrained', 'fine_tuned_by_roadshield')),
  provenance_notes text check (char_length(provenance_notes) <= 2000),
  metrics jsonb not null default '{}'::jsonb,
  metrics_source text check (char_length(metrics_source) <= 500),
  artifact_uri text check (char_length(artifact_uri) <= 500),
  artifact_sha256 text check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'candidate' check (status in ('candidate', 'production', 'retired', 'rejected')),
  trained_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ml_models_unique unique (kind, version)
);
create unique index ml_models_one_production on public.ml_models (kind) where status = 'production';

create table public.ml_training_runs (
  id uuid primary key default gen_random_uuid(),
  model_kind text not null check (model_kind in ('damage_detector', 'cost_model')),
  dataset_id uuid references public.ml_datasets (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  params jsonb not null default '{}'::jsonb,
  metrics jsonb,
  log_excerpt text check (char_length(log_excerpt) <= 8000),
  model_id uuid references public.ml_models (id) on delete set null,
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.ml_datasets enable row level security;
alter table public.ml_models enable row level security;
alter table public.ml_training_runs enable row level security;
-- Model cards and dataset licences are transparency information for every signed-in user.
create policy ml_datasets_select on public.ml_datasets for select to authenticated using (true);
create policy ml_models_select on public.ml_models for select to authenticated using (true);
create policy ml_training_runs_select on public.ml_training_runs for select to authenticated using ((select public.is_admin()));
grant select on public.ml_datasets, public.ml_models, public.ml_training_runs to authenticated;
grant select, insert, update on public.ml_datasets, public.ml_models, public.ml_training_runs to service_role;
revoke all on public.ml_datasets, public.ml_models, public.ml_training_runs from anon;

create or replace function public.request_training_run(p_kind text, p_dataset uuid, p_params jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_dataset is not null and not exists (select 1 from public.ml_datasets where id = p_dataset and license_verified) then
    raise exception 'DATASET_LICENSE_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  insert into public.ml_training_runs (model_kind, dataset_id, params, requested_by)
  values (p_kind, p_dataset, coalesce(p_params, '{}'::jsonb), auth.uid()) returning id into v_id;
  perform app_private.audit('ml.training_requested', 'ml_training_run', v_id::text, jsonb_build_object('kind', p_kind));
  return v_id;
end;
$$;

create or replace function public.approve_model_deployment(p_model uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_m public.ml_models;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into v_m from public.ml_models where id = p_model for update;
  if v_m.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_m.status <> 'candidate' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if v_m.metrics = '{}'::jsonb or v_m.metrics_source is null then
    raise exception 'METRICS_REQUIRED' using errcode = 'P0001';
  end if;
  update public.ml_models set status = 'retired' where kind = v_m.kind and status = 'production';
  update public.ml_models set status = 'production', approved_by = auth.uid(), approved_at = now() where id = p_model;
  perform app_private.audit('ml.model_deployed', 'ml_model', p_model::text,
    jsonb_build_object('kind', v_m.kind, 'version', v_m.version));
end;
$$;

create or replace function public.reject_model(p_model uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.ml_models set status = 'rejected' where id = p_model and status = 'candidate';
  if not found then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.audit('ml.model_rejected', 'ml_model', p_model::text, '{}'::jsonb);
end;
$$;

-- Registry seed: real, documented artefacts only.
insert into public.ml_datasets (name, version, task, source_url, license, license_url, license_verified, license_notes,
  citation, classes, countries, num_images, status)
values ('RDD2022', 'CRDDC2022',
  'damage_detection',
  'https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547',
  'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', true,
  'Licence as stated on the official Figshare record (verify again before redistribution). ShareAlike applies to the dataset and adaptations of it, not to models trained on it.',
  'Arya, D., Maeda, H., Ghosh, S. K., Toshniwal, D., Sekimoto, Y. (2022). RDD2022: A multi-national image dataset for automatic Road Damage Detection. arXiv:2209.08538.',
  array['D00','D10','D20','D40'], array['Japan','India','Czech Republic','Norway','United States','China'], 47420, 'registered');

insert into public.ml_models (kind, name, version, architecture, framework, license, dataset_id, provenance, provenance_notes,
  metrics, metrics_source, artifact_uri, artifact_sha256, status, trained_at)
select 'damage_detector', 'roadshield-rdd-yolov8s', 'YOLOv8_Small_RDD@7f2ceb8f6f3d', 'YOLOv8s', 'ONNX Runtime',
  'AGPL-3.0 (Ultralytics YOLOv8)', d.id, 'third_party_pretrained',
  'Weights trained on the RDD2022 Japan + India subsets by github.com/oracl4/RoadDamageDetection. Not trained or fine-tuned by RoadShield. mAP on RDD2022 test data has not been measured by RoadShield.',
  jsonb_build_object('sanity_run', jsonb_build_object(
    'dataset', 'Ultralytics crack-seg test split (112 close-up crack photos, domain shift)',
    'images_with_detection_pct', 37.5, 'median_top_confidence', 0.41,
    'latency_ms_median_cpu', 153, 'latency_ms_p95_cpu', 185)),
  'docs/test-results/ai-service-results.md (2026-10-31)',
  'services/ai/models/roadshield-rdd.onnx',
  '50ec1f31f3d44e400ea5faf2df46bbb5b5cdb37fb4e4c6a8edbb19e18cf1f050', 'production', null
from public.ml_datasets d where d.name = 'RDD2022';

grant execute on function
  public.project_financials(uuid), public.project_list(uuid), public.org_overview(uuid),
  public.org_spending_trend(uuid, integer), public.org_activity(uuid, integer), public.roads_geojson(uuid, public.road_condition[]),
  public.defects_geojson(uuid), public.road_detail(uuid), public.search_roads(uuid, text, integer),
  public.predict_project_cost(uuid), public.optimize_budget(uuid, numeric, text, text),
  public.request_training_run(text, uuid, jsonb), public.approve_model_deployment(uuid), public.reject_model(uuid)
to authenticated;
