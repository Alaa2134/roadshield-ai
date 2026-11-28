-- Organization verification and administrative areas.
--
-- 1. Administrative areas (country → governorate → city/district). Egypt's 27 governorates are
--    seeded from ISO 3166-2:EG; cities/districts are added by platform admins or requested by an
--    organization (status 'requested') and become active when the organization is verified.
--    Other countries are supported by adding rows with their own ISO codes.
-- 2. A new organization starts as 'pending'. Until a platform admin verifies it, every
--    role-checked write RPC raises ORG_NOT_VERIFIED. Only setting up the profile, choosing the
--    jurisdiction, uploading verification documents and submitting them are allowed.
-- 3. Review: platform admins (user_roles.role = 'admin') approve or reject a submitted request.
--    The admin may not be a member or the creator of that organization (four-eyes); a rejection
--    needs a reason. Every step is audited.

-- ---------------------------------------------------------------- administrative areas
create table public.admin_areas (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  level text not null check (level in ('governorate', 'city', 'district')),
  parent_id uuid references public.admin_areas (id) on delete restrict,
  code text unique check (char_length(code) <= 12),            -- ISO 3166-2 for governorates
  name_en text not null check (char_length(name_en) between 2 and 120),
  name_ar text not null check (char_length(name_ar) between 2 and 120),
  status text not null default 'active' check (status in ('active', 'requested', 'rejected')),
  requested_by_org uuid,                                         -- FK added after organizations columns
  source text not null check (char_length(source) <= 200),
  created_at timestamptz not null default now(),
  constraint admin_areas_parent_chk check ((level = 'governorate') = (parent_id is null))
);
create index admin_areas_parent_idx on public.admin_areas (parent_id, status);
create index admin_areas_country_idx on public.admin_areas (country_code, level, status);
create unique index admin_areas_unique_name on public.admin_areas
  (country_code, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name_en))
  where status <> 'rejected';

insert into public.admin_areas (country_code, level, code, name_en, name_ar, source) values
  ('EG','governorate','EG-ALX','Alexandria','الإسكندرية','ISO 3166-2:EG'),
  ('EG','governorate','EG-ASN','Aswan','أسوان','ISO 3166-2:EG'),
  ('EG','governorate','EG-AST','Asyut','أسيوط','ISO 3166-2:EG'),
  ('EG','governorate','EG-BA','Red Sea','البحر الأحمر','ISO 3166-2:EG'),
  ('EG','governorate','EG-BH','Beheira','البحيرة','ISO 3166-2:EG'),
  ('EG','governorate','EG-BNS','Beni Suef','بني سويف','ISO 3166-2:EG'),
  ('EG','governorate','EG-C','Cairo','القاهرة','ISO 3166-2:EG'),
  ('EG','governorate','EG-DK','Dakahlia','الدقهلية','ISO 3166-2:EG'),
  ('EG','governorate','EG-DT','Damietta','دمياط','ISO 3166-2:EG'),
  ('EG','governorate','EG-FYM','Faiyum','الفيوم','ISO 3166-2:EG'),
  ('EG','governorate','EG-GH','Gharbia','الغربية','ISO 3166-2:EG'),
  ('EG','governorate','EG-GZ','Giza','الجيزة','ISO 3166-2:EG'),
  ('EG','governorate','EG-IS','Ismailia','الإسماعيلية','ISO 3166-2:EG'),
  ('EG','governorate','EG-JS','South Sinai','جنوب سيناء','ISO 3166-2:EG'),
  ('EG','governorate','EG-KB','Qalyubia','القليوبية','ISO 3166-2:EG'),
  ('EG','governorate','EG-KFS','Kafr El Sheikh','كفر الشيخ','ISO 3166-2:EG'),
  ('EG','governorate','EG-KN','Qena','قنا','ISO 3166-2:EG'),
  ('EG','governorate','EG-LX','Luxor','الأقصر','ISO 3166-2:EG'),
  ('EG','governorate','EG-MN','Minya','المنيا','ISO 3166-2:EG'),
  ('EG','governorate','EG-MNF','Monufia','المنوفية','ISO 3166-2:EG'),
  ('EG','governorate','EG-MT','Matrouh','مطروح','ISO 3166-2:EG'),
  ('EG','governorate','EG-PTS','Port Said','بورسعيد','ISO 3166-2:EG'),
  ('EG','governorate','EG-SHG','Sohag','سوهاج','ISO 3166-2:EG'),
  ('EG','governorate','EG-SHR','Sharqia','الشرقية','ISO 3166-2:EG'),
  ('EG','governorate','EG-SIN','North Sinai','شمال سيناء','ISO 3166-2:EG'),
  ('EG','governorate','EG-SUZ','Suez','السويس','ISO 3166-2:EG'),
  ('EG','governorate','EG-WAD','New Valley','الوادي الجديد','ISO 3166-2:EG');

-- The pilot city (New Damietta) as the first city-level area.
insert into public.admin_areas (country_code, level, parent_id, name_en, name_ar, source)
select 'EG', 'city', id, 'New Damietta', 'دمياط الجديدة', 'RoadShield pilot area'
from public.admin_areas where code = 'EG-DT';

alter table public.admin_areas enable row level security;
grant select on public.admin_areas to authenticated;
revoke all on public.admin_areas from anon;

-- ---------------------------------------------------------------- organization verification
alter table public.organizations
  add column verification_status text not null default 'pending'
    check (verification_status in ('pending', 'submitted', 'verified', 'rejected', 'suspended')),
  add column verification_note text check (char_length(verification_note) <= 1000),
  add column verification_submitted_at timestamptz,
  add column verified_at timestamptz,
  add column verified_by uuid references public.profiles (id) on delete set null,
  add column governorate_id uuid references public.admin_areas (id) on delete restrict,
  add column city_area_id uuid references public.admin_areas (id) on delete restrict;

-- Organizations created before verification existed keep working (none exist in production
-- when this migration is written; this protects local/staging data).
update public.organizations set verification_status = 'verified', verified_at = now();

alter table public.admin_areas add constraint admin_areas_requested_by_org_fk
  foreign key (requested_by_org) references public.organizations (id) on delete cascade;

-- Active areas are visible to every signed-in user; requested ones only to the requesting
-- organization's members and platform admins.
create policy admin_areas_select on public.admin_areas for select to authenticated
  using (
    status = 'active'
    or (select public.is_admin())
    or (requested_by_org is not null and (select public.is_org_member(requested_by_org)))
  );

-- Verification documents are org_documents with entity_type 'organization' (entity_id = org).
alter table public.org_documents drop constraint org_documents_entity_type_check;
alter table public.org_documents add constraint org_documents_entity_type_check check (entity_type in
  ('organization', 'road', 'inspection', 'project', 'contract', 'invoice', 'cost_item', 'work_order', 'payment', 'unit_rate'));
alter table public.org_documents add column doc_kind text check (doc_kind in
  ('official_letter', 'registration', 'authorization', 'representative_id', 'other'));

-- Owners see their organization's verification documents; platform admins see all of them
-- (needed to review). Existing policy org_documents_select still covers everything else.
create policy org_documents_verification_select on public.org_documents for select to authenticated
  using (
    entity_type = 'organization'
    and ((select public.has_org_role(org_id, array['owner']::public.org_role[])) or (select public.is_admin()))
  );

-- ---------------------------------------------------------------- gating helpers
-- Role check without the verification requirement: only for setup actions.
create or replace function app_private.require_org_role_any_status(p_org uuid, p_roles public.org_role[])
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

-- Every existing write RPC calls require_org_role, so redefining it gates all of them.
create or replace function app_private.require_org_role(p_org uuid, p_roles public.org_role[])
returns public.org_role
language plpgsql stable security definer set search_path = ''
as $$
declare v_role public.org_role; v_status text;
begin
  v_role := app_private.require_org_role_any_status(p_org, p_roles);
  select o.verification_status into v_status from public.organizations o where o.id = p_org;
  if v_status is distinct from 'verified' then
    raise exception 'ORG_NOT_VERIFIED' using errcode = 'P0001', hint = coalesce(v_status, 'unknown');
  end if;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------- setup RPCs (allowed before verification)
drop function public.create_organization(text, text, text, text, text, text, text, text, text, text);
create function public.create_organization(
  p_name text, p_slug text, p_country_code text, p_currency text,
  p_timezone text default 'UTC', p_org_type text default 'municipality',
  p_city text default null, p_region text default null, p_name_ar text default null,
  p_locale text default 'en', p_governorate uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_gov public.admin_areas;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  perform app_private.enforce_rate_limit('create_organization', 5, interval '1 day');
  if p_governorate is not null then
    select * into v_gov from public.admin_areas
    where id = p_governorate and level = 'governorate' and status = 'active' and country_code = upper(p_country_code);
    if v_gov.id is null then raise exception 'INVALID_AREA' using errcode = 'P0001'; end if;
  end if;

  insert into public.organizations (name, slug, country_code, default_currency, timezone, org_type,
                                    city, region, name_ar, default_locale, created_by,
                                    verification_status, governorate_id)
  values (trim(p_name), lower(trim(p_slug)), upper(p_country_code), upper(p_currency),
          coalesce(nullif(trim(p_timezone), ''), 'UTC'), p_org_type, nullif(trim(p_city), ''),
          coalesce(v_gov.name_en, nullif(trim(p_region), '')), nullif(trim(p_name_ar), ''),
          coalesce(p_locale, 'en'), auth.uid(), 'pending', v_gov.id)
  returning id into v_id;

  insert into public.org_members (org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform app_private.audit_org(v_id, 'org.create', 'organization', v_id::text,
    jsonb_build_object('name', p_name, 'country', upper(p_country_code), 'governorate', v_gov.code));
  return v_id;
exception when unique_violation then
  raise exception 'SLUG_TAKEN' using errcode = 'P0001';
end;
$$;

create or replace function public.update_organization(p_org uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.require_org_role_any_status(p_org, array['owner']::public.org_role[]);
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

create or replace function public.set_service_area(p_org uuid, p_geojson jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_geom extensions.geometry;
begin
  perform app_private.require_org_role_any_status(p_org, array['owner']::public.org_role[]);
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

-- Choose governorate and (optionally) an existing city, or request a new city/district.
-- Locked once the organization is verified (a platform admin must re-open it).
create or replace function public.set_org_jurisdiction(
  p_org uuid, p_governorate uuid, p_city uuid default null,
  p_new_area_en text default null, p_new_area_ar text default null, p_new_area_level text default 'city'
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_o public.organizations; v_gov public.admin_areas; v_city public.admin_areas;
begin
  perform app_private.require_org_role_any_status(p_org, array['owner']::public.org_role[]);
  select * into v_o from public.organizations where id = p_org for update;
  if v_o.verification_status in ('verified', 'submitted', 'suspended') then
    raise exception 'JURISDICTION_LOCKED' using errcode = 'P0001', hint = v_o.verification_status;
  end if;
  select * into v_gov from public.admin_areas
  where id = p_governorate and level = 'governorate' and status = 'active' and country_code = v_o.country_code;
  if v_gov.id is null then raise exception 'INVALID_AREA' using errcode = 'P0001'; end if;

  if p_city is not null then
    select * into v_city from public.admin_areas
    where id = p_city and parent_id = v_gov.id and level in ('city', 'district')
      and (status = 'active' or (status = 'requested' and requested_by_org = p_org));
    if v_city.id is null then raise exception 'INVALID_AREA' using errcode = 'P0001'; end if;
  elsif nullif(trim(p_new_area_en), '') is not null then
    if nullif(trim(p_new_area_ar), '') is null or coalesce(p_new_area_level, 'city') not in ('city', 'district') then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'new area needs English and Arabic names';
    end if;
    -- One open request per organization: replace an earlier unreviewed request.
    delete from public.admin_areas where requested_by_org = p_org and status = 'requested';
    begin
      insert into public.admin_areas (country_code, level, parent_id, name_en, name_ar, status, requested_by_org, source)
      values (v_o.country_code, coalesce(p_new_area_level, 'city'), v_gov.id, trim(p_new_area_en), trim(p_new_area_ar),
              'requested', p_org, 'Requested by organization ' || v_o.slug)
      returning * into v_city;
    exception when unique_violation then
      raise exception 'AREA_EXISTS' using errcode = 'P0001';
    end;
  end if;

  update public.organizations set governorate_id = v_gov.id, city_area_id = v_city.id,
    region = v_gov.name_en, city = coalesce(v_city.name_en, city)
  where id = p_org;
  perform app_private.audit_org(p_org, 'org.jurisdiction', 'organization', p_org::text,
    jsonb_build_object('governorate', v_gov.code, 'city', v_city.name_en, 'city_status', v_city.status));
  return v_city.id;
end;
$$;

-- Register an uploaded verification document (file already in storage under <org>/<uid>/...).
create or replace function public.register_verification_document(
  p_org uuid, p_doc_kind text, p_storage_path text, p_filename text, p_mime_type text, p_size_bytes integer
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_status text;
begin
  perform app_private.require_org_role_any_status(p_org, array['owner']::public.org_role[]);
  select verification_status into v_status from public.organizations where id = p_org;
  if v_status not in ('pending', 'rejected') then
    raise exception 'JURISDICTION_LOCKED' using errcode = 'P0001', hint = v_status;
  end if;
  if p_storage_path not like p_org::text || '/' || auth.uid()::text || '/%' then
    raise exception 'INVALID_PATH' using errcode = 'P0001';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', hint = 'pdf, jpeg or png';
  end if;
  insert into public.org_documents (org_id, entity_type, entity_id, storage_path, filename, mime_type, size_bytes,
                                    uploaded_by, doc_kind)
  values (p_org, 'organization', p_org, p_storage_path, left(p_filename, 200), p_mime_type, p_size_bytes,
          auth.uid(), p_doc_kind)
  returning id into v_id;
  perform app_private.audit_org(p_org, 'verification.document', 'organization', p_org::text,
    jsonb_build_object('doc_kind', p_doc_kind, 'filename', p_filename));
  return v_id;
end;
$$;

-- Owner submits for review: needs a governorate and at least an official letter and an
-- authorization document.
create or replace function public.submit_org_verification(p_org uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_o public.organizations;
begin
  perform app_private.require_org_role_any_status(p_org, array['owner']::public.org_role[]);
  select * into v_o from public.organizations where id = p_org for update;
  if v_o.verification_status not in ('pending', 'rejected') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_o.governorate_id is null
     or not exists (select 1 from public.org_documents d where d.org_id = p_org and d.entity_type = 'organization' and d.doc_kind = 'official_letter')
     or not exists (select 1 from public.org_documents d where d.org_id = p_org and d.entity_type = 'organization' and d.doc_kind = 'authorization') then
    raise exception 'VERIFICATION_INCOMPLETE' using errcode = 'P0001';
  end if;
  update public.organizations set verification_status = 'submitted', verification_submitted_at = now(),
    verification_note = null where id = p_org;
  perform app_private.audit_org(p_org, 'verification.submit', 'organization', p_org::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- platform-admin review
create or replace function public.review_org_verification(p_org uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_o public.organizations;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into v_o from public.organizations where id = p_org for update;
  if v_o.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_o.verification_status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if v_o.created_by = auth.uid() or exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid()) then
    raise exception 'FOUR_EYES_REQUIRED' using errcode = 'P0001';
  end if;
  if not p_approve and nullif(trim(p_note), '') is null then
    raise exception 'NOTE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.organizations set
    verification_status = case when p_approve then 'verified' else 'rejected' end,
    verification_note = left(nullif(trim(p_note), ''), 1000),
    verified_at = case when p_approve then now() else null end,
    verified_by = case when p_approve then auth.uid() else null end
  where id = p_org;
  update public.admin_areas set status = case when p_approve then 'active' else 'rejected' end
  where requested_by_org = p_org and status = 'requested';
  perform app_private.audit_org(p_org, case when p_approve then 'verification.approve' else 'verification.reject' end,
    'organization', p_org::text, jsonb_build_object('note', p_note));
end;
$$;

-- Suspend or reinstate a verified organization (platform admin; reason required).
create or replace function public.set_org_suspended(p_org uuid, p_suspended boolean, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if nullif(trim(p_note), '') is null then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  select verification_status into v_status from public.organizations where id = p_org for update;
  if v_status is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if (p_suspended and v_status <> 'verified') or (not p_suspended and v_status <> 'suspended') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.organizations set verification_status = case when p_suspended then 'suspended' else 'verified' end,
    verification_note = left(trim(p_note), 1000) where id = p_org;
  perform app_private.audit_org(p_org, case when p_suspended then 'org.suspend' else 'org.reinstate' end,
    'organization', p_org::text, jsonb_build_object('note', p_note));
end;
$$;

-- Review queue for platform admins.
create or replace function public.org_verification_queue(p_status text default 'submitted')
returns table (org_id uuid, name text, name_ar text, slug text, org_type text, country_code text,
               governorate_en text, governorate_ar text, city_en text, city_ar text, city_status text,
               creator_email text, verification_status text, submitted_at timestamptz, documents bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
    select o.id, o.name, o.name_ar, o.slug, o.org_type, o.country_code::text,
           g.name_en, g.name_ar, c.name_en, c.name_ar, c.status, u.email::text, o.verification_status,
           o.verification_submitted_at,
           (select count(*) from public.org_documents d where d.org_id = o.id and d.entity_type = 'organization'),
           o.created_at
    from public.organizations o
    left join public.admin_areas g on g.id = o.governorate_id
    left join public.admin_areas c on c.id = o.city_area_id
    left join auth.users u on u.id = o.created_by
    where o.verification_status = coalesce(p_status, o.verification_status)
    order by o.verification_submitted_at nulls last, o.created_at;
end;
$$;

-- Platform admins add official cities/districts directly.
create or replace function public.admin_add_area(p_parent uuid, p_level text, p_name_en text, p_name_ar text, p_source text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_parent public.admin_areas; v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into v_parent from public.admin_areas where id = p_parent and status = 'active';
  if v_parent.id is null or p_level not in ('city', 'district') then raise exception 'INVALID_AREA' using errcode = 'P0001'; end if;
  insert into public.admin_areas (country_code, level, parent_id, name_en, name_ar, source)
  values (v_parent.country_code, p_level, case when v_parent.level = 'governorate' then v_parent.id else v_parent.parent_id end,
          trim(p_name_en), trim(p_name_ar), left(coalesce(nullif(trim(p_source), ''), 'platform admin'), 200))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'AREA_EXISTS' using errcode = 'P0001';
end;
$$;

revoke execute on function
  public.create_organization(text, text, text, text, text, text, text, text, text, text, uuid),
  public.set_org_jurisdiction(uuid, uuid, uuid, text, text, text),
  public.register_verification_document(uuid, text, text, text, text, integer),
  public.submit_org_verification(uuid),
  public.review_org_verification(uuid, boolean, text),
  public.set_org_suspended(uuid, boolean, text),
  public.org_verification_queue(text),
  public.admin_add_area(uuid, text, text, text, text)
from public, anon;
grant execute on function
  public.create_organization(text, text, text, text, text, text, text, text, text, text, uuid),
  public.set_org_jurisdiction(uuid, uuid, uuid, text, text, text),
  public.register_verification_document(uuid, text, text, text, text, integer),
  public.submit_org_verification(uuid),
  public.review_org_verification(uuid, boolean, text),
  public.set_org_suspended(uuid, boolean, text),
  public.org_verification_queue(text),
  public.admin_add_area(uuid, text, text, text, text)
to authenticated;
