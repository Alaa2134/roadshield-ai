-- RoadShield AI — audit/notification helpers, signup trigger, table triggers

create or replace function app_private.audit(
  p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb
)
returns void language sql security definer set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function app_private.notify(
  p_user_id uuid, p_type public.notification_type,
  p_title_en text, p_body_en text, p_title_ar text, p_body_ar text,
  p_data jsonb default '{}'::jsonb
)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, type, title_en, body_en, title_ar, body_ar, data)
  values (p_user_id, p_type, p_title_en, p_body_en, p_title_ar, p_body_ar, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function app_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80),
    case when new.raw_user_meta_data ->> 'locale' = 'ar' then 'ar' else 'en' end
  );
  insert into public.user_roles (user_id, role) values (new.id, 'citizen');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------------------------------------------------------------- table triggers
create trigger profiles_touch before update on public.profiles
  for each row execute function app_private.touch_updated_at();
create trigger hazards_touch before update on public.hazards
  for each row execute function app_private.touch_updated_at();
create trigger tasks_touch before update on public.maintenance_tasks
  for each row execute function app_private.touch_updated_at();

create trigger hazards_location before insert or update of latitude, longitude on public.hazards
  for each row execute function app_private.set_point_location();
create trigger saved_locations_location before insert or update of latitude, longitude on public.saved_locations
  for each row execute function app_private.set_point_location();

create or replace function app_private.limit_saved_locations()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.saved_locations where user_id = new.user_id) >= 10 then
    raise exception 'SAVED_LOCATIONS_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger saved_locations_limit before insert on public.saved_locations
  for each row execute function app_private.limit_saved_locations();

-- confirmations counter (only "still present" confirmations count as independent reports)
create or replace function app_private.refresh_confirmations()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_hazard uuid := coalesce(new.hazard_id, old.hazard_id);
begin
  update public.hazards
  set confirmations_count = (
    select count(*) from public.hazard_confirmations c
    where c.hazard_id = v_hazard and c.still_present
  )
  where id = v_hazard;
  return null;
end;
$$;
create trigger confirmations_refresh after insert or update or delete on public.hazard_confirmations
  for each row execute function app_private.refresh_confirmations();
