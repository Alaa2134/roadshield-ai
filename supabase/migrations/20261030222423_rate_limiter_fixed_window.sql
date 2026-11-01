-- RoadShield AI — fixed-window rate limiter and verified-email admin bootstrap

create table app_private.rate_counters (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, action)
);

-- Fixed-window rate limiter: one row per (user, action), reset when the window elapses.
create or replace function app_private.enforce_rate_limit(p_action text, p_max integer, p_window interval)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into app_private.rate_counters as rc (user_id, action, window_start, hits)
  values (auth.uid(), p_action, now(), 1)
  on conflict (user_id, action) do update
    set hits = case when rc.window_start < now() - p_window then 1 else rc.hits + 1 end,
        window_start = case when rc.window_start < now() - p_window then now() else rc.window_start end
  returning hits into v_hits;

  if v_hits > p_max then
    raise exception 'RATE_LIMITED' using errcode = 'P0001', hint = p_action;
  end if;
end;
$$;

alter table app_private.admin_bootstrap_emails add column consumed_at timestamptz;

-- An email listed in app_private.admin_bootstrap_emails becomes admin once that address
-- is verified. Each bootstrap entry can be used once.
create or replace function app_private.handle_email_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update app_private.admin_bootstrap_emails
    set consumed_at = now()
    where email = lower(new.email) and consumed_at is null;

    if found then
      update public.user_roles set role = 'admin', granted_at = now() where user_id = new.id;
      insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
      values (new.id, 'role.bootstrap_admin', 'user', new.id::text, '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function app_private.handle_email_confirmed();
