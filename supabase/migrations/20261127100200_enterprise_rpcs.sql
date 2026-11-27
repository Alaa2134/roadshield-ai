-- RoadShield OS — write RPCs for the enterprise domain.
-- Every function: checks the caller's org role, validates state, writes, and audits.
-- Financial approvals honour the organization's four-eyes rule (approver ≠ submitter).

-- ---------------------------------------------------------------- helpers
create or replace function app_private.assert_four_eyes(p_org uuid, p_submitter uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_submitter is not null and p_submitter = auth.uid()
     and (select o.four_eyes_approval from public.organizations o where o.id = p_org) then
    raise exception 'FOUR_EYES_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function app_private.project_org(p_project uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select org_id from public.maintenance_projects where id = p_project $$;

-- ================================================================ organizations & members
create or replace function public.create_organization(
  p_name text, p_slug text, p_country_code text, p_currency text,
  p_timezone text default 'UTC', p_org_type text default 'municipality',
  p_city text default null, p_region text default null, p_name_ar text default null,
  p_locale text default 'en'
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  perform app_private.enforce_rate_limit('create_organization', 5, interval '1 day');

  insert into public.organizations (name, slug, country_code, default_currency, timezone, org_type,
                                    city, region, name_ar, default_locale, created_by)
  values (trim(p_name), lower(trim(p_slug)), upper(p_country_code), upper(p_currency),
          coalesce(nullif(trim(p_timezone), ''), 'UTC'), p_org_type, nullif(trim(p_city), ''),
          nullif(trim(p_region), ''), nullif(trim(p_name_ar), ''), coalesce(p_locale, 'en'), auth.uid())
  returning id into v_id;

  insert into public.org_members (org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform app_private.audit_org(v_id, 'org.create', 'organization', v_id::text,
    jsonb_build_object('name', p_name, 'country', upper(p_country_code)));
  return v_id;
exception when unique_violation then
  raise exception 'SLUG_TAKEN' using errcode = 'P0001';
end;
$$;

create or replace function public.update_organization(p_org uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_org_role(p_org, array['owner']::public.org_role[]);
  update public.organizations o set
    name = coalesce(nullif(trim(p_patch ->> 'name'), ''), o.name),
    name_ar = case when p_patch ? 'name_ar' then nullif(trim(p_patch ->> 'name_ar'), '') else o.name_ar end,
    city = case when p_patch ? 'city' then nullif(trim(p_patch ->> 'city'), '') else o.city end,
    region = case when p_patch ? 'region' then nullif(trim(p_patch ->> 'region'), '') else o.region end,
    timezone = coalesce(nullif(trim(p_patch ->> 'timezone'), ''), o.timezone),
    default_locale = coalesce(p_patch ->> 'default_locale', o.default_locale),
    engineering_standard = case when p_patch ? 'engineering_standard'
      then nullif(trim(p_patch ->> 'engineering_standard'), '') else o.engineering_standard end,
    four_eyes_approval = coalesce((p_patch ->> 'four_eyes_approval')::boolean, o.four_eyes_approval)
  where o.id = p_org;
  perform app_private.audit_org(p_org, 'org.update', 'organization', p_org::text, p_patch);
end;
$$;

-- GeoJSON Polygon or MultiPolygon.
create or replace function public.set_service_area(p_org uuid, p_geojson jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_geom extensions.geometry;
begin
  perform app_private.require_org_role(p_org, array['owner']::public.org_role[]);
  if p_geojson is null then
    update public.organizations set service_area = null where id = p_org;
  else
    v_geom := extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326));
    if not extensions.st_isvalid(v_geom) or extensions.geometrytype(v_geom) <> 'MULTIPOLYGON' then
      raise exception 'INVALID_GEOMETRY' using errcode = 'P0001';
    end if;
    update public.organizations set service_area = v_geom where id = p_org;
  end if;
  perform app_private.audit_org(p_org, 'org.service_area', 'organization', p_org::text, '{}'::jsonb);
end;
$$;

create or replace function public.my_organizations()
returns table (org_id uuid, name text, name_ar text, slug text, role public.org_role, country_code text,
               default_currency text, timezone text, plan_code text, contractor_id uuid)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.name_ar, o.slug, m.role, o.country_code::text, o.default_currency::text,
         o.timezone, o.plan_code, m.contractor_id
  from public.org_members m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by o.name;
$$;

create or replace function public.invite_member(
  p_org uuid, p_email text, p_role public.org_role, p_contractor_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
  v_max integer;
  v_count integer;
begin
  perform app_private.require_org_role(p_org, array['owner']::public.org_role[]);
  perform app_private.enforce_rate_limit('invite_member', 50, interval '1 day');
  if (p_role = 'contractor') <> (p_contractor_id is not null) then
    raise exception 'CONTRACTOR_REQUIRED' using errcode = 'P0001';
  end if;
  if p_contractor_id is not null and not exists
     (select 1 from public.contractors c where c.id = p_contractor_id and c.org_id = p_org) then
    raise exception 'CONTRACTOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select pl.max_members into v_max from public.organizations o join public.plans pl on pl.code = o.plan_code
  where o.id = p_org;
  select count(*) into v_count from public.org_members where org_id = p_org;
  if v_max is not null and v_count >= v_max then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001', hint = 'max_members';
  end if;

  insert into public.org_invitations (org_id, email, role, contractor_id, token_sha256, invited_by, expires_at)
  values (p_org, lower(trim(p_email)), p_role, p_contractor_id,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '14 days')
  returning id into v_id;
  perform app_private.audit_org(p_org, 'member.invite', 'org_invitation', v_id::text,
    jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));
  -- The raw token is returned once; only its hash is stored.
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.org_invitations;
  v_email text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  perform app_private.enforce_rate_limit('accept_invitation', 20, interval '1 hour');
  select * into v_inv from public.org_invitations
  where token_sha256 = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is distinct from v_inv.email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;
  insert into public.org_members (org_id, user_id, role, contractor_id, invited_by)
  values (v_inv.org_id, auth.uid(), v_inv.role, v_inv.contractor_id, v_inv.invited_by)
  on conflict (org_id, user_id) do update set role = excluded.role, contractor_id = excluded.contractor_id;
  update public.org_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  perform app_private.audit_org(v_inv.org_id, 'member.join', 'org_member', auth.uid()::text,
    jsonb_build_object('role', v_inv.role));
  return v_inv.org_id;
end;
$$;

create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_invitations where id = p_id;
  perform app_private.require_org_role(v_org, array['owner']::public.org_role[]);
  update public.org_invitations set revoked_at = now() where id = p_id and accepted_at is null;
  perform app_private.audit_org(v_org, 'member.invite_revoke', 'org_invitation', p_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.set_member_role(
  p_org uuid, p_user uuid, p_role public.org_role, p_contractor_id uuid default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_old public.org_role;
begin
  perform app_private.require_org_role(p_org, array['owner']::public.org_role[]);
  select role into v_old from public.org_members where org_id = p_org and user_id = p_user for update;
  if v_old is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_old = 'owner' and p_role <> 'owner'
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') = 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  if (p_role = 'contractor') <> (p_contractor_id is not null) then
    raise exception 'CONTRACTOR_REQUIRED' using errcode = 'P0001';
  end if;
  update public.org_members set role = p_role, contractor_id = p_contractor_id
  where org_id = p_org and user_id = p_user;
  perform app_private.audit_org(p_org, 'member.role', 'org_member', p_user::text,
    jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_role public.org_role;
begin
  if p_user <> auth.uid() then
    perform app_private.require_org_role(p_org, array['owner']::public.org_role[]);
  end if;
  select role into v_role from public.org_members where org_id = p_org and user_id = p_user for update;
  if v_role is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_role = 'owner' and (select count(*) from public.org_members where org_id = p_org and role = 'owner') = 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
  perform app_private.audit_org(p_org, 'member.remove', 'org_member', p_user::text, '{}'::jsonb);
end;
$$;

create or replace function public.org_member_directory(p_org uuid)
returns table (user_id uuid, full_name text, email text, role public.org_role, contractor_id uuid,
               title text, joined_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_org_staff(p_org) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
    select m.user_id, p.full_name, u.email::text, m.role, m.contractor_id, m.title, m.created_at
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org
    order by m.role, p.full_name;
end;
$$;

-- ================================================================ road network
-- p_features: [{osm_way_id, name, name_ar, ref, highway, surface, lanes, oneway,
--               coordinates: [[lon, lat], ...]}]  (max 2000 per call)
create or replace function public.import_road_segments(
  p_org uuid, p_features jsonb, p_source text, p_license text, p_retrieved_at timestamptz,
  p_city text default null, p_region text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  f jsonb;
  v_geom extensions.geometry;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_max integer;
  v_existing integer;
  v_xmax xid;
begin
  perform app_private.require_org_role(p_org, array['owner','road_engineer']::public.org_role[]);
  if jsonb_typeof(p_features) <> 'array' or jsonb_array_length(p_features) > 2000 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'features: array of at most 2000';
  end if;
  if coalesce(trim(p_source), '') = '' or coalesce(trim(p_license), '') = '' or p_retrieved_at is null then
    raise exception 'SOURCE_METADATA_REQUIRED' using errcode = 'P0001';
  end if;
  select pl.max_road_segments into v_max from public.organizations o join public.plans pl on pl.code = o.plan_code
  where o.id = p_org;
  select count(*) into v_existing from public.road_segments where org_id = p_org;

  for f in select * from jsonb_array_elements(p_features) loop
    begin
      v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(
        jsonb_build_object('type', 'LineString', 'coordinates', f -> 'coordinates')::text), 4326);
      if extensions.st_npoints(v_geom) < 2 or not extensions.st_isvalid(v_geom) then
        v_skipped := v_skipped + 1; continue;
      end if;
    exception when others then
      v_skipped := v_skipped + 1; continue;
    end;
    if v_max is not null and v_existing + v_inserted >= v_max
       and not exists (select 1 from public.road_segments r where r.org_id = p_org
                       and r.osm_way_id = (f ->> 'osm_way_id')::bigint) then
      raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001', hint = 'max_road_segments';
    end if;

    insert into public.road_segments as r (org_id, osm_way_id, name, name_ar, ref, highway_class,
      surface_osm, lanes_osm, oneway, geom, length_m, city, region, source, source_license, source_retrieved_at)
    values (
      p_org, nullif(f ->> 'osm_way_id', '')::bigint,
      left(nullif(trim(f ->> 'name'), ''), 200), left(nullif(trim(f ->> 'name_ar'), ''), 200),
      left(nullif(trim(f ->> 'ref'), ''), 40), left(coalesce(nullif(f ->> 'highway', ''), 'road'), 40),
      left(nullif(f ->> 'surface', ''), 40),
      case when (f ->> 'lanes') ~ '^[0-9]{1,2}$' and (f ->> 'lanes')::int between 1 and 20
           then (f ->> 'lanes')::smallint end,
      case f ->> 'oneway' when 'yes' then true when 'true' then true when 'no' then false
                          when 'false' then false end,
      v_geom, round(extensions.st_length(v_geom::extensions.geography)::numeric, 2),
      nullif(trim(p_city), ''), nullif(trim(p_region), ''), p_source, p_license, p_retrieved_at
    )
    on conflict (org_id, osm_way_id) do update set
      name = excluded.name, name_ar = excluded.name_ar, ref = excluded.ref,
      highway_class = excluded.highway_class, surface_osm = excluded.surface_osm,
      lanes_osm = excluded.lanes_osm, oneway = excluded.oneway, geom = excluded.geom,
      length_m = excluded.length_m, source = excluded.source, source_license = excluded.source_license,
      source_retrieved_at = excluded.source_retrieved_at,
      city = coalesce(excluded.city, r.city), region = coalesce(excluded.region, r.region)
    returning xmax into v_xmax;
    if v_xmax = 0 then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
  end loop;

  perform app_private.audit_org(p_org, 'roads.import', 'road_segments', null,
    jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped,
                       'source', p_source, 'license', p_license));
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
end;
$$;

-- ================================================================ inspections
-- p_defects: [{defect_class, severity, length_m, width_m, depth_mm, area_m2, latitude, longitude,
--              hazard_id, notes}]
create or replace function public.submit_inspection(
  p_road uuid, p_condition public.road_condition, p_notes text, p_inspected_at timestamptz,
  p_latitude double precision default null, p_longitude double precision default null,
  p_defects jsonb default '[]'::jsonb, p_client_id uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  d jsonb;
  v_area numeric;
begin
  select org_id into v_org from public.road_segments where id = p_road;
  if v_org is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_org, array['owner','road_engineer','field_inspector']::public.org_role[]);
  if p_client_id is not null then
    select id into v_id from public.road_inspections where inspector_id = auth.uid() and client_id = p_client_id;
    if v_id is not null then return v_id; end if;   -- idempotent replay from offline queue
  end if;
  if p_inspected_at > now() + interval '10 minutes' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'inspected_at in future';
  end if;
  if jsonb_typeof(coalesce(p_defects, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_defects, '[]')) > 100 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'defects';
  end if;

  insert into public.road_inspections (org_id, road_id, inspector_id, inspected_at, condition, notes,
                                       latitude, longitude, client_id)
  values (v_org, p_road, auth.uid(), p_inspected_at, p_condition, left(coalesce(p_notes, ''), 4000),
          p_latitude, p_longitude, p_client_id)
  returning id into v_id;

  for d in select * from jsonb_array_elements(coalesce(p_defects, '[]'::jsonb)) loop
    v_area := coalesce(nullif(d ->> 'area_m2', '')::numeric,
                       round(nullif(d ->> 'length_m', '')::numeric * nullif(d ->> 'width_m', '')::numeric, 2));
    insert into public.inspection_defects (inspection_id, org_id, defect_class, severity, length_m, width_m,
                                           depth_mm, area_m2, latitude, longitude, hazard_id, notes)
    values (v_id, v_org, (d ->> 'defect_class')::public.defect_class, (d ->> 'severity')::public.hazard_severity,
            nullif(d ->> 'length_m', '')::numeric, nullif(d ->> 'width_m', '')::numeric,
            nullif(d ->> 'depth_mm', '')::numeric, v_area,
            nullif(d ->> 'latitude', '')::double precision, nullif(d ->> 'longitude', '')::double precision,
            nullif(d ->> 'hazard_id', '')::uuid, left(coalesce(d ->> 'notes', ''), 1000));
  end loop;

  perform app_private.audit_org(v_org, 'inspection.submit', 'road_inspection', v_id::text,
    jsonb_build_object('road_id', p_road, 'condition', p_condition));
  return v_id;
end;
$$;

create or replace function public.review_inspection(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_insp public.road_inspections;
begin
  select * into v_insp from public.road_inspections where id = p_id for update;
  if v_insp.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_insp.org_id, array['owner','road_engineer']::public.org_role[]);
  if v_insp.status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.assert_four_eyes(v_insp.org_id, v_insp.inspector_id);

  update public.road_inspections set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
  where id = p_id;

  -- The road's condition follows its most recent approved inspection.
  if p_approve then
    update public.road_segments r set condition = v_insp.condition, condition_assessed_at = v_insp.inspected_at,
      condition_inspection_id = v_insp.id
    where r.id = v_insp.road_id and (r.condition_assessed_at is null or r.condition_assessed_at <= v_insp.inspected_at);
  end if;
  perform app_private.audit_org(v_insp.org_id, case when p_approve then 'inspection.approve' else 'inspection.reject' end,
    'road_inspection', p_id::text, jsonb_build_object('note', p_note));
end;
$$;

-- ================================================================ contractors
create or replace function public.upsert_contractor(
  p_org uuid, p_id uuid, p_name text, p_registration_no text default null,
  p_contact_name text default null, p_contact_email text default null, p_phone text default null,
  p_qualifications text default '', p_status text default 'active'
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform app_private.require_org_role(p_org, array['owner','finance_manager','road_engineer']::public.org_role[]);
  if p_id is null then
    insert into public.contractors (org_id, name, registration_no, contact_name, contact_email, phone,
                                    qualifications, status, created_by)
    values (p_org, trim(p_name), nullif(trim(p_registration_no), ''), nullif(trim(p_contact_name), ''),
            nullif(lower(trim(p_contact_email)), ''), nullif(trim(p_phone), ''), coalesce(p_qualifications, ''),
            coalesce(p_status, 'active'), auth.uid())
    returning id into v_id;
  else
    update public.contractors set name = trim(p_name), registration_no = nullif(trim(p_registration_no), ''),
      contact_name = nullif(trim(p_contact_name), ''), contact_email = nullif(lower(trim(p_contact_email)), ''),
      phone = nullif(trim(p_phone), ''), qualifications = coalesce(p_qualifications, ''),
      status = coalesce(p_status, status)
    where id = p_id and org_id = p_org
    returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  perform app_private.audit_org(p_org, 'contractor.upsert', 'contractor', v_id::text, jsonb_build_object('name', p_name));
  return v_id;
exception when unique_violation then
  raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

-- ================================================================ projects
create or replace function public.create_project(
  p_org uuid, p_code text, p_name text, p_description text default '',
  p_priority smallint default 3, p_repair_method text default null, p_road_ids uuid[] default '{}',
  p_planned_start date default null, p_planned_end date default null,
  p_verified_damaged_area_m2 numeric default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_cur char(3);
begin
  perform app_private.require_org_role(p_org, array['owner','road_engineer']::public.org_role[]);
  select default_currency into v_cur from public.organizations where id = p_org;
  if exists (select 1 from unnest(coalesce(p_road_ids, '{}')) rid
             where not exists (select 1 from public.road_segments r where r.id = rid and r.org_id = p_org)) then
    raise exception 'ROAD_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.maintenance_projects (org_id, code, name, description, priority, repair_method, currency,
    planned_start, planned_end, verified_damaged_area_m2, created_by)
  values (p_org, upper(trim(p_code)), trim(p_name), coalesce(p_description, ''), coalesce(p_priority, 3),
          nullif(trim(p_repair_method), ''), v_cur, p_planned_start, p_planned_end, p_verified_damaged_area_m2, auth.uid())
  returning id into v_id;
  insert into public.project_roads (project_id, road_id, org_id)
  select v_id, rid, p_org from unnest(coalesce(p_road_ids, '{}')) rid on conflict do nothing;
  insert into public.project_status_history (project_id, to_status, changed_by) values (v_id, 'planning', auth.uid());
  perform app_private.audit_org(p_org, 'project.create', 'project', v_id::text,
    jsonb_build_object('code', upper(trim(p_code)), 'roads', coalesce(array_length(p_road_ids, 1), 0)));
  return v_id;
exception when unique_violation then
  raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

create or replace function public.update_project(p_project uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := app_private.project_org(p_project);
begin
  if v_org is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_org, array['owner','road_engineer']::public.org_role[]);
  if p_patch ? 'contractor_id' and nullif(p_patch ->> 'contractor_id', '') is not null and not exists
     (select 1 from public.contractors c where c.id = (p_patch ->> 'contractor_id')::uuid and c.org_id = v_org) then
    raise exception 'CONTRACTOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.maintenance_projects p set
    name = coalesce(nullif(trim(p_patch ->> 'name'), ''), p.name),
    description = coalesce(p_patch ->> 'description', p.description),
    priority = coalesce((p_patch ->> 'priority')::smallint, p.priority),
    repair_method = case when p_patch ? 'repair_method' then nullif(trim(p_patch ->> 'repair_method'), '') else p.repair_method end,
    planned_start = case when p_patch ? 'planned_start' then nullif(p_patch ->> 'planned_start', '')::date else p.planned_start end,
    planned_end = case when p_patch ? 'planned_end' then nullif(p_patch ->> 'planned_end', '')::date else p.planned_end end,
    verified_damaged_area_m2 = case when p_patch ? 'verified_damaged_area_m2'
      then nullif(p_patch ->> 'verified_damaged_area_m2', '')::numeric else p.verified_damaged_area_m2 end,
    contractor_id = case when p_patch ? 'contractor_id' then nullif(p_patch ->> 'contractor_id', '')::uuid else p.contractor_id end
  where p.id = p_project;
  if p_patch ? 'road_ids' then
    delete from public.project_roads where project_id = p_project;
    insert into public.project_roads (project_id, road_id, org_id)
    select p_project, r.id, v_org from public.road_segments r
    where r.org_id = v_org and r.id in (select (jsonb_array_elements_text(p_patch -> 'road_ids'))::uuid);
  end if;
  perform app_private.audit_org(v_org, 'project.update', 'project', p_project::text, p_patch);
end;
$$;

create or replace function public.transition_project(p_project uuid, p_to public.project_status, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.maintenance_projects;
  v_role public.org_role;
  v_ok boolean;
begin
  select * into v_p from public.maintenance_projects where id = p_project for update;
  if v_p.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_role := app_private.require_org_role(v_p.org_id, array['owner','finance_manager','road_engineer']::public.org_role[]);
  v_ok := case
    when v_p.status = 'planning' and p_to = 'approved' then v_role in ('owner', 'finance_manager')
    when v_p.status = 'approved' and p_to = 'in_progress' then v_role in ('owner', 'road_engineer')
    when v_p.status = 'in_progress' and p_to = 'completed' then v_role in ('owner', 'road_engineer')
    when v_p.status = 'completed' and p_to = 'closed' then v_role in ('owner', 'finance_manager')
    when v_p.status in ('planning', 'approved', 'in_progress') and p_to = 'cancelled' then v_role = 'owner'
    else false end;
  if not v_ok then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if p_to = 'approved' and not exists (select 1 from public.budgets b where b.project_id = p_project and b.status = 'approved') then
    raise exception 'BUDGET_REQUIRED' using errcode = 'P0001';
  end if;

  update public.maintenance_projects set status = p_to,
    actual_start = case when p_to = 'in_progress' then coalesce(actual_start, current_date) else actual_start end,
    actual_end = case when p_to = 'completed' then current_date else actual_end end
  where id = p_project;
  insert into public.project_status_history (project_id, from_status, to_status, changed_by, note)
  values (p_project, v_p.status, p_to, auth.uid(), left(p_note, 500));
  perform app_private.audit_org(v_p.org_id, 'project.transition', 'project', p_project::text,
    jsonb_build_object('from', v_p.status, 'to', p_to));
end;
$$;

-- ================================================================ unit rates
create or replace function public.add_unit_rate(
  p_org uuid, p_category public.cost_category, p_description text, p_unit text, p_rate numeric,
  p_currency text, p_rate_kind text, p_effective_date date, p_source_kind public.cost_source,
  p_source_title text, p_source_url text default null, p_region text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform app_private.require_org_role(p_org, array['owner','finance_manager','road_engineer']::public.org_role[]);
  insert into public.unit_rates (org_id, country_code, region, category, description, unit, rate, currency, rate_kind,
    effective_date, source_kind, source_title, source_url, created_by)
  select p_org, o.country_code, nullif(trim(p_region), ''), p_category, trim(p_description), trim(p_unit), p_rate,
         upper(p_currency), p_rate_kind, p_effective_date, p_source_kind, trim(p_source_title),
         nullif(trim(p_source_url), ''), auth.uid()
  from public.organizations o where o.id = p_org
  returning id into v_id;
  perform app_private.audit_org(p_org, 'unit_rate.add', 'unit_rate', v_id::text,
    jsonb_build_object('category', p_category, 'rate', p_rate, 'currency', upper(p_currency), 'source', p_source_title));
  return v_id;
end;
$$;

create or replace function public.verify_unit_rate(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_r public.unit_rates;
begin
  select * into v_r from public.unit_rates where id = p_id for update;
  if v_r.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_r.org_id, array['owner','finance_manager']::public.org_role[]);
  perform app_private.assert_four_eyes(v_r.org_id, v_r.created_by);
  update public.unit_rates set verified = true, verified_by = auth.uid(), verified_at = now() where id = p_id;
  perform app_private.audit_org(v_r.org_id, 'unit_rate.verify', 'unit_rate', p_id::text, '{}'::jsonb);
end;
$$;

-- ================================================================ budgets
create or replace function public.submit_budget(
  p_org uuid, p_project uuid, p_road uuid, p_fiscal_year smallint, p_label text, p_amount numeric,
  p_currency text, p_funding_source text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform app_private.require_org_role(p_org, array['owner','finance_manager']::public.org_role[]);
  if p_road is not null and not exists (select 1 from public.road_segments where id = p_road and org_id = p_org) then
    raise exception 'ROAD_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.budgets (org_id, project_id, road_id, fiscal_year, label, amount, currency, funding_source, submitted_by)
  values (p_org, p_project, p_road, p_fiscal_year, trim(p_label), round(p_amount, 2), upper(p_currency),
          nullif(trim(p_funding_source), ''), auth.uid())
  returning id into v_id;
  perform app_private.audit_org(p_org, 'budget.submit', 'budget', v_id::text,
    jsonb_build_object('amount', round(p_amount, 2), 'currency', upper(p_currency), 'project_id', p_project));
  return v_id;
end;
$$;

create or replace function public.review_budget(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_b public.budgets;
begin
  select * into v_b from public.budgets where id = p_id for update;
  if v_b.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_b.org_id, array['owner','finance_manager']::public.org_role[]);
  if v_b.status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.assert_four_eyes(v_b.org_id, v_b.submitted_by);
  update public.budgets set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
  where id = p_id;
  perform app_private.audit_org(v_b.org_id, case when p_approve then 'budget.approve' else 'budget.reject' end,
    'budget', p_id::text, jsonb_build_object('amount', v_b.amount, 'note', p_note));
end;
$$;

-- ================================================================ estimates
-- p_lines: [{category, description, unit, quantity, unit_rate_id} | {..., unit_rate, rate_source}]
create or replace function public.submit_estimate(p_project uuid, p_lines jsonb, p_assumptions text default '')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.maintenance_projects;
  v_id uuid;
  v_version integer;
  l jsonb;
  v_n integer := 0;
  v_rate numeric;
  v_src text;
  v_rate_id uuid;
  v_qty numeric;
  v_total numeric := 0;
  v_ur public.unit_rates;
begin
  select * into v_p from public.maintenance_projects where id = p_project;
  if v_p.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_p.org_id, array['owner','road_engineer']::public.org_role[]);
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'lines';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.cost_estimates where project_id = p_project;
  insert into public.cost_estimates (org_id, project_id, version, currency, total, assumptions, submitted_by)
  values (v_p.org_id, p_project, v_version, v_p.currency, 0, left(coalesce(p_assumptions, ''), 4000), auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    v_qty := (l ->> 'quantity')::numeric;
    v_rate_id := nullif(l ->> 'unit_rate_id', '')::uuid;
    if v_rate_id is not null then
      select * into v_ur from public.unit_rates where id = v_rate_id and org_id = v_p.org_id;
      if v_ur.id is null then raise exception 'UNIT_RATE_NOT_FOUND' using errcode = 'P0001'; end if;
      if not v_ur.verified then raise exception 'UNIT_RATE_NOT_VERIFIED' using errcode = 'P0001'; end if;
      if v_ur.currency <> v_p.currency then raise exception 'CURRENCY_MISMATCH' using errcode = 'P0001'; end if;
      v_rate := v_ur.rate;
      v_src := left(v_ur.source_title || ' (' || v_ur.rate_kind || ', ' || v_ur.effective_date || ')', 300);
    else
      v_rate := (l ->> 'unit_rate')::numeric;
      v_src := nullif(trim(l ->> 'rate_source'), '');
      if v_rate is null or v_src is null then
        raise exception 'RATE_SOURCE_REQUIRED' using errcode = 'P0001';
      end if;
    end if;
    insert into public.estimate_lines (estimate_id, org_id, line_no, category, description, unit, quantity,
                                       unit_rate, unit_rate_id, rate_source, amount)
    values (v_id, v_p.org_id, v_n, (l ->> 'category')::public.cost_category,
            coalesce(nullif(trim(l ->> 'description'), ''), coalesce(v_ur.description, '')), coalesce(nullif(trim(l ->> 'unit'), ''), v_ur.unit),
            v_qty, v_rate, v_rate_id, v_src, round(v_qty * v_rate, 2));
    v_total := v_total + round(v_qty * v_rate, 2);
    v_ur := null;
  end loop;

  update public.cost_estimates set total = v_total where id = v_id;
  perform app_private.audit_org(v_p.org_id, 'estimate.submit', 'cost_estimate', v_id::text,
    jsonb_build_object('project_id', p_project, 'version', v_version, 'total', v_total));
  return v_id;
end;
$$;

create or replace function public.review_estimate(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_e public.cost_estimates;
begin
  select * into v_e from public.cost_estimates where id = p_id for update;
  if v_e.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_e.org_id, array['owner','finance_manager']::public.org_role[]);
  if v_e.status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.assert_four_eyes(v_e.org_id, v_e.submitted_by);
  update public.cost_estimates set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
  where id = p_id;
  perform app_private.audit_org(v_e.org_id, case when p_approve then 'estimate.approve' else 'estimate.reject' end,
    'cost_estimate', p_id::text, jsonb_build_object('total', v_e.total));
end;
$$;

-- ================================================================ contracts & change orders
create or replace function public.create_contract(
  p_project uuid, p_contractor uuid, p_reference text, p_signed_on date, p_amount numeric,
  p_retention_pct numeric default 0, p_warranty_months smallint default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_p public.maintenance_projects; v_id uuid;
begin
  select * into v_p from public.maintenance_projects where id = p_project;
  if v_p.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_p.org_id, array['owner','finance_manager']::public.org_role[]);
  if not exists (select 1 from public.contractors c where c.id = p_contractor and c.org_id = v_p.org_id and c.status = 'active') then
    raise exception 'CONTRACTOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.contracts (org_id, project_id, contractor_id, reference, signed_on, amount, currency,
                                retention_pct, warranty_months, created_by)
  values (v_p.org_id, p_project, p_contractor, trim(p_reference), p_signed_on, round(p_amount, 2), v_p.currency,
          coalesce(p_retention_pct, 0), p_warranty_months, auth.uid())
  returning id into v_id;
  update public.maintenance_projects set contractor_id = coalesce(contractor_id, p_contractor) where id = p_project;
  perform app_private.audit_org(v_p.org_id, 'contract.create', 'contract', v_id::text,
    jsonb_build_object('amount', round(p_amount, 2), 'contractor_id', p_contractor));
  return v_id;
exception when unique_violation then
  raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

create or replace function public.submit_change_order(p_contract uuid, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_c public.contracts; v_id uuid;
begin
  select * into v_c from public.contracts where id = p_contract;
  if v_c.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_c.org_id, array['owner','finance_manager','road_engineer']::public.org_role[]);
  insert into public.change_orders (org_id, contract_id, amount, reason, submitted_by)
  values (v_c.org_id, p_contract, round(p_amount, 2), trim(p_reason), auth.uid()) returning id into v_id;
  perform app_private.audit_org(v_c.org_id, 'change_order.submit', 'change_order', v_id::text,
    jsonb_build_object('amount', round(p_amount, 2)));
  return v_id;
end;
$$;

create or replace function public.review_change_order(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_co public.change_orders; v_total numeric;
begin
  select * into v_co from public.change_orders where id = p_id for update;
  if v_co.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_co.org_id, array['owner','finance_manager']::public.org_role[]);
  if v_co.status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.assert_four_eyes(v_co.org_id, v_co.submitted_by);
  if p_approve then
    select c.amount + coalesce((select sum(x.amount) from public.change_orders x
                                where x.contract_id = c.id and x.status = 'approved'), 0) + v_co.amount
      into v_total from public.contracts c where c.id = v_co.contract_id;
    if v_total <= 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  end if;
  update public.change_orders set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform app_private.audit_org(v_co.org_id, case when p_approve then 'change_order.approve' else 'change_order.reject' end,
    'change_order', p_id::text, jsonb_build_object('amount', v_co.amount));
end;
$$;

-- ================================================================ work orders
create or replace function public.create_work_order(
  p_project uuid, p_code text, p_title text, p_description text default '',
  p_contractor uuid default null, p_engineer uuid default null, p_due_date date default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := app_private.project_org(p_project); v_id uuid;
begin
  if v_org is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_org, array['owner','road_engineer']::public.org_role[]);
  if p_contractor is not null and not exists (select 1 from public.contractors where id = p_contractor and org_id = v_org) then
    raise exception 'CONTRACTOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_engineer is not null and not exists (select 1 from public.org_members where org_id = v_org and user_id = p_engineer
      and role in ('owner', 'road_engineer', 'field_inspector')) then
    raise exception 'ENGINEER_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.work_orders (org_id, project_id, contractor_id, assigned_engineer, code, title, description,
                                  due_date, created_by)
  values (v_org, p_project, p_contractor, p_engineer, upper(trim(p_code)), trim(p_title), coalesce(p_description, ''),
          p_due_date, auth.uid())
  returning id into v_id;
  perform app_private.audit_org(v_org, 'work_order.create', 'work_order', v_id::text, jsonb_build_object('code', p_code));
  return v_id;
exception when unique_violation then
  raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

create or replace function public.transition_work_order(p_id uuid, p_to public.work_order_status, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_w public.work_orders;
  v_role public.org_role;
  v_is_contractor boolean;
  v_is_staff boolean;
  v_ok boolean;
begin
  select * into v_w from public.work_orders where id = p_id for update;
  if v_w.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_role := app_private.require_org_role(v_w.org_id,
    array['owner','road_engineer','field_inspector','contractor']::public.org_role[]);
  v_is_contractor := v_role = 'contractor' and v_w.contractor_id = public.my_contractor_id(v_w.org_id);
  v_is_staff := v_role in ('owner', 'road_engineer') or (v_role = 'field_inspector' and v_w.assigned_engineer = auth.uid());
  if v_role = 'contractor' and not v_is_contractor then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  v_ok := case
    when v_w.status = 'draft' and p_to = 'issued' then v_role in ('owner', 'road_engineer')
    when v_w.status = 'issued' and p_to = 'in_progress' then v_is_contractor or v_is_staff
    when v_w.status = 'rejected' and p_to = 'in_progress' then v_is_contractor or v_is_staff
    when v_w.status = 'in_progress' and p_to = 'submitted' then v_is_contractor or v_is_staff
    when v_w.status = 'submitted' and p_to in ('accepted', 'rejected') then v_role in ('owner', 'road_engineer')
    when v_w.status in ('draft', 'issued', 'in_progress', 'submitted', 'rejected') and p_to = 'cancelled'
      then v_role in ('owner', 'road_engineer')
    else false end;
  if not v_ok then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if p_to = 'accepted' then perform app_private.assert_four_eyes(v_w.org_id,
    (select l.author_id from public.work_logs l where l.work_order_id = p_id order by l.created_at desc limit 1));
  end if;

  update public.work_orders set status = p_to,
    issued_at = case when p_to = 'issued' then now() else issued_at end,
    submitted_at = case when p_to = 'submitted' then now() else submitted_at end,
    accepted_at = case when p_to = 'accepted' then now() else accepted_at end,
    progress_pct = case when p_to = 'accepted' then 100 else progress_pct end
  where id = p_id;
  if p_note is not null and length(trim(p_note)) > 0 then
    insert into public.work_logs (org_id, work_order_id, author_id, log_date, note)
    values (v_w.org_id, p_id, auth.uid(), current_date, left('[' || p_to || '] ' || trim(p_note), 4000));
  end if;
  perform app_private.audit_org(v_w.org_id, 'work_order.transition', 'work_order', p_id::text,
    jsonb_build_object('from', v_w.status, 'to', p_to));
end;
$$;

create or replace function public.add_work_log(
  p_work_order uuid, p_log_date date, p_note text, p_progress_pct smallint default null,
  p_photo_paths text[] default '{}', p_client_id uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_w public.work_orders; v_role public.org_role; v_id uuid;
begin
  select * into v_w from public.work_orders where id = p_work_order;
  if v_w.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_role := app_private.require_org_role(v_w.org_id,
    array['owner','road_engineer','field_inspector','contractor']::public.org_role[]);
  if v_role = 'contractor' and v_w.contractor_id is distinct from public.my_contractor_id(v_w.org_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_role = 'field_inspector' and v_w.assigned_engineer is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_w.status not in ('issued', 'in_progress', 'rejected', 'submitted') then
    raise exception 'INVALID_STATE' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_photo_paths, '{}')) ph where ph not like v_w.org_id::text || '/' || auth.uid()::text || '/%') then
    raise exception 'INVALID_PATH' using errcode = 'P0001';
  end if;
  if p_client_id is not null then
    select id into v_id from public.work_logs where author_id = auth.uid() and client_id = p_client_id;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.work_logs (org_id, work_order_id, author_id, log_date, note, progress_pct, photo_paths, client_id)
  values (v_w.org_id, p_work_order, auth.uid(), p_log_date, trim(p_note), p_progress_pct, coalesce(p_photo_paths, '{}'), p_client_id)
  returning id into v_id;
  if p_progress_pct is not null then
    update public.work_orders set progress_pct = p_progress_pct where id = p_work_order and status <> 'accepted';
  end if;
  perform app_private.audit_org(v_w.org_id, 'work_log.add', 'work_order', p_work_order::text,
    jsonb_build_object('progress', p_progress_pct));
  return v_id;
end;
$$;

-- ================================================================ actual costs
create or replace function public.submit_cost_item(
  p_project uuid, p_work_order uuid, p_category public.cost_category, p_description text, p_unit text,
  p_quantity numeric, p_unit_rate numeric, p_cost_date date, p_source_kind public.cost_source,
  p_client_id uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.maintenance_projects;
  v_role public.org_role;
  v_contractor uuid;
  v_id uuid;
begin
  select * into v_p from public.maintenance_projects where id = p_project;
  if v_p.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_role := app_private.require_org_role(v_p.org_id,
    array['owner','finance_manager','road_engineer','contractor']::public.org_role[]);
  if p_client_id is not null then
    select id into v_id from public.cost_items where submitted_by = auth.uid() and client_id = p_client_id;
    if v_id is not null then return v_id; end if;
  end if;
  if p_work_order is not null and not exists
     (select 1 from public.work_orders w where w.id = p_work_order and w.project_id = p_project) then
    raise exception 'WORK_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_role = 'contractor' then
    v_contractor := public.my_contractor_id(v_p.org_id);
    if p_work_order is null or not exists (select 1 from public.work_orders w where w.id = p_work_order
                                            and w.contractor_id = v_contractor) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    if p_source_kind <> 'contractor_submission' then raise exception 'INVALID_SOURCE' using errcode = 'P0001'; end if;
  else
    v_contractor := (select w.contractor_id from public.work_orders w where w.id = p_work_order);
  end if;
  if p_cost_date > current_date then raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'cost_date'; end if;
  if p_source_kind in ('public_procurement', 'benchmark_publication') then
    -- Benchmarks and tender values are reference data, never actual project expenditure.
    raise exception 'INVALID_SOURCE' using errcode = 'P0001';
  end if;

  insert into public.cost_items (org_id, project_id, work_order_id, contractor_id, category, description, unit,
    quantity, unit_rate, amount, currency, cost_date, source_kind, submitted_by, client_id)
  values (v_p.org_id, p_project, p_work_order, v_contractor, p_category, trim(p_description), trim(p_unit),
          p_quantity, p_unit_rate, round(p_quantity * p_unit_rate, 2), v_p.currency, p_cost_date, p_source_kind,
          auth.uid(), p_client_id)
  returning id into v_id;
  perform app_private.audit_org(v_p.org_id, 'cost_item.submit', 'cost_item', v_id::text,
    jsonb_build_object('amount', round(p_quantity * p_unit_rate, 2), 'category', p_category));
  return v_id;
end;
$$;

create or replace function public.review_cost_item(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_c public.cost_items;
begin
  select * into v_c from public.cost_items where id = p_id for update;
  if v_c.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_c.org_id, array['owner','finance_manager']::public.org_role[]);
  if v_c.status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.assert_four_eyes(v_c.org_id, v_c.submitted_by);
  update public.cost_items set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
  where id = p_id;
  perform app_private.audit_org(v_c.org_id, case when p_approve then 'cost_item.approve' else 'cost_item.reject' end,
    'cost_item', p_id::text, jsonb_build_object('amount', v_c.amount, 'note', p_note));
end;
$$;

-- ================================================================ invoices & payments
create or replace function public.submit_invoice(
  p_contract uuid, p_invoice_number text, p_invoice_date date, p_net_amount numeric, p_tax_amount numeric default 0
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_c public.contracts; v_role public.org_role; v_id uuid;
begin
  select * into v_c from public.contracts where id = p_contract;
  if v_c.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_role := app_private.require_org_role(v_c.org_id, array['owner','finance_manager','contractor']::public.org_role[]);
  if v_role = 'contractor' and v_c.contractor_id is distinct from public.my_contractor_id(v_c.org_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_invoice_date > current_date then raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'invoice_date'; end if;
  insert into public.invoices (org_id, contract_id, project_id, contractor_id, invoice_number, invoice_date,
                               net_amount, tax_amount, currency, submitted_by)
  values (v_c.org_id, p_contract, v_c.project_id, v_c.contractor_id, trim(p_invoice_number), p_invoice_date,
          round(p_net_amount, 2), round(coalesce(p_tax_amount, 0), 2), v_c.currency, auth.uid())
  returning id into v_id;
  perform app_private.audit_org(v_c.org_id, 'invoice.submit', 'invoice', v_id::text,
    jsonb_build_object('number', p_invoice_number, 'net', round(p_net_amount, 2)));
  return v_id;
exception when unique_violation then
  raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

create or replace function public.review_invoice(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_i public.invoices; v_commit numeric; v_invoiced numeric;
begin
  select * into v_i from public.invoices where id = p_id for update;
  if v_i.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_i.org_id, array['owner','finance_manager']::public.org_role[]);
  if v_i.status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.assert_four_eyes(v_i.org_id, v_i.submitted_by);
  if p_approve then
    -- Net invoiced value may not exceed the contract commitment (incl. approved change orders).
    select c.amount + coalesce((select sum(x.amount) from public.change_orders x
                                where x.contract_id = c.id and x.status = 'approved'), 0)
      into v_commit from public.contracts c where c.id = v_i.contract_id;
    select coalesce(sum(net_amount), 0) into v_invoiced from public.invoices
    where contract_id = v_i.contract_id and status = 'approved';
    if v_invoiced + v_i.net_amount > v_commit then
      raise exception 'EXCEEDS_COMMITMENT' using errcode = 'P0001';
    end if;
  end if;
  update public.invoices set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
  where id = p_id;
  perform app_private.audit_org(v_i.org_id, case when p_approve then 'invoice.approve' else 'invoice.reject' end,
    'invoice', p_id::text, jsonb_build_object('total', v_i.total_amount, 'note', p_note));
end;
$$;

create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_paid_on date, p_reference text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_i public.invoices; v_paid numeric; v_id uuid;
begin
  select * into v_i from public.invoices where id = p_invoice for update;
  if v_i.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app_private.require_org_role(v_i.org_id, array['owner','finance_manager']::public.org_role[]);
  if v_i.status <> 'approved' then raise exception 'INVOICE_NOT_APPROVED' using errcode = 'P0001'; end if;
  if p_paid_on > current_date then raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'paid_on'; end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = p_invoice;
  if v_paid + round(p_amount, 2) > v_i.total_amount then
    raise exception 'OVERPAYMENT' using errcode = 'P0001';
  end if;
  insert into public.payments (org_id, invoice_id, project_id, amount, currency, paid_on, reference, recorded_by)
  values (v_i.org_id, p_invoice, v_i.project_id, round(p_amount, 2), v_i.currency, p_paid_on, trim(p_reference), auth.uid())
  returning id into v_id;
  perform app_private.audit_org(v_i.org_id, 'payment.record', 'payment', v_id::text,
    jsonb_build_object('invoice_id', p_invoice, 'amount', round(p_amount, 2)));
  return v_id;
end;
$$;

-- ================================================================ documents
create or replace function public.register_document(
  p_org uuid, p_entity_type text, p_entity_id uuid, p_storage_path text, p_filename text,
  p_mime_type text, p_size_bytes integer
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_ok boolean;
begin
  perform app_private.require_org_role(p_org,
    array['owner','finance_manager','road_engineer','field_inspector','contractor']::public.org_role[]);
  if p_storage_path not like p_org::text || '/' || auth.uid()::text || '/%' then
    raise exception 'INVALID_PATH' using errcode = 'P0001';
  end if;
  v_ok := case p_entity_type
    when 'road' then exists (select 1 from public.road_segments where id = p_entity_id and org_id = p_org)
    when 'inspection' then exists (select 1 from public.road_inspections where id = p_entity_id and org_id = p_org)
    when 'project' then exists (select 1 from public.maintenance_projects where id = p_entity_id and org_id = p_org)
    when 'contract' then exists (select 1 from public.contracts where id = p_entity_id and org_id = p_org)
    when 'invoice' then exists (select 1 from public.invoices where id = p_entity_id and org_id = p_org)
    when 'cost_item' then exists (select 1 from public.cost_items where id = p_entity_id and org_id = p_org)
    when 'work_order' then exists (select 1 from public.work_orders where id = p_entity_id and org_id = p_org)
    when 'payment' then exists (select 1 from public.payments where id = p_entity_id and org_id = p_org)
    when 'unit_rate' then exists (select 1 from public.unit_rates where id = p_entity_id and org_id = p_org)
    else false end;
  if not v_ok then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.org_documents (org_id, entity_type, entity_id, storage_path, filename, mime_type, size_bytes, uploaded_by)
  values (p_org, p_entity_type, p_entity_id, p_storage_path, left(p_filename, 200), p_mime_type, p_size_bytes, auth.uid())
  returning id into v_id;
  insert into public.org_usage (org_id, metric, period, quantity)
  values (p_org, 'documents_uploaded', date_trunc('month', now())::date, 1)
  on conflict (org_id, metric, period) do update set quantity = public.org_usage.quantity + 1;
  perform app_private.audit_org(p_org, 'document.register', p_entity_type, p_entity_id::text,
    jsonb_build_object('filename', p_filename));
  return v_id;
end;
$$;

-- Private bucket for organization evidence: <org_id>/<uid>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-documents', 'org-documents', false, 26214400,
        array['image/jpeg', 'image/png', 'application/pdf', 'text/csv',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy "org documents: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-documents'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy "org documents: read registered" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'org-documents'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or exists (select 1 from public.org_documents d where d.storage_path = name)
      or exists (select 1 from public.work_logs l where name = any (l.photo_paths))
    )
  );

-- ---------------------------------------------------------------- privileges
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_organization(text, text, text, text, text, text, text, text, text, text),
  public.update_organization(uuid, jsonb),
  public.set_service_area(uuid, jsonb),
  public.my_organizations(),
  public.invite_member(uuid, text, public.org_role, uuid),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.set_member_role(uuid, uuid, public.org_role, uuid),
  public.remove_member(uuid, uuid),
  public.org_member_directory(uuid),
  public.import_road_segments(uuid, jsonb, text, text, timestamptz, text, text),
  public.submit_inspection(uuid, public.road_condition, text, timestamptz, double precision, double precision, jsonb, uuid),
  public.review_inspection(uuid, boolean, text),
  public.upsert_contractor(uuid, uuid, text, text, text, text, text, text, text),
  public.create_project(uuid, text, text, text, smallint, text, uuid[], date, date, numeric),
  public.update_project(uuid, jsonb),
  public.transition_project(uuid, public.project_status, text),
  public.add_unit_rate(uuid, public.cost_category, text, text, numeric, text, text, date, public.cost_source, text, text, text),
  public.verify_unit_rate(uuid),
  public.submit_budget(uuid, uuid, uuid, smallint, text, numeric, text, text),
  public.review_budget(uuid, boolean, text),
  public.submit_estimate(uuid, jsonb, text),
  public.review_estimate(uuid, boolean, text),
  public.create_contract(uuid, uuid, text, date, numeric, numeric, smallint),
  public.submit_change_order(uuid, numeric, text),
  public.review_change_order(uuid, boolean),
  public.create_work_order(uuid, text, text, text, uuid, uuid, date),
  public.transition_work_order(uuid, public.work_order_status, text),
  public.add_work_log(uuid, date, text, smallint, text[], uuid),
  public.submit_cost_item(uuid, uuid, public.cost_category, text, text, numeric, numeric, date, public.cost_source, uuid),
  public.review_cost_item(uuid, boolean, text),
  public.submit_invoice(uuid, text, date, numeric, numeric),
  public.review_invoice(uuid, boolean, text),
  public.record_payment(uuid, numeric, date, text),
  public.register_document(uuid, text, uuid, text, text, text, integer),
  public.my_org_role(uuid), public.has_org_role(uuid, public.org_role[]), public.is_org_member(uuid),
  public.can_read_org_finance(uuid), public.is_org_staff(uuid), public.my_contractor_id(uuid)
to authenticated;
