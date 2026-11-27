-- Export training rows for train_cost_model.py: one row per COMPLETED/CLOSED project with a
-- verified damaged area and finance-approved (verified) actual costs. Run per organization
-- (or across organizations only with their written consent). Output as CSV:
--   psql "$DATABASE_URL" -v org=<uuid> -c "\copy (...) to 'training.csv' csv header"
select p.id as project_id, p.actual_end as completed_on, o.country_code as country, coalesce(o.region, '') as region,
       coalesce(p.repair_method, 'unspecified') as repair_method,
       coalesce((select r.highway_class from public.project_roads pr join public.road_segments r on r.id = pr.road_id
                 where pr.project_id = p.id order by r.length_m desc limit 1), 'unknown') as highway_class,
       p.verified_damaged_area_m2,
       (select sum(ci.amount) from public.cost_items ci where ci.project_id = p.id and ci.status = 'approved') as verified_actual_cost,
       p.currency,
       (select round(sum(r.length_m) / 1000, 3) from public.project_roads pr join public.road_segments r on r.id = pr.road_id where pr.project_id = p.id) as road_km,
       (p.actual_end - p.actual_start) as duration_days
from public.maintenance_projects p join public.organizations o on o.id = p.org_id
where p.org_id = :'org' and p.status in ('completed', 'closed') and p.actual_end is not null
  and p.verified_damaged_area_m2 > 0
  and exists (select 1 from public.cost_items ci where ci.project_id = p.id and ci.status = 'approved')
order by p.actual_end;
