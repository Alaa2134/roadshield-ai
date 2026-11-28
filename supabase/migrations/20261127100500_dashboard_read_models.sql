-- RoadShield OS — additional read models for dashboards (all computed from records).

-- Verified citizen reports inside the organization's service area (staff only).
create or replace function public.org_citizen_reports(p_org uuid, p_limit integer default 200)
returns table (id uuid, public_code text, category public.hazard_category, severity public.hazard_severity, status public.report_status,
               created_at timestamptz, confirmations_count integer, address text, latitude double precision, longitude double precision)
language plpgsql stable security definer set search_path = ''
as $$
declare v_area extensions.geometry;
begin
  if not public.is_org_staff(p_org) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select service_area into v_area from public.organizations where organizations.id = p_org;
  if v_area is null then return; end if;
  return query
    select h.id, h.public_code, h.category, h.severity, h.status, h.created_at, h.confirmations_count, h.address, h.latitude, h.longitude
    from public.hazards h
    where h.status in ('verified', 'assigned', 'in_progress', 'resolved')
      and extensions.st_intersects(h.location::extensions.geometry, v_area)
    order by h.created_at desc limit least(greatest(p_limit, 1), 1000);
end;
$$;

create or replace function public.road_asset_register(p_org uuid)
returns table (highway_class text, segments bigint, km numeric, with_surface bigint, with_width bigint, named bigint)
language sql stable security invoker set search_path = ''
as $$
  select r.highway_class, count(*), round(sum(r.length_m) / 1000, 2), count(r.surface_osm), count(r.width_m), count(r.name)
  from public.road_segments r where r.org_id = p_org
  group by r.highway_class order by sum(r.length_m) desc;
$$;

create or replace function public.org_analytics(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_org_staff(p_org) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'condition_by_class', coalesce((select jsonb_agg(x) from (
      select highway_class, condition, round(sum(length_m) / 1000, 2) km from public.road_segments where org_id = p_org
      group by highway_class, condition order by highway_class) x), '[]'::jsonb),
    'defects_by_class', coalesce((select jsonb_agg(x) from (
      select d.defect_class, count(*) n, round(coalesce(sum(d.area_m2), 0), 2) area_m2
      from public.inspection_defects d join public.road_inspections i on i.id = d.inspection_id
      where d.org_id = p_org and i.status = 'approved' group by d.defect_class order by n desc) x), '[]'::jsonb),
    'defects_by_severity', coalesce((select jsonb_object_agg(severity, n) from (
      select d.severity, count(*) n from public.inspection_defects d join public.road_inspections i on i.id = d.inspection_id
      where d.org_id = p_org and i.status = 'approved' group by d.severity) x), '{}'::jsonb),
    'inspections_by_month', coalesce((select jsonb_agg(x order by month) from (
      select to_char(date_trunc('month', inspected_at), 'YYYY-MM') as month, count(*) n from public.road_inspections
      where org_id = p_org and inspected_at > now() - interval '12 months' group by 1) x), '[]'::jsonb),
    'work_orders_by_status', coalesce((select jsonb_object_agg(status, n) from (
      select status, count(*) n from public.work_orders where org_id = p_org group by status) x), '{}'::jsonb)
  );
end;
$$;

-- Maintenance prioritisation flags from verified evidence (not a deterioration model).
create or replace function public.predictive_flags(p_org uuid, p_limit integer default 100)
returns table (road_id uuid, name text, highway_class text, length_m numeric, condition public.road_condition,
               last_inspected timestamptz, approved_inspections bigint, open_defects bigint, nearby_hazards bigint,
               has_active_project boolean, flags text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_org_staff(p_org) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
  with base as (
    select r.id, r.name, r.highway_class, r.length_m, r.condition, r.geom,
      (select max(i.inspected_at) from public.road_inspections i where i.road_id = r.id and i.status = 'approved') li,
      (select count(*) from public.road_inspections i where i.road_id = r.id and i.status = 'approved') ni,
      (select count(*) from public.inspection_defects d join public.road_inspections i on i.id = d.inspection_id
        where i.road_id = r.id and i.status = 'approved' and d.severity in ('high', 'critical')) nd,
      exists (select 1 from public.project_roads pr join public.maintenance_projects p on p.id = pr.project_id
              where pr.road_id = r.id and p.status in ('planning', 'approved', 'in_progress')) ap
    from public.road_segments r where r.org_id = p_org
  ), scored as (
    select b.*, (select count(*) from public.hazards h where h.status in ('verified', 'assigned', 'in_progress')
                   and extensions.st_dwithin(h.location, b.geom::extensions.geography, 25)) nh
    from base b
    where b.condition in ('poor', 'critical') or b.nd > 0
       or (b.highway_class in ('motorway', 'trunk', 'primary', 'secondary') and (b.li is null or b.li < now() - interval '12 months'))
  )
  select s.id, s.name, s.highway_class, s.length_m, s.condition, s.li, s.ni, s.nd, s.nh, s.ap,
    array_remove(array[
      case when s.condition in ('poor', 'critical') and not s.ap then 'poor_no_project' end,
      case when s.li is null or s.li < now() - interval '12 months' then 'stale_inspection' end,
      case when s.nh > 0 then 'citizen_hazards' end,
      case when s.nd > 0 then 'high_severity_defects' end], null)
  from scored s
  order by (s.condition = 'critical') desc, s.nd desc, s.nh desc, s.length_m desc
  limit least(greatest(p_limit, 1), 500);
end;
$$;

grant execute on function public.org_citizen_reports(uuid, integer), public.road_asset_register(uuid),
  public.org_analytics(uuid), public.predictive_flags(uuid, integer) to authenticated;
