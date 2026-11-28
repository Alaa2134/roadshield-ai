-- RoadShield OS — multi-tenant enterprise core: organizations, memberships, entitlements,
-- road network (OpenStreetMap-derived), inspections and defects.
--
-- Design rules
--   * Every enterprise row carries org_id. Reads are shaped by RLS; writes go through
--     SECURITY DEFINER RPCs (next migrations) that check the caller's role in that org.
--   * A platform admin (public.user_roles.role = 'admin') manages organizations but does NOT
--     automatically read an organization's financial records: that requires membership.
--   * Unknown physical attributes stay NULL. Nothing here invents road width, surface,
--     traffic volume or construction history; OSM tags are stored only when present.

-- ---------------------------------------------------------------- enums
create type public.org_role as enum (
  'owner', 'finance_manager', 'road_engineer', 'field_inspector', 'contractor', 'executive_viewer'
);

create type public.road_condition as enum ('unknown', 'good', 'fair', 'poor', 'critical');

create type public.approval_status as enum ('draft', 'submitted', 'approved', 'rejected');

-- RDD2022 classes plus engineer-only classes for field inspections.
create type public.defect_class as enum (
  'D00_longitudinal_crack', 'D10_transverse_crack', 'D20_alligator_crack', 'D40_pothole',
  'rutting', 'edge_break', 'patch_failure', 'other'
);

-- ---------------------------------------------------------------- plans & entitlements
-- Quotas only. Prices are commercial terms agreed per customer and are not stored here.
create table public.plans (
  code text primary key check (code ~ '^[a-z_]{2,30}$'),
  name text not null,
  max_members integer check (max_members > 0),          -- null = unlimited
  max_road_segments integer check (max_road_segments > 0),
  max_ai_analyses_month integer check (max_ai_analyses_month > 0),
  features text[] not null default '{}',
  created_at timestamptz not null default now()
);

insert into public.plans (code, name, max_members, max_road_segments, max_ai_analyses_month, features) values
  ('pilot', 'Pilot', 25, 20000, 2000,
     array['road_network','inspections','projects','finance','work_orders','contractors']),
  ('professional', 'Professional', 250, 250000, 50000,
     array['road_network','inspections','projects','finance','work_orders','contractors',
           'budget_studio','cost_prediction','exports']),
  ('enterprise', 'Enterprise', null, null, null,
     array['road_network','inspections','projects','finance','work_orders','contractors',
           'budget_studio','cost_prediction','exports','sso','audit_export','model_center']);

-- ---------------------------------------------------------------- organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 120),
  name_ar text check (char_length(name_ar) <= 120),
  org_type text not null default 'municipality'
    check (org_type in ('municipality', 'road_authority', 'engineering_firm', 'contractor_firm', 'other')),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  region text check (char_length(region) <= 80),
  city text check (char_length(city) <= 80),
  default_currency char(3) not null check (default_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  default_locale text not null default 'en' check (default_locale in ('en', 'ar')),
  measurement_system text not null default 'metric' check (measurement_system = 'metric'),
  engineering_standard text check (char_length(engineering_standard) <= 120),
  plan_code text not null default 'pilot' references public.plans (code),
  four_eyes_approval boolean not null default true,
  -- Optional service area; citizen reports inside it appear in the org's dashboards.
  service_area extensions.geometry(MultiPolygon, 4326),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_service_area_idx on public.organizations using gist (service_area);

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  contractor_id uuid,                -- set for role = 'contractor' (FK added below)
  title text check (char_length(title) <= 80),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);

create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role public.org_role not null,
  contractor_id uuid,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index org_invitations_org_idx on public.org_invitations (org_id, created_at desc);

-- Usage metering (one row per org, metric and calendar month).
create table public.org_usage (
  org_id uuid not null references public.organizations (id) on delete cascade,
  metric text not null check (metric in ('ai_analyses', 'documents_uploaded', 'exports')),
  period date not null check (extract(day from period) = 1),
  quantity integer not null default 0 check (quantity >= 0),
  primary key (org_id, metric, period)
);

alter table public.audit_logs add column org_id uuid references public.organizations (id) on delete cascade;
create index audit_logs_org_idx on public.audit_logs (org_id, created_at desc);

-- ---------------------------------------------------------------- road network
create table public.road_segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  osm_way_id bigint check (osm_way_id > 0),
  name text check (char_length(name) <= 200),
  name_ar text check (char_length(name_ar) <= 200),
  ref text check (char_length(ref) <= 40),
  highway_class text not null check (char_length(highway_class) <= 40),
  surface_osm text check (char_length(surface_osm) <= 40),     -- OSM "surface" tag, if tagged
  lanes_osm smallint check (lanes_osm between 1 and 20),       -- OSM "lanes" tag, if tagged
  oneway boolean,
  width_m numeric(6, 2) check (width_m > 0),                   -- verified measurement only
  geom extensions.geometry(LineString, 4326) not null,
  length_m numeric(12, 2) not null check (length_m >= 0),
  city text check (char_length(city) <= 80),
  region text check (char_length(region) <= 80),
  condition public.road_condition not null default 'unknown',
  condition_assessed_at timestamptz,
  condition_inspection_id uuid,
  source text not null check (char_length(source) <= 200),
  source_license text not null check (char_length(source_license) <= 120),
  source_retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint road_segments_osm_unique unique (org_id, osm_way_id)
);
create index road_segments_geom_idx on public.road_segments using gist (geom);
create index road_segments_org_idx on public.road_segments (org_id, highway_class);
create index road_segments_name_idx on public.road_segments (org_id, lower(name));

create table public.road_inspections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  road_id uuid not null references public.road_segments (id) on delete cascade,
  inspector_id uuid references public.profiles (id) on delete set null,
  inspected_at timestamptz not null,
  condition public.road_condition not null check (condition <> 'unknown'),
  notes text not null default '' check (char_length(notes) <= 4000),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status public.approval_status not null default 'submitted',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  client_id uuid,              -- offline idempotency key
  created_at timestamptz not null default now(),
  constraint road_inspections_client_unique unique (inspector_id, client_id)
);
create index road_inspections_road_idx on public.road_inspections (road_id, inspected_at desc);
create index road_inspections_org_idx on public.road_inspections (org_id, status, inspected_at desc);

alter table public.road_segments
  add constraint road_segments_condition_inspection_fk
  foreign key (condition_inspection_id) references public.road_inspections (id) on delete set null;

create table public.inspection_defects (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.road_inspections (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  defect_class public.defect_class not null,
  severity public.hazard_severity not null,       -- engineer-assessed
  length_m numeric(10, 2) check (length_m >= 0),
  width_m numeric(10, 2) check (width_m >= 0),
  depth_mm numeric(8, 1) check (depth_mm >= 0),
  area_m2 numeric(12, 2) check (area_m2 >= 0),    -- measured, or length × width
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  hazard_id uuid references public.hazards (id) on delete set null,  -- linked citizen report
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index inspection_defects_inspection_idx on public.inspection_defects (inspection_id);
create index inspection_defects_org_idx on public.inspection_defects (org_id);
create index inspection_defects_hazard_idx on public.inspection_defects (hazard_id);

-- ---------------------------------------------------------------- org documents (evidence)
create table public.org_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in
    ('road', 'inspection', 'project', 'contract', 'invoice', 'cost_item', 'work_order', 'payment', 'unit_rate')),
  entity_id uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  filename text not null check (char_length(filename) <= 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf',
    'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes integer check (size_bytes between 1 and 26214400),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index org_documents_entity_idx on public.org_documents (org_id, entity_type, entity_id);

-- ---------------------------------------------------------------- role helpers
create or replace function public.my_org_role(p_org uuid)
returns public.org_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.org_members m
  where m.org_id = p_org and m.user_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = m.user_id and p.suspended_at is not null);
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.my_org_role(p_org) = any (p_roles), false);
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.my_org_role(p_org) is not null;
$$;

-- Roles that may read all of an org's financial records.
create or replace function public.can_read_org_finance(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_org_role(p_org, array['owner','finance_manager','executive_viewer']::public.org_role[]);
$$;

-- Internal staff (everyone except contractors).
create or replace function public.is_org_staff(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_org_role(p_org,
    array['owner','finance_manager','road_engineer','field_inspector','executive_viewer']::public.org_role[]);
$$;

create or replace function public.my_contractor_id(p_org uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.contractor_id from public.org_members m
  where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'contractor';
$$;

create or replace function app_private.audit_org(
  p_org uuid, p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb
)
returns void language sql security definer set search_path = ''
as $$
  insert into public.audit_logs (actor_id, org_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_org, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Raise unless the caller holds one of p_roles in p_org.
create or replace function app_private.require_org_role(p_org uuid, p_roles public.org_role[])
returns public.org_role
language plpgsql stable security definer set search_path = ''
as $$
declare v_role public.org_role;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_role := public.my_org_role(p_org);
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------- RLS
alter table public.plans enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invitations enable row level security;
alter table public.org_usage enable row level security;
alter table public.road_segments enable row level security;
alter table public.road_inspections enable row level security;
alter table public.inspection_defects enable row level security;
alter table public.org_documents enable row level security;

create policy plans_select on public.plans for select to authenticated using (true);

create policy organizations_select on public.organizations for select to authenticated
  using ((select public.is_org_member(id)) or (select public.is_admin()));

create policy org_members_select on public.org_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_org_staff(org_id))
    or (select public.is_admin())
  );

create policy org_invitations_select on public.org_invitations for select to authenticated
  using ((select public.has_org_role(org_id, array['owner']::public.org_role[])));

create policy org_usage_select on public.org_usage for select to authenticated
  using ((select public.has_org_role(org_id, array['owner','finance_manager','executive_viewer']::public.org_role[])));

-- Contractors see roads only through their projects; staff see the whole network.
create policy road_segments_select on public.road_segments for select to authenticated
  using ((select public.is_org_staff(org_id)));

create policy road_inspections_select on public.road_inspections for select to authenticated
  using ((select public.is_org_staff(org_id)));

create policy inspection_defects_select on public.inspection_defects for select to authenticated
  using ((select public.is_org_staff(org_id)));

-- Audit: org owners read their org's audit trail (platform admins keep the existing policy).
create policy audit_logs_org_select on public.audit_logs for select to authenticated
  using (org_id is not null and (select public.has_org_role(org_id, array['owner']::public.org_role[])));

grant select on public.plans, public.organizations, public.org_members, public.org_invitations,
  public.org_usage, public.road_segments, public.road_inspections, public.inspection_defects,
  public.org_documents to authenticated;
revoke all on public.plans, public.organizations, public.org_members, public.org_invitations,
  public.org_usage, public.road_segments, public.road_inspections, public.inspection_defects,
  public.org_documents from anon;
revoke select (token_sha256) on public.org_invitations from authenticated;

create trigger organizations_touch before update on public.organizations
  for each row execute function app_private.touch_updated_at();
create trigger road_segments_touch before update on public.road_segments
  for each row execute function app_private.touch_updated_at();
