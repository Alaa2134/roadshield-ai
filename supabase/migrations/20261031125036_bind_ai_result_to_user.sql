-- Bind signed AI results to the user they were issued to (prevents cross-account replay).
-- Re-creates submit_hazard_report unchanged except for the requested_by check.

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
      -- The AI service signs the caller's user id into the result; a result issued to
      -- someone else is not trusted (the report itself is still accepted).
      begin
        v_ai_verified := (p_ai_payload::jsonb ->> 'requested_by') = v_uid::text;
      exception when others then
        v_ai_verified := false;
      end;
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

