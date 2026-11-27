-- RoadShield release gate #14: serialize all owner removal/demotion operations per org.
-- Separate forward-only migration; do NOT rewrite already-applied 20261127100200.
--
-- Race without lock:
--   Tx A sees two owners -> demotes A
--   Tx B sees two owners -> removes B
--   both commit -> organization orphaned with zero owners.
--
-- Lock ordering is ALWAYS organizations -> org_members for these two RPCs.
-- The role check is repeated *after* acquiring the org lock so an owner removed
-- while waiting cannot exercise stale owner privileges.
-- PostgreSQL READ COMMITTED obtains a new statement snapshot for the owner count.
-- create or replace preserves existing function grants/security definer ACLs.

create or replace function public.set_member_role(
  p_org uuid, p_user uuid, p_role public.org_role, p_contractor_id uuid default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_old public.org_role;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  -- Serialize all owner-count-changing operations before locking target member.
  perform 1 from public.organizations where id = p_org for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

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
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  -- Must use the same lock order as set_member_role (org -> target member).
  perform 1 from public.organizations where id = p_org for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

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
