-- RoadShield AI — citizen-facing RPCs (report submission, confirmations, reads)

create index if not exists hazards_lat_lng_idx on public.hazards (latitude, longitude);

-- Submit a hazard report. Idempotent per (reporter, client_draft_id) so offline retries
-- never create duplicates. AI results are only stored when signed by the AI service.
create or replace function public.submit_hazard_report(
  p_client_draft_id uuid,
  p_category public.hazard_category,
  p_severity public.hazard_severity,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_source text default 'gps',
  p_location_accuracy_m real default null,
  p_address text default null,
  p_city text default null,
  p_images jsonb default '[]'::jsonb,
  p_ai_payload text default null,
  p_ai_signature text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.hazards;
  v_hazard public.hazards;
  v_secret text;
  v_ai jsonb;
  v_ai_id uuid;
  v_ai_top public.hazard_category;
  v_ai_verified boolean := false;
  v_img jsonb;
  v_path text;
  v_index integer := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.suspended_at is not null) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;
  if p_client_draft_id is null then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'client_draft_id';
  end if;

  select * into v_existing from public.hazards h
  where h.reporter_id = v_uid and h.client_draft_id = p_client_draft_id;
  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'public_code', v_existing.public_code,
      'status', v_existing.status, 'already_submitted', true,
      'ai_verified', v_existing.ai_detection_id is not null
    );
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'INVALID_LOCATION' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'description';
  end if;
  if coalesce(p_location_source, '') not in ('gps', 'manual') then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'location_source';
  end if;
  if p_images is null or jsonb_typeof(p_images) <> 'array'
     or jsonb_array_length(p_images) < 1 or jsonb_array_length(p_images) > 6 then
    raise exception 'IMAGES_REQUIRED' using errcode = 'P0001';
  end if;

  perform app_private.enforce_rate_limit('submit_report_hour', 10, interval '1 hour');
  perform app_private.enforce_rate_limit('submit_report_day', 30, interval '1 day');

  -- Verify the AI result signature (HMAC-SHA256 over the exact payload string).
  if p_ai_payload is not null and p_ai_signature is not null then
    select s.value into v_secret from app_private.settings s where s.key = 'ai_signing_secret';
    if v_secret is not null
       and encode(extensions.hmac(p_ai_payload, v_secret, 'sha256'), 'hex') = lower(p_ai_signature) then
      v_ai_verified := true;
    end if;
  end if;

  insert into public.hazards (
    public_code, reporter_id, client_draft_id, category, severity, description,
    latitude, longitude, location, location_source, location_accuracy_m, address, city
  ) values (
    'RS-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.hazard_code_seq')::text, 5, '0'),
    v_uid, p_client_draft_id, p_category, p_severity, btrim(coalesce(p_description, '')),
    p_latitude, p_longitude,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_location_source, p_location_accuracy_m, left(btrim(p_address), 200), left(btrim(p_city), 80)
  )
  returning * into v_hazard;

  if v_ai_verified then
    v_ai := p_ai_payload::jsonb;
    v_ai_id := (v_ai ->> 'detection_id')::uuid;
    if (v_ai ->> 'top_category') in ('pothole', 'crack', 'surface_damage') then
      v_ai_top := (v_ai ->> 'top_category')::public.hazard_category;
    end if;

    insert into public.ai_detections (
      id, requested_by, hazard_id, model_name, model_version, image_sha256,
      top_category, top_confidence, detections, inference_ms,
      signature_verified, user_accepted_category, analyzed_at
    ) values (
      v_ai_id, v_uid, v_hazard.id, v_ai ->> 'model_name', v_ai ->> 'model_version', v_ai ->> 'image_sha256',
      v_ai_top, (v_ai ->> 'top_confidence')::real, coalesce(v_ai -> 'detections', '[]'::jsonb),
      (v_ai ->> 'inference_ms')::integer, true, v_ai_top is not distinct from p_category,
      (v_ai ->> 'analyzed_at')::timestamptz
    )
    on conflict (id) do nothing;

    if found then
      update public.hazards set ai_detection_id = v_ai_id where id = v_hazard.id;
    else
      v_ai_verified := false;
    end if;
  end if;

  for v_img in select value from jsonb_array_elements(p_images) loop
    v_path := v_img ->> 'path';
    if v_path is null or split_part(v_path, '/', 1) <> v_uid::text then
      raise exception 'INVALID_IMAGE_PATH' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'hazard-images' and o.name = v_path
    ) then
      raise exception 'IMAGE_NOT_UPLOADED' using errcode = 'P0001', detail = v_path;
    end if;

    insert into public.hazard_images (
      hazard_id, uploader_id, storage_path, kind, privacy_blurred, width, height
    ) values (
      v_hazard.id, v_uid, v_path,
      case when v_index = 0 then 'report'::public.image_kind else 'additional'::public.image_kind end,
      coalesce((v_img ->> 'privacy_blurred')::boolean, false),
      nullif((v_img ->> 'width')::integer, 0),
      nullif((v_img ->> 'height')::integer, 0)
    );
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object(
    'id', v_hazard.id, 'public_code', v_hazard.public_code, 'status', v_hazard.status,
    'already_submitted', false, 'ai_verified', v_ai_verified, 'image_count', v_index
  );
end;
$$;

-- Independent confirmation that a public hazard is still present (or gone).
create or replace function public.confirm_hazard(p_hazard_id uuid, p_still_present boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_h public.hazards;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into v_h from public.hazards where id = p_hazard_id;
  if not found or v_h.status not in ('verified', 'assigned', 'in_progress') then
    raise exception 'HAZARD_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_h.reporter_id = v_uid then
    raise exception 'CANNOT_CONFIRM_OWN' using errcode = 'P0001';
  end if;

  perform app_private.enforce_rate_limit('confirm_hazard', 40, interval '1 hour');

  insert into public.hazard_confirmations (hazard_id, user_id, still_present)
  values (p_hazard_id, v_uid, coalesce(p_still_present, true))
  on conflict (hazard_id, user_id) do update
    set still_present = excluded.still_present, created_at = now();

  return jsonb_build_object(
    'hazard_id', p_hazard_id,
    'confirmations_count', (select h.confirmations_count from public.hazards h where h.id = p_hazard_id),
    'still_present', coalesce(p_still_present, true)
  );
end;
$$;

-- A reporter (or someone who confirmed it) can reopen a resolved hazard that came back.
create or replace function public.request_reopen(p_hazard_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_h public.hazards;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into v_h from public.hazards where id = p_hazard_id for update;
  if not found or v_h.status <> 'resolved' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if not (
    v_h.reporter_id = v_uid
    or exists (select 1 from public.hazard_confirmations c where c.hazard_id = p_hazard_id and c.user_id = v_uid)
    or public.is_staff()
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'note';
  end if;

  perform app_private.enforce_rate_limit('request_reopen', 5, interval '1 day');
  perform set_config('app.status_note', coalesce(p_note, ''), true);

  update public.hazards set status = 'reopened', resolved_at = null where id = p_hazard_id;
  perform app_private.audit('hazard.reopen_requested', 'hazard', p_hazard_id::text,
                            jsonb_build_object('note', p_note));

  return jsonb_build_object('id', p_hazard_id, 'status', 'reopened');
end;
$$;

-- Public, verified, active hazards around a point (map list, home "nearby", warnings).
create or replace function public.nearby_hazards(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 2000,
  p_limit integer default 50
)
returns table (
  id uuid, public_code text, category public.hazard_category, severity public.hazard_severity,
  status public.report_status, latitude double precision, longitude double precision,
  address text, city text, confirmations_count integer, created_at timestamptz,
  verified_at timestamptz, distance_m double precision, priority jsonb
)
language sql stable security invoker set search_path = ''
as $$
  select h.id, h.public_code, h.category, h.severity, h.status, h.latitude, h.longitude,
         h.address, h.city, h.confirmations_count, h.created_at, h.verified_at,
         extensions.st_distance(
           h.location,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
         ) as distance_m,
         public.priority(h)
  from public.hazards h
  where h.status in ('verified', 'assigned', 'in_progress')
    and extensions.st_dwithin(
      h.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      least(greatest(coalesce(p_radius_m, 2000), 50), 50000)
    )
  order by distance_m
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Public, verified, active hazards inside a map viewport (or a route bounding box).
create or replace function public.hazards_in_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_categories public.hazard_category[] default null,
  p_limit integer default 1000
)
returns table (
  id uuid, public_code text, category public.hazard_category, severity public.hazard_severity,
  status public.report_status, latitude double precision, longitude double precision,
  address text, city text, confirmations_count integer, created_at timestamptz,
  verified_at timestamptz, priority jsonb
)
language sql stable security invoker set search_path = ''
as $$
  select h.id, h.public_code, h.category, h.severity, h.status, h.latitude, h.longitude,
         h.address, h.city, h.confirmations_count, h.created_at, h.verified_at,
         public.priority(h)
  from public.hazards h
  where h.status in ('verified', 'assigned', 'in_progress')
    and h.latitude between p_min_lat and p_max_lat
    and (
      (p_min_lng <= p_max_lng and h.longitude between p_min_lng and p_max_lng)
      or (p_min_lng > p_max_lng and (h.longitude >= p_min_lng or h.longitude <= p_max_lng))
    )
    and (p_categories is null or h.category = any (p_categories))
  order by h.verified_at desc nulls last
  limit least(greatest(coalesce(p_limit, 1000), 1), 2000);
$$;

-- Duplicate suggestions before submitting: open hazards the caller can see, close by.
create or replace function public.find_possible_duplicates(
  p_lat double precision,
  p_lng double precision,
  p_category public.hazard_category default null,
  p_radius_m integer default 50
)
returns table (
  id uuid, public_code text, category public.hazard_category, severity public.hazard_severity,
  status public.report_status, latitude double precision, longitude double precision,
  created_at timestamptz, distance_m double precision, same_category boolean, is_mine boolean
)
language sql stable security invoker set search_path = ''
as $$
  select h.id, h.public_code, h.category, h.severity, h.status, h.latitude, h.longitude, h.created_at,
         extensions.st_distance(
           h.location,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
         ) as distance_m,
         (p_category is not null and h.category = p_category) as same_category,
         (h.reporter_id = auth.uid()) as is_mine
  from public.hazards h
  where h.status in ('submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'reopened')
    and extensions.st_dwithin(
      h.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      least(greatest(coalesce(p_radius_m, 50), 10), 300)
    )
  order by same_category desc, distance_m
  limit 5;
$$;

create or replace function public.my_report_stats()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where h.status in ('submitted', 'under_review', 'reopened')),
    'active', count(*) filter (where h.status in ('verified', 'assigned', 'in_progress')),
    'resolved', count(*) filter (where h.status = 'resolved'),
    'closed', count(*) filter (where h.status in ('rejected', 'duplicate')),
    'confirmations_given', (
      select count(*) from public.hazard_confirmations c where c.user_id = auth.uid()
    )
  )
  from public.hazards h
  where h.reporter_id = auth.uid();
$$;

-- Recent status changes on the caller's own reports (home "maintenance updates" feed).
create or replace function public.my_activity(p_limit integer default 20)
returns table (
  hazard_id uuid, public_code text, category public.hazard_category,
  from_status public.report_status, to_status public.report_status,
  note text, created_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select s.hazard_id, h.public_code, h.category, s.from_status, s.to_status, s.note, s.created_at
  from public.status_history s
  join public.hazards h on h.id = s.hazard_id
  where h.reporter_id = auth.uid()
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.register_push_token(
  p_token text, p_platform text, p_device_name text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'token';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'platform';
  end if;

  insert into public.device_push_tokens (user_id, token, platform, device_name)
  values (auth.uid(), p_token, p_platform, left(p_device_name, 100))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_name = excluded.device_name,
        last_seen_at = now(),
        disabled_at = null;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
