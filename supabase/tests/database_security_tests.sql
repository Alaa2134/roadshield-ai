-- RoadShield AI — database security & workflow tests.
--
-- Runs end-to-end scenarios as real Postgres roles (anon / authenticated with JWT claims),
-- exercising RLS, column privileges, RPC role checks, the report state machine,
-- notifications, rate limiting and the priority engine.
--
-- Everything runs inside one DO block that ALWAYS ends by raising an exception, so the
-- database is rolled back to exactly its prior state. The exception message carries the
-- results: "ROADSHIELD_TESTS passed=N failed=M :: [...]".
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/database_security_tests.sql
--   or paste into the Supabase SQL editor.

do $tests$
declare
  v_a uuid := gen_random_uuid();   -- citizen A (reporter)
  v_b uuid := gen_random_uuid();   -- citizen B
  v_o uuid := gen_random_uuid();   -- maintenance officer
  v_x uuid := gen_random_uuid();   -- admin
  v_draft uuid := gen_random_uuid();
  v_draft2 uuid := gen_random_uuid();
  v_draft3 uuid := gen_random_uuid();
  v_draft4 uuid := gen_random_uuid();
  v_draft5 uuid := gen_random_uuid();
  v_res jsonb;
  v_res2 jsonb;
  v_hazard uuid;
  v_task uuid;
  v_n integer;
  v_txt text;
  v_payload text;
  v_sig text;
  v_pass integer := 0;
  v_fail integer := 0;
  v_log text := '';

begin
  ---------------------------------------------------------------- setup (as owner)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-test-a@example.com', '{"full_name":"Test A"}', now(), now(), now()),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-test-b@example.com', '{"full_name":"Test B","locale":"ar"}', now(), now(), now()),
    (v_o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-test-o@example.com', '{"full_name":"Officer O"}', now(), now(), now()),
    (v_x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-test-x@example.com', '{"full_name":"Admin X"}', now(), now(), now());

  update public.user_roles set role = 'maintenance_officer' where user_id = v_o;
  update public.user_roles set role = 'admin' where user_id = v_x;

  insert into app_private.settings (key, value) values ('ai_signing_secret', 'test-signing-secret')
  on conflict (key) do update set value = excluded.value;

  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values
    ('hazard-images', v_a::text || '/' || v_draft::text || '/0.jpg', v_a::text, '{"mimetype":"image/jpeg"}'),
    ('hazard-images', v_a::text || '/' || v_draft2::text || '/0.jpg', v_a::text, '{"mimetype":"image/jpeg"}'),
    ('hazard-images', v_b::text || '/' || v_draft3::text || '/0.jpg', v_b::text, '{"mimetype":"image/jpeg"}'),
    ('hazard-images', v_a::text || '/' || v_draft4::text || '/0.jpg', v_a::text, '{"mimetype":"image/jpeg"}'),
    ('hazard-images', v_a::text || '/' || v_draft5::text || '/0.jpg', v_a::text, '{"mimetype":"image/jpeg"}');

  -- T01 profile + role created by signup trigger
  select count(*) into v_n from public.profiles where id in (v_a, v_b, v_o, v_x);
  if v_n = 4 and (select locale from public.profiles where id = v_b) = 'ar' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T01 signup trigger creates profile+role (locale ar)';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T01 profiles=' || v_n); end if;

  ---------------------------------------------------------------- citizen A
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T02 submit report
  v_res := public.submit_hazard_report(
    v_draft, 'pothole', 'high', 'Deep pothole near the roundabout', 31.4368, 31.6670, 'gps', 8,
    'Central district', 'New Damietta',
    jsonb_build_array(jsonb_build_object('path', v_a::text || '/' || v_draft::text || '/0.jpg', 'width', 1280, 'height', 960)));
  v_hazard := (v_res ->> 'id')::uuid;
  if v_res ->> 'status' = 'submitted' and v_res ->> 'public_code' like 'RS-____-_____' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || ('PASS T02 submit report -> ' || (v_res ->> 'public_code'));
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T02 ' || v_res::text); end if;

  -- T03 idempotent resubmission (offline retry) returns the same report
  v_res2 := public.submit_hazard_report(
    v_draft, 'pothole', 'high', 'retry', 31.4368, 31.6670, 'gps', 8, null, null,
    jsonb_build_array(jsonb_build_object('path', v_a::text || '/' || v_draft::text || '/0.jpg')));
  if (v_res2 ->> 'id')::uuid = v_hazard and (v_res2 ->> 'already_submitted')::boolean then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T03 idempotent resubmission';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T03 ' || v_res2::text); end if;

  -- T04 signed AI payload is accepted, tampered signature is ignored
  v_payload := json_build_object(
    'detection_id', gen_random_uuid(), 'requested_by', v_a, 'model_name', 'yolov8-rdd', 'model_version', 'test',
    'image_sha256', repeat('a', 64), 'top_category', 'crack', 'top_confidence', 0.81,
    'detections', '[]'::json, 'inference_ms', 120, 'analyzed_at', now())::text;
  execute 'reset role';
  v_sig := encode(extensions.hmac(v_payload, 'test-signing-secret', 'sha256'), 'hex');
  execute 'set local role authenticated';
  v_res := public.submit_hazard_report(
    v_draft2, 'crack', 'medium', '', 31.44, 31.66, 'manual', null, null, null,
    jsonb_build_array(jsonb_build_object('path', v_a::text || '/' || v_draft2::text || '/0.jpg')),
    v_payload, v_sig);
  if (v_res ->> 'ai_verified')::boolean then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T04a signed AI result stored';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T04a ' || v_res::text); end if;

  v_res := public.submit_hazard_report(
    v_draft4, 'crack', 'medium', '', 31.44, 31.66, 'manual', null, null, null,
    jsonb_build_array(jsonb_build_object('path', v_a::text || '/' || v_draft4::text || '/0.jpg')),
    replace(v_payload, '0.81', '0.99'), v_sig);
  if not (v_res ->> 'ai_verified')::boolean and v_res ->> 'status' = 'submitted' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T04b tampered AI payload not trusted (report still accepted)';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T04b ' || v_res::text); end if;

  -- T04c a correctly signed result issued to another user is not trusted
  v_payload := json_build_object(
    'detection_id', gen_random_uuid(), 'requested_by', v_b, 'model_name', 'yolov8-rdd', 'model_version', 'test',
    'image_sha256', repeat('b', 64), 'top_category', 'pothole', 'top_confidence', 0.77,
    'detections', '[]'::json, 'inference_ms', 90, 'analyzed_at', now())::text;
  execute 'reset role';
  v_sig := encode(extensions.hmac(v_payload, 'test-signing-secret', 'sha256'), 'hex');
  execute 'set local role authenticated';
  v_res := public.submit_hazard_report(
    v_draft5, 'pothole', 'high', '', 31.45, 31.67, 'manual', null, null, null,
    jsonb_build_array(jsonb_build_object('path', v_a::text || '/' || v_draft5::text || '/0.jpg')),
    v_payload, v_sig);
  if not (v_res ->> 'ai_verified')::boolean and v_res ->> 'status' = 'submitted' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T04c AI result issued to another user not trusted';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T04c ' || v_res::text); end if;

  -- T05 cannot attach another user's image
  begin
    perform public.submit_hazard_report(
      gen_random_uuid(), 'pothole', 'low', '', 31.44, 31.66, 'gps', null, null, null,
      jsonb_build_array(jsonb_build_object('path', v_b::text || '/' || v_draft3::text || '/0.jpg')));
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T05 foreign image accepted';
  exception when others then
    if sqlerrm = 'INVALID_IMAGE_PATH' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T05 foreign image path rejected';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T05 ' || sqlerrm); end if;
  end;

  -- T06 direct table writes are blocked
  begin
    insert into public.hazards (public_code, category, severity, latitude, longitude, location)
    values ('X', 'pothole', 'low', 0, 0, extensions.st_setsrid(extensions.st_makepoint(0, 0), 4326)::extensions.geography);
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T06a direct insert allowed';
  exception when insufficient_privilege then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T06a direct hazard insert denied';
  end;
  begin
    update public.hazards set status = 'verified' where id = v_hazard;
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T06b direct status update allowed';
  exception when insufficient_privilege then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T06b direct status update denied';
  end;

  -- T07 column privileges on profiles
  begin
    update public.profiles set suspended_at = null where id = v_a;
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T07a suspended_at writable';
  exception when insufficient_privilege then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T07a suspended_at not writable by user';
  end;
  update public.profiles set full_name = 'Alaa Test' where id = v_a;
  get diagnostics v_n = row_count;
  if v_n = 1 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T07b own name editable';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T07b'; end if;

  -- T08 citizen cannot moderate or read admin data
  begin
    perform public.transition_hazard(v_hazard, 'verified');
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T08a citizen moderated';
  exception when others then
    if sqlerrm = 'NOT_AUTHORIZED' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T08a citizen cannot moderate';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T08a ' || sqlerrm); end if;
  end;
  begin
    perform public.admin_metrics(30);
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T08b citizen read metrics';
  exception when others then
    if sqlerrm = 'NOT_AUTHORIZED' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T08b citizen cannot read admin metrics';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T08b ' || sqlerrm); end if;
  end;
  select count(*) into v_n from public.audit_logs;
  if v_n = 0 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T08c audit log hidden from citizen';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T08c audit visible'; end if;

  -- T09 reporter got an in-app confirmation notification
  select count(*) into v_n from public.notifications where type = 'report_confirmation';
  if v_n >= 3 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T09 report confirmation notifications';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T09 n=' || v_n); end if;

  execute 'reset role';

  ---------------------------------------------------------------- citizen B
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from public.hazards where id = v_hazard;
  if v_n = 0 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T10 unverified report hidden from other citizens';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T10 unverified visible'; end if;

  begin
    perform public.confirm_hazard(v_hazard, true);
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T11 confirmed unverified hazard';
  exception when others then
    if sqlerrm = 'HAZARD_NOT_ACTIVE' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T11 cannot confirm unverified hazard';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T11 ' || sqlerrm); end if;
  end;
  execute 'reset role';

  ---------------------------------------------------------------- admin X verifies
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_res := public.transition_hazard(v_hazard, 'verified', 'Confirmed by inspection', null, true);
  select count(*) into v_n from public.status_history where hazard_id = v_hazard;
  if v_res ->> 'status' = 'verified' and v_n = 2 then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T12 admin verifies; status history recorded';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T12 history=' || v_n); end if;

  begin
    perform public.transition_hazard(v_hazard, 'submitted');
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T13 invalid transition allowed';
  exception when others then
    if sqlerrm = 'INVALID_TRANSITION' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T13 state machine rejects verified->submitted';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T13 ' || sqlerrm); end if;
  end;
  execute 'reset role';

  select count(*) into v_n from public.notifications
  where user_id = v_a and type = 'verification_update';
  if v_n = 1 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T14 reporter notified of verification';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T14 n=' || v_n); end if;

  ---------------------------------------------------------------- citizen B after verification
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from public.hazards where id = v_hazard;
  if v_n = 1 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T15 verified hazard public';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T15'; end if;

  select count(*) into v_n from public.hazard_images where hazard_id = v_hazard;
  if v_n = 1 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T16 privacy-approved image visible';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T16 n=' || v_n); end if;

  select count(*) into v_n from public.nearby_hazards(31.4368, 31.6670, 500, 10);
  if v_n >= 1 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T17 nearby_hazards returns verified hazard';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T17'; end if;

  v_res := public.confirm_hazard(v_hazard, true);
  if (v_res ->> 'confirmations_count')::integer = 1 then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T18 independent confirmation counted';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T18 ' || v_res::text); end if;

  select count(*) into v_n from public.profiles;
  if v_n = 1 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T19 citizens only see their own profile';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T19 n=' || v_n); end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.confirm_hazard(v_hazard, true);
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T20 confirmed own report';
  exception when others then
    if sqlerrm = 'CANNOT_CONFIRM_OWN' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T20 cannot confirm own report';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T20 ' || sqlerrm); end if;
  end;
  execute 'reset role';

  ---------------------------------------------------------------- officer O
  perform set_config('request.jwt.claims', json_build_object('sub', v_o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from public.officer_queue('unassigned', null, null, 50, 0) q where q.hazard_id = v_hazard;
  if v_n = 1 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T21 verified hazard in officer unassigned queue';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T21'; end if;

  v_res := public.assign_hazard(v_hazard, null, null);
  v_task := (v_res ->> 'task_id')::uuid;
  if v_task is not null and (select status from public.hazards where id = v_hazard) = 'assigned' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T22 officer claims task; hazard assigned';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T22'; end if;

  begin
    perform public.admin_set_role(v_b, 'admin');
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T23 officer escalated a role';
  exception when others then
    if sqlerrm = 'NOT_AUTHORIZED' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T23 officer cannot change roles';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T23 ' || sqlerrm); end if;
  end;

  perform public.update_task(v_task, 'in_progress', 'Crew on site');
  perform public.update_task(v_task, 'completion_requested', 'Patched and compacted');
  if (select status from public.hazards where id = v_hazard) = 'in_progress' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T24 task progress drives hazard status';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T24'; end if;

  begin
    perform public.update_task(v_task, 'completed', null);
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T25 officer self-approved completion';
  exception when others then
    if sqlerrm = 'INVALID_TRANSITION' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T25 only admin approves completion';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T25 ' || sqlerrm); end if;
  end;
  execute 'reset role';

  ---------------------------------------------------------------- admin completes, citizen reopens
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.update_task(v_task, 'completed', 'Inspected and approved');
  execute 'reset role';
  if (select status from public.hazards where id = v_hazard) = 'resolved'
     and exists (select 1 from public.notifications where user_id = v_a and type = 'report_resolved') then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T26 admin approval resolves hazard; reporter notified';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T26'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_res := public.request_reopen(v_hazard, 'It is back after the rain');
  execute 'reset role';
  if v_res ->> 'status' = 'reopened' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T27 reporter reopens resolved hazard';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T27'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.admin_set_role(v_x, 'citizen');
    -- other admins may exist in a live project; only assert when X is the last admin
    if (select count(*) from public.user_roles where role = 'admin') = 0 then
      v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T28 last admin demoted';
    else
      v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T28 (other admins exist; demotion allowed)';
    end if;
  exception when others then
    if sqlerrm = 'LAST_ADMIN' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T28 last admin cannot be demoted';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T28 ' || sqlerrm); end if;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_res := public.admin_metrics(30);
  if (v_res -> 'totals' ->> 'total_reports')::integer >= 2 and jsonb_array_length(v_res -> 'daily') = 30 then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T29 admin metrics computed from stored data';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T29 ' || left(v_res::text, 200)); end if;
  select count(*) into v_n from public.audit_logs where entity_id = v_hazard::text;
  if v_n >= 2 then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T30 audit trail written';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T30 n=' || v_n); end if;
  execute 'reset role';

  ---------------------------------------------------------------- priority engine (deterministic)
  v_res := public.compute_priority('high', 2, '2026-01-01T00:00:00Z', null, 'verified', '2026-01-11T12:00:00Z');
  if (v_res ->> 'score')::integer = 62 and v_res ->> 'level' = 'medium' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T31 priority high/2 conf/10 days/no traffic = 62 medium';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T31 ' || v_res::text); end if;

  v_res := public.compute_priority('critical', 5, '2026-01-01T00:00:00Z', 5::smallint, 'verified', '2026-03-01T00:00:00Z');
  if (v_res ->> 'score')::integer = 100 and v_res ->> 'level' = 'high' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T32 priority maximum = 100 high';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T32 ' || v_res::text); end if;

  v_res := public.compute_priority('low', 0, '2026-01-01T00:00:00Z', 1::smallint, 'in_progress', '2026-01-01T06:00:00Z');
  if (v_res ->> 'score')::integer = 13 and v_res ->> 'level' = 'low' then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T33 priority low/in progress/traffic 1 = 13 low';
  else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T33 ' || v_res::text); end if;

  ---------------------------------------------------------------- rate limiting
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform app_private.enforce_rate_limit('test_action', 2, interval '1 hour');
    perform app_private.enforce_rate_limit('test_action', 2, interval '1 hour');
    perform app_private.enforce_rate_limit('test_action', 2, interval '1 hour');
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T34 rate limit not enforced';
  exception when others then
    if sqlerrm = 'RATE_LIMITED' then v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T34 rate limit enforced on 3rd call (max 2)';
    else v_fail := v_fail + 1; v_log := v_log || chr(10) || ('FAIL T34 ' || sqlerrm); end if;
  end;

  ---------------------------------------------------------------- anonymous access
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.hazards;
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T35 anon can read hazards';
  exception when insufficient_privilege then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T35 anon cannot read hazards';
  end;
  begin
    perform public.nearby_hazards(31.4, 31.6, 1000, 10);
    v_fail := v_fail + 1; v_log := v_log || chr(10) || 'FAIL T36 anon can call RPC';
  exception when insufficient_privilege then
    v_pass := v_pass + 1; v_log := v_log || chr(10) || 'PASS T36 anon cannot call RPCs';
  end;
  execute 'reset role';

  raise exception 'ROADSHIELD_TESTS passed=% failed=% :: %', v_pass, v_fail, v_log;
end
$tests$;
