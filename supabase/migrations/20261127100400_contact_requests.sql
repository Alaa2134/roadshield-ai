-- RoadShield — public website contact / demo requests.
-- Anonymous visitors may submit through a rate-limited RPC; only platform admins can read.

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('contact', 'demo')),
  interest text not null default 'other' check (interest in ('demo', 'pilot', 'partnership', 'security', 'other')),
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  organization text check (char_length(organization) <= 160),
  country text check (char_length(country) <= 80),
  job_role text check (char_length(job_role) <= 120),
  message text not null default '' check (char_length(message) <= 4000),
  locale text not null default 'en' check (locale in ('en', 'ar')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed', 'spam')),
  created_at timestamptz not null default now()
);
create index contact_requests_created_idx on public.contact_requests (created_at desc);
create index contact_requests_email_idx on public.contact_requests (lower(email), created_at desc);

alter table public.contact_requests enable row level security;
create policy contact_requests_admin_select on public.contact_requests for select to authenticated
  using ((select public.is_admin()));
grant select on public.contact_requests to authenticated;
revoke all on public.contact_requests from anon;

create or replace function public.submit_contact_request(
  p_kind text, p_interest text, p_full_name text, p_email text, p_organization text default null,
  p_country text default null, p_job_role text default null, p_message text default '', p_locale text default 'en'
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  -- Abuse limits (no user id for anonymous callers): 3 per e-mail per hour, 200 per hour overall.
  if (select count(*) from public.contact_requests where lower(email) = lower(trim(p_email))
      and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.contact_requests where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into public.contact_requests (kind, interest, full_name, email, organization, country, job_role, message, locale)
  values (p_kind, coalesce(nullif(p_interest, ''), 'other'), trim(p_full_name), lower(trim(p_email)),
          nullif(trim(p_organization), ''), nullif(trim(p_country), ''), nullif(trim(p_job_role), ''),
          coalesce(trim(p_message), ''), case when p_locale = 'ar' then 'ar' else 'en' end)
  returning id into v_id;
  return v_id;
exception when check_violation then
  raise exception 'INVALID_INPUT' using errcode = 'P0001';
end;
$$;
revoke execute on function public.submit_contact_request(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_request(text, text, text, text, text, text, text, text, text) to anon, authenticated;
