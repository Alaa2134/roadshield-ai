-- Fix invitation privilege paths in accept_invitation (release-gate finding, issue #11).
-- 1. The inviter must still be an owner of the org when the invitation is accepted, so an
--    owner who was removed or demoted cannot leave behind a working invitation.
-- 2. Acceptance never changes an existing member's role (no ON CONFLICT DO UPDATE). Role changes
--    go only through set_member_role, which enforces LAST_OWNER. This closes the last-owner
--    demotion path (sole owner invites their own e-mail as a lower role).
-- create or replace keeps the existing owner, grants and search_path = ''.

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
  -- Inviter must still hold owner membership now (row share lock blocks a concurrent removal).
  if v_inv.invited_by is null or not exists (
       select 1 from public.org_members m
       where m.org_id = v_inv.org_id and m.user_id = v_inv.invited_by and m.role = 'owner' for share) then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;
  -- Existing members cannot change role through an invitation.
  if exists (select 1 from public.org_members m where m.org_id = v_inv.org_id and m.user_id = auth.uid()) then
    raise exception 'ALREADY_MEMBER' using errcode = 'P0001';
  end if;
  insert into public.org_members (org_id, user_id, role, contractor_id, invited_by)
  values (v_inv.org_id, auth.uid(), v_inv.role, v_inv.contractor_id, v_inv.invited_by);
  update public.org_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  perform app_private.audit_org(v_inv.org_id, 'member.join', 'org_member', auth.uid()::text,
    jsonb_build_object('role', v_inv.role));
  return v_inv.org_id;
end;
$$;
