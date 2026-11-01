-- RoadShield AI — status history, reporter + nearby notifications, push dispatch trigger

-- nearby alerts: users whose saved places are within their chosen radius of a newly verified hazard
create or replace function app_private.notify_nearby_users(p_hazard public.hazards)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct on (s.user_id)
      s.user_id, s.label,
      round(extensions.st_distance(s.location, p_hazard.location))::integer as dist
    from public.saved_locations s
    join public.profiles p on p.id = s.user_id
    where p.notify_nearby
      and s.user_id is distinct from p_hazard.reporter_id
      and extensions.st_dwithin(s.location, p_hazard.location, p.nearby_radius_m)
    order by s.user_id, extensions.st_distance(s.location, p_hazard.location)
  loop
    perform app_private.notify(
      r.user_id, 'nearby_hazard',
      'Verified hazard near ' || r.label,
      'A ' || app_private.category_label(p_hazard.category, 'en') || ' was verified about '
        || r.dist || ' m from your saved place.',
      'خطر مؤكد بالقرب من ' || r.label,
      'تم التحقق من ' || app_private.category_label(p_hazard.category, 'ar') || ' على بُعد نحو '
        || r.dist || ' متر من مكانك المحفوظ.',
      jsonb_build_object('hazard_id', p_hazard.id, 'public_code', p_hazard.public_code)
    );
  end loop;
end;
$$;

-- status history + reporter notifications
create or replace function app_private.on_hazard_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_note text := nullif(current_setting('app.status_note', true), '');
  v_type public.notification_type;
  v_title_en text;
  v_body_en text;
  v_title_ar text;
  v_body_ar text;
begin
  if tg_op = 'INSERT' then
    insert into public.status_history (hazard_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, auth.uid(), null);

    if new.reporter_id is not null then
      perform app_private.notify(
        new.reporter_id, 'report_confirmation',
        'Report received',
        'Your report ' || new.public_code || ' was received and is waiting for review.',
        'تم استلام البلاغ',
        'تم استلام بلاغك ' || new.public_code || ' وهو بانتظار المراجعة.',
        jsonb_build_object('hazard_id', new.id, 'public_code', new.public_code)
      );
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.status_history (hazard_id, from_status, to_status, changed_by, note)
  values (new.id, old.status, new.status, auth.uid(), v_note);

  if new.reporter_id is not null and new.reporter_id is distinct from auth.uid() then
    if new.status = 'resolved' then
      v_type := 'report_resolved';
      v_title_en := 'Hazard resolved';
      v_body_en := 'Thank you for reporting. ' || new.public_code || ' has been marked as resolved.';
      v_title_ar := 'تم حل البلاغ';
      v_body_ar := 'شكرًا لإبلاغك. تم تعليم البلاغ ' || new.public_code || ' على أنه تم حله.';
    else
      v_type := case when new.status in ('assigned', 'in_progress')
                     then 'maintenance_progress'::public.notification_type
                     else 'verification_update'::public.notification_type end;
      v_title_en := 'Update on ' || new.public_code;
      v_body_en := 'Your report is now: ' || app_private.status_label(new.status, 'en') || '.';
      v_title_ar := 'تحديث على البلاغ ' || new.public_code;
      v_body_ar := 'أصبحت حالة بلاغك: ' || app_private.status_label(new.status, 'ar') || '.';
    end if;

    perform app_private.notify(
      new.reporter_id, v_type, v_title_en, v_body_en, v_title_ar, v_body_ar,
      jsonb_build_object('hazard_id', new.id, 'public_code', new.public_code, 'status', new.status)
    );
  end if;

  if new.status = 'verified' and old.status in ('submitted', 'under_review', 'reopened') then
    perform app_private.notify_nearby_users(new);
  end if;

  return new;
end;
$$;

create trigger hazards_status_insert after insert on public.hazards
  for each row execute function app_private.on_hazard_status();
create trigger hazards_status_update after update of status on public.hazards
  for each row execute function app_private.on_hazard_status();

-- push dispatch: every in-app notification is handed to the push-dispatch Edge Function via pg_net.
create or replace function app_private.dispatch_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from app_private.settings where key = 'push_dispatch_url';
  select value into v_secret from app_private.settings where key = 'push_dispatch_secret';

  if v_url is null or v_secret is null then
    update public.notifications
    set push_status = 'skipped', push_error = 'push dispatch not configured'
    where id = new.id;
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    timeout_milliseconds := 8000
  );
  return null;
end;
$$;

create trigger notifications_dispatch after insert on public.notifications
  for each row execute function app_private.dispatch_push();
