-- RoadShield OS — map budget overlay and spending drill-down.

-- roads_geojson v2: adds `project_spend` = verified actual cost (approved cost items) of the
-- projects that include the segment. SECURITY INVOKER: for roles without finance access RLS
-- hides cost items, so the value is null rather than leaking money.
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
                          where pr.road_id = r.id and p.status in ('planning', 'approved', 'in_progress')),
      'project_spend', (select sum(ci.amount) from public.project_roads pr join public.cost_items ci on ci.project_id = pr.project_id
                        where pr.road_id = r.id and ci.status = 'approved')
    ))), '[]'::jsonb))
  from public.road_segments r
  where r.org_id = p_org and (p_condition is null or r.condition = any (p_condition));
$$;

-- Records behind one month of the spending trend (finance readers only).
create or replace function public.org_month_records(p_org uuid, p_month text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_start date;
begin
  if not public.can_read_org_finance(p_org) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_month !~ '^\d{4}-\d{2}$' then raise exception 'INVALID_INPUT' using errcode = 'P0001'; end if;
  v_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  return jsonb_build_object(
    'month', p_month,
    'cost_items', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'project_id', c.project_id, 'project_code', p.code,
        'category', c.category, 'description', c.description, 'amount', c.amount, 'currency', c.currency, 'date', c.cost_date) order by c.cost_date)
      from public.cost_items c join public.maintenance_projects p on p.id = c.project_id
      where c.org_id = p_org and c.status = 'approved' and c.cost_date >= v_start and c.cost_date < v_start + interval '1 month'), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'project_id', i.project_id, 'project_code', p.code,
        'number', i.invoice_number, 'amount', i.total_amount, 'currency', i.currency, 'date', i.invoice_date) order by i.invoice_date)
      from public.invoices i join public.maintenance_projects p on p.id = i.project_id
      where i.org_id = p_org and i.status = 'approved' and i.invoice_date >= v_start and i.invoice_date < v_start + interval '1 month'), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'project_id', x.project_id, 'project_code', p.code,
        'reference', x.reference, 'amount', x.amount, 'currency', x.currency, 'date', x.paid_on) order by x.paid_on)
      from public.payments x join public.maintenance_projects p on p.id = x.project_id
      where x.org_id = p_org and x.paid_on >= v_start and x.paid_on < v_start + interval '1 month'), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.org_month_records(uuid, text) to authenticated;
