-- RoadShield OS — enterprise database tests (tenancy, RBAC, finance workflow, GIS, prediction,
-- budget optimisation, model registry). Run as the database owner:
--   psql "$DATABASE_URL" -f supabase/tests/enterprise_tests.sql
-- Everything runs in one DO block that ends by raising, so ALL changes are rolled back.
-- Result line: "ENTERPRISE_TESTS passed=N failed=M".
-- Test fixtures (organizations "Test Org A/B", contractors, amounts) exist only inside the
-- rolled-back transaction and never reach production data.

create temporary table if not exists rs_results (n serial, name text, ok boolean, detail text);
grant all on rs_results to authenticated;
grant usage on all sequences in schema pg_temp to authenticated;

create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default '')
returns void language sql as $$ insert into pg_temp.rs_results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;

-- Executes p_sql and returns the error message ('' when no error).
create or replace function pg_temp.err(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return '';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.act_as_owner()
returns void language plpgsql as $$ begin execute 'reset role'; end $$;

grant execute on all functions in schema pg_temp to authenticated;

do $tests$
declare
  u_owner uuid := gen_random_uuid();      -- Org A owner
  u_fin uuid := gen_random_uuid();        -- Org A finance manager
  u_eng uuid := gen_random_uuid();        -- Org A road engineer
  u_insp uuid := gen_random_uuid();       -- Org A field inspector
  u_con uuid := gen_random_uuid();        -- Org A contractor user
  u_exec uuid := gen_random_uuid();       -- Org A executive viewer
  u_b uuid := gen_random_uuid();          -- Org B owner
  u_cit uuid := gen_random_uuid();        -- citizen (no org)
  u_unv uuid := gen_random_uuid();        -- unverified e-mail
  u_adm uuid := gen_random_uuid();        -- platform admin
  u_o2 uuid := gen_random_uuid();         -- second owner (invitation regression tests)
  u_new uuid := gen_random_uuid();        -- brand-new invitee (invitation regression tests)
  v_org uuid; v_org_b uuid;
  v_inv jsonb; v_res jsonb;
  v_road uuid; v_road2 uuid; v_road_b uuid;
  v_ctr uuid; v_ctr2 uuid;
  v_proj uuid; v_proj2 uuid;
  v_budget uuid; v_rate uuid; v_est uuid; v_contract uuid; v_co uuid; v_wo uuid;
  v_cost uuid; v_cost2 uuid; v_invoice uuid; v_insp uuid; v_id uuid;
  v_n integer; v_txt text; v_num numeric;
  i integer;
  v_pass integer; v_fail integer; v_log text;
begin
  ---------------------------------------------------------------- fixtures
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
         jsonb_build_object('full_name', nm), case when email like 'rs-ent-unverified%' then null else now() end, now(), now()
  from (values (u_owner, 'rs-ent-owner@example.com', 'Owner A'), (u_fin, 'rs-ent-fin@example.com', 'Finance A'),
               (u_eng, 'rs-ent-eng@example.com', 'Engineer A'), (u_insp, 'rs-ent-insp@example.com', 'Inspector A'),
               (u_con, 'rs-ent-con@example.com', 'Contractor A'), (u_exec, 'rs-ent-exec@example.com', 'Exec A'),
               (u_b, 'rs-ent-b@example.com', 'Owner B'), (u_cit, 'rs-ent-cit@example.com', 'Citizen'),
               (u_unv, 'rs-ent-unverified@example.com', 'Unverified'), (u_adm, 'rs-ent-adm@example.com', 'Admin'),
               (u_o2, 'rs-ent-o2@example.com', 'Owner A2'), (u_new, 'rs-ent-new@example.com', 'New Member')) t(id, email, nm);
  update public.user_roles set role = 'admin' where user_id = u_adm;

  ---------------------------------------------------------------- organizations
  perform pg_temp.act_as(u_unv);
  v_txt := pg_temp.err(format($$select public.create_organization('Unverified Org','unv-org','EG','EGP')$$));
  perform pg_temp.check('E01 unverified e-mail cannot create an organization', v_txt = 'EMAIL_NOT_VERIFIED', v_txt);

  perform pg_temp.act_as(u_owner);
  v_org := public.create_organization('Test Org A', 'test-org-a', 'eg', 'egp', 'Africa/Cairo', 'municipality', 'New Damietta', 'Damietta');
  perform pg_temp.check('E02 create organization; creator becomes owner',
    public.my_org_role(v_org) = 'owner' and (select default_currency from public.organizations where id = v_org) = 'EGP');
  v_txt := pg_temp.err($$select public.create_organization('Dup','test-org-a','EG','EGP')$$);
  perform pg_temp.check('E03 duplicate slug rejected', v_txt = 'SLUG_TAKEN', v_txt);

  v_ctr := public.upsert_contractor(v_org, null, 'Test Paving Co', 'CR-1', 'Ali', 'ali@example.com');
  v_ctr2 := public.upsert_contractor(v_org, null, 'Other Paving Co');

  -- Invite members (tokens are returned once, stored hashed).
  v_inv := public.invite_member(v_org, 'RS-ENT-FIN@example.com', 'finance_manager');
  perform pg_temp.check('E04 invitation token returned once, only hash stored',
    length(v_inv ->> 'token') = 48 and not exists (select 1 from public.org_invitations where token_sha256 = v_inv ->> 'token'));
  perform pg_temp.act_as(u_fin);
  perform public.accept_invitation(v_inv ->> 'token');
  perform pg_temp.check('E05 invitee joins with invited role', public.my_org_role(v_org) = 'finance_manager');
  v_txt := pg_temp.err(format('select public.accept_invitation(%L)', v_inv ->> 'token'));
  perform pg_temp.check('E06 invitation cannot be reused', v_txt = 'INVITATION_INVALID', v_txt);

  perform pg_temp.act_as(u_owner);
  v_inv := public.invite_member(v_org, 'rs-ent-eng@example.com', 'road_engineer');
  perform pg_temp.act_as(u_insp);
  v_txt := pg_temp.err(format('select public.accept_invitation(%L)', v_inv ->> 'token'));
  perform pg_temp.check('E07 invitation bound to the invited e-mail', v_txt = 'INVITATION_EMAIL_MISMATCH', v_txt);
  perform pg_temp.act_as(u_eng);
  perform public.accept_invitation(v_inv ->> 'token');

  perform pg_temp.act_as_owner();
  insert into public.org_members (org_id, user_id, role) values (v_org, u_insp, 'field_inspector'), (v_org, u_exec, 'executive_viewer');
  insert into public.org_members (org_id, user_id, role, contractor_id) values (v_org, u_con, 'contractor', v_ctr);

  perform pg_temp.act_as(u_fin);
  v_txt := pg_temp.err(format($$select public.invite_member(%L, 'x@example.com', 'owner')$$, v_org));
  perform pg_temp.check('E08 only owners can invite', v_txt = 'FORBIDDEN', v_txt);

  perform pg_temp.act_as(u_owner);
  v_txt := pg_temp.err(format($$select public.set_member_role(%L, %L, 'road_engineer')$$, v_org, u_owner));
  perform pg_temp.check('E09 last owner cannot be demoted', v_txt = 'LAST_OWNER', v_txt);
  v_txt := pg_temp.err(format($$select public.invite_member(%L, 'c@example.com', 'contractor')$$, v_org));
  perform pg_temp.check('E10 contractor invitation requires a contractor record', v_txt = 'CONTRACTOR_REQUIRED', v_txt);

  ---------------------------------------------------------------- invitation privilege regressions
  -- E10a/b: invitation from an inviter who is no longer an owner is rejected.
  perform pg_temp.act_as(u_owner);
  v_inv := public.invite_member(v_org, 'rs-ent-o2@example.com', 'owner');
  perform pg_temp.act_as(u_o2);
  perform public.accept_invitation(v_inv ->> 'token');
  perform pg_temp.check('E10x second owner joined via valid invitation', public.my_org_role(v_org) = 'owner');
  v_inv := public.invite_member(v_org, 'rs-ent-new@example.com', 'owner');   -- issued by u_o2
  perform pg_temp.act_as(u_owner);
  perform public.remove_member(v_org, u_o2);
  perform pg_temp.act_as(u_new);
  v_txt := pg_temp.err(format('select public.accept_invitation(%L)', v_inv ->> 'token'));
  perform pg_temp.check('E10a invitation from a removed inviter is rejected', v_txt = 'INVITATION_INVALID', v_txt);
  perform pg_temp.act_as_owner();
  perform pg_temp.check('E10b removed inviter''s invitation created no membership',
    not exists (select 1 from public.org_members where org_id = v_org and user_id = u_new));

  -- E10c/d: sole owner cannot demote themselves by inviting their own e-mail as a lower role.
  perform pg_temp.act_as(u_owner);
  v_inv := public.invite_member(v_org, 'rs-ent-owner@example.com', 'executive_viewer');
  v_txt := pg_temp.err(format('select public.accept_invitation(%L)', v_inv ->> 'token'));
  perform pg_temp.check('E10c sole owner self-invite as lower role is rejected', v_txt = 'ALREADY_MEMBER', v_txt);
  perform pg_temp.check('E10d org still has its owner',
    (select count(*) from public.org_members where org_id = v_org and role = 'owner' and user_id = u_owner) = 1);

  -- E10e/f: an existing member cannot change role through an invitation.
  v_inv := public.invite_member(v_org, 'rs-ent-fin@example.com', 'owner');
  perform pg_temp.act_as(u_fin);
  v_txt := pg_temp.err(format('select public.accept_invitation(%L)', v_inv ->> 'token'));
  perform pg_temp.check('E10e existing member invited as owner is rejected', v_txt = 'ALREADY_MEMBER', v_txt);
  perform pg_temp.check('E10f existing member keeps their role', public.my_org_role(v_org) = 'finance_manager');

  -- E10g: a valid invitation from a current owner still works.
  perform pg_temp.act_as(u_owner);
  v_inv := public.invite_member(v_org, 'rs-ent-new@example.com', 'executive_viewer');
  perform pg_temp.act_as(u_new);
  v_id := public.accept_invitation(v_inv ->> 'token');
  perform pg_temp.check('E10g valid invitation from a current owner joins with invited role',
    v_id = v_org and public.my_org_role(v_org) = 'executive_viewer');
  perform pg_temp.act_as(u_owner);
  perform public.remove_member(v_org, u_new);   -- keep Org A membership as later tests expect

  perform pg_temp.act_as(u_b);
  v_org_b := public.create_organization('Test Org B', 'test-org-b', 'SA', 'SAR', 'Asia/Riyadh');

  ---------------------------------------------------------------- road network
  perform pg_temp.act_as(u_owner);
  v_res := public.import_road_segments(v_org, jsonb_build_array(
    jsonb_build_object('osm_way_id', 9000000001, 'name', 'Test Street 1', 'highway', 'primary', 'lanes', '2', 'surface', 'asphalt',
      'coordinates', jsonb_build_array(jsonb_build_array(31.6600, 31.4300), jsonb_build_array(31.6700, 31.4300))),
    jsonb_build_object('osm_way_id', 9000000002, 'name', 'Test Street 2', 'highway', 'residential',
      'coordinates', jsonb_build_array(jsonb_build_array(31.6600, 31.4310), jsonb_build_array(31.6600, 31.4400))),
    jsonb_build_object('osm_way_id', 9000000003, 'name', 'Broken', 'highway', 'service',
      'coordinates', jsonb_build_array(jsonb_build_array(31.66, 31.43)))),
    'OpenStreetMap test extract', 'ODbL-1.0', now());
  perform pg_temp.check('E11 OSM import inserts valid ways, skips invalid geometry',
    (v_res ->> 'inserted')::int = 2 and (v_res ->> 'skipped')::int = 1, v_res::text);
  select id into v_road from public.road_segments where org_id = v_org and osm_way_id = 9000000001;
  select id into v_road2 from public.road_segments where org_id = v_org and osm_way_id = 9000000002;
  select length_m into v_num from public.road_segments where id = v_road;
  -- 0.01° of longitude at 31.43°N ≈ 950 m on the WGS84 ellipsoid.
  perform pg_temp.check('E12 road length computed geodesically from geometry', v_num between 945 and 955, v_num::text);
  perform pg_temp.check('E13 unknown attributes stay unknown (width, condition)',
    (select width_m is null and condition = 'unknown' and lanes_osm = 2 from public.road_segments where id = v_road));
  v_res := public.import_road_segments(v_org, jsonb_build_array(
    jsonb_build_object('osm_way_id', 9000000001, 'name', 'Test Street 1 (renamed)', 'highway', 'primary',
      'coordinates', jsonb_build_array(jsonb_build_array(31.6600, 31.4300), jsonb_build_array(31.6700, 31.4300)))),
    'OpenStreetMap test extract', 'ODbL-1.0', now());
  perform pg_temp.check('E14 re-import updates by OSM way id (idempotent)', (v_res ->> 'updated')::int = 1, v_res::text);
  v_txt := pg_temp.err(format($$select public.import_road_segments(%L, '[]'::jsonb, '', 'ODbL', now())$$, v_org));
  perform pg_temp.check('E15 import requires source + licence metadata', v_txt = 'SOURCE_METADATA_REQUIRED', v_txt);

  perform pg_temp.act_as(u_b);
  v_res := public.import_road_segments(v_org_b, jsonb_build_array(jsonb_build_object('osm_way_id', 9000000099, 'highway', 'primary',
      'coordinates', jsonb_build_array(jsonb_build_array(46.7, 24.7), jsonb_build_array(46.71, 24.7)))), 'OSM test', 'ODbL-1.0', now());
  select count(*) into v_n from public.road_segments;
  perform pg_temp.check('E16 tenant isolation: Org B sees only its own roads', v_n = 1, v_n::text);
  v_txt := pg_temp.err(format($$select public.road_detail(%L)$$, v_road));
  perform pg_temp.check('E17 tenant isolation: Org B cannot open Org A road detail', v_txt = 'NOT_FOUND', v_txt);
  v_txt := pg_temp.err(format($$select public.import_road_segments(%L, '[]'::jsonb, 'x', 'y', now())$$, v_org));
  perform pg_temp.check('E18 tenant isolation: Org B cannot import into Org A', v_txt = 'FORBIDDEN', v_txt);

  perform pg_temp.act_as(u_cit);
  select count(*) into v_n from public.road_segments;
  perform pg_temp.check('E19 citizens cannot read enterprise road network', v_n = 0);

  ---------------------------------------------------------------- inspections
  perform pg_temp.act_as(u_insp);
  v_insp := public.submit_inspection(v_road, 'poor', 'Alligator cracking along 30 m', now() - interval '1 hour', 31.43, 31.665,
    jsonb_build_array(jsonb_build_object('defect_class', 'D20_alligator_crack', 'severity', 'high', 'length_m', 30, 'width_m', 3,
                                         'latitude', 31.43, 'longitude', 31.665),
                      jsonb_build_object('defect_class', 'D40_pothole', 'severity', 'critical', 'area_m2', 1.5,
                                         'latitude', 31.43, 'longitude', 31.666)),
    '11111111-1111-1111-1111-111111111111');
  v_id := public.submit_inspection(v_road, 'poor', 'replay', now(), null, null, '[]'::jsonb, '11111111-1111-1111-1111-111111111111');
  perform pg_temp.check('E20 inspection submit is idempotent on client id (offline replay)', v_id = v_insp);
  perform pg_temp.check('E21 defect area derived from verified length × width',
    (select area_m2 = 90 from public.inspection_defects where inspection_id = v_insp and defect_class = 'D20_alligator_crack'));
  v_txt := pg_temp.err(format($$select public.review_inspection(%L, true)$$, v_insp));
  perform pg_temp.check('E22 inspectors cannot approve inspections', v_txt = 'FORBIDDEN', v_txt);
  perform pg_temp.check('E23 road condition unchanged until inspection approved',
    (select condition = 'unknown' from public.road_segments where id = v_road));
  perform pg_temp.act_as(u_eng);
  perform public.review_inspection(v_insp, true, 'Confirmed on site');
  perform pg_temp.check('E24 approved inspection sets road condition',
    (select condition = 'poor' and condition_inspection_id = v_insp from public.road_segments where id = v_road));

  ---------------------------------------------------------------- projects & budgets
  v_proj := public.create_project(v_org, 'p-001', 'Resurface Test Street 1', 'Mill and overlay', 1::smallint, 'mill_and_overlay',
    array[v_road], current_date, current_date + 60, 120);
  perform pg_temp.check('E25 project created in org currency with roads linked',
    (select currency = 'EGP' and code = 'P-001' from public.maintenance_projects where id = v_proj)
    and (select count(*) = 1 from public.project_roads where project_id = v_proj));
  perform pg_temp.act_as(u_fin);
  v_txt := pg_temp.err(format($$select public.transition_project(%L, 'approved')$$, v_proj));
  perform pg_temp.check('E26 project approval requires an approved budget', v_txt = 'BUDGET_REQUIRED', v_txt);
  v_txt := pg_temp.err(format($$select public.submit_budget(%L, %L, null, 2026::smallint, 'FY26', 1000, 'USD')$$, v_org, v_proj));
  perform pg_temp.check('E27 budget currency must match project currency', v_txt = 'CURRENCY_MISMATCH', v_txt);
  v_budget := public.submit_budget(v_org, v_proj, null, 2026::smallint, 'FY2026 resurfacing allocation', 500000.00, 'EGP', 'Municipal budget');
  v_txt := pg_temp.err(format($$select public.review_budget(%L, true)$$, v_budget));
  perform pg_temp.check('E28 four-eyes: submitter cannot approve own budget', v_txt = 'FOUR_EYES_REQUIRED', v_txt);
  perform pg_temp.act_as(u_eng);
  v_txt := pg_temp.err(format($$select public.review_budget(%L, true)$$, v_budget));
  perform pg_temp.check('E29 engineers cannot approve budgets', v_txt = 'FORBIDDEN', v_txt);
  perform pg_temp.act_as(u_owner);
  perform public.review_budget(v_budget, true, 'OK');
  perform public.transition_project(v_proj, 'approved');
  perform pg_temp.check('E30 project approved after budget approval',
    (select status = 'approved' from public.maintenance_projects where id = v_proj));

  ---------------------------------------------------------------- unit rates & estimates
  perform pg_temp.act_as(u_eng);
  v_rate := public.add_unit_rate(v_org, 'asphalt', 'Asphalt wearing course 5 cm', 'm2', 210.5, 'EGP', 'contract_rate',
    current_date - 30, 'organization_record', 'Test framework contract rate schedule');
  v_txt := pg_temp.err(format($$select public.submit_estimate(%L, jsonb_build_array(jsonb_build_object(
    'category','asphalt','quantity',120,'unit_rate_id',%L)))$$, v_proj, v_rate));
  perform pg_temp.check('E31 estimates cannot use unverified unit rates', v_txt = 'UNIT_RATE_NOT_VERIFIED', v_txt);
  v_txt := pg_temp.err(format($$select public.submit_estimate(%L, jsonb_build_array(jsonb_build_object(
    'category','milling','description','Milling','unit','m2','quantity',120,'unit_rate',40)))$$, v_proj));
  perform pg_temp.check('E32 manual rates require a cited source', v_txt = 'RATE_SOURCE_REQUIRED', v_txt);
  perform pg_temp.act_as(u_fin);
  perform public.verify_unit_rate(v_rate);
  perform pg_temp.act_as(u_eng);
  v_est := public.submit_estimate(v_proj, jsonb_build_array(
    jsonb_build_object('category', 'asphalt', 'quantity', 120, 'unit_rate_id', v_rate),
    jsonb_build_object('category', 'milling', 'description', 'Cold milling 5 cm', 'unit', 'm2', 'quantity', 120.5,
                       'unit_rate', 33.3333, 'rate_source', 'Contractor quotation Q-17 (test)')), 'Area per inspection');
  -- 120 × 210.5 = 25260.00; 120.5 × 33.3333 = 4016.66 (rounded per line) → 29276.66
  perform pg_temp.check('E33 estimate total is decimal-exact sum of rounded lines',
    (select total = 29276.66 from public.cost_estimates where id = v_est),
    (select total::text from public.cost_estimates where id = v_est));
  perform pg_temp.act_as(u_fin);
  perform public.review_estimate(v_est, true);

  ---------------------------------------------------------------- contracts, change orders, invoices, payments
  v_contract := public.create_contract(v_proj, v_ctr, 'TC-2026-001', current_date - 5, 30000, 5, 12::smallint);
  perform pg_temp.act_as(u_eng);
  v_co := public.submit_change_order(v_contract, 2500, 'Additional patching found during milling');
  perform pg_temp.act_as(u_fin);
  perform public.review_change_order(v_co, true);

  -- Work order executed by the contractor.
  perform pg_temp.act_as(u_eng);
  v_wo := public.create_work_order(v_proj, 'wo-001', 'Mill and overlay Test Street 1', '', v_ctr, u_eng, current_date + 30);
  v_txt := pg_temp.err(format($$select public.transition_work_order(%L, 'in_progress')$$, v_wo));
  perform pg_temp.check('E34 work order must be issued before work starts', v_txt = 'INVALID_TRANSITION', v_txt);
  perform public.transition_work_order(v_wo, 'issued');

  perform pg_temp.act_as(u_con);
  perform public.transition_work_order(v_wo, 'in_progress');
  v_id := public.add_work_log(v_wo, current_date, 'Milling completed on eastbound lane', 50::smallint,
    array[v_org::text || '/' || u_con::text || '/before.jpg']);
  v_txt := pg_temp.err(format($$select public.add_work_log(%L, current_date, 'x', null, array['other/path.jpg'])$$, v_wo));
  perform pg_temp.check('E35 work log photos must be in the uploader''s org folder', v_txt = 'INVALID_PATH', v_txt);
  v_cost := public.submit_cost_item(v_proj, v_wo, 'asphalt', 'Asphalt laid', 'm2', 118, 210.5, current_date, 'contractor_submission');
  v_txt := pg_temp.err(format($$select public.submit_cost_item(%L, null, 'labor', 'x', 'h', 1, 1, current_date, 'contractor_submission')$$, v_proj));
  perform pg_temp.check('E36 contractors submit costs only against their work orders', v_txt = 'FORBIDDEN', v_txt);
  select count(*) into v_n from public.budgets;
  perform pg_temp.check('E37 contractors cannot read budgets', v_n = 0);
  select count(*) into v_n from public.contracts;
  perform pg_temp.check('E38 contractors see their own contract', v_n = 1);
  select count(*) into v_n from public.road_segments;
  perform pg_temp.check('E39 contractors cannot browse the road network', v_n = 0);
  v_invoice := public.submit_invoice(v_contract, 'INV-1', current_date, 24839.00, 3477.46);
  perform public.transition_work_order(v_wo, 'submitted');

  perform pg_temp.act_as(u_eng);
  perform public.transition_work_order(v_wo, 'accepted', 'Inspected and accepted');
  v_txt := pg_temp.err(format($$select public.review_cost_item(%L, true)$$, v_cost));
  perform pg_temp.check('E40 engineers cannot approve actual costs', v_txt = 'FORBIDDEN', v_txt);
  v_txt := pg_temp.err(format($$select public.submit_cost_item(%L, null, 'asphalt', 'Tender value', 'lump', 1, 99999, current_date, 'public_procurement')$$, v_proj));
  perform pg_temp.check('E41 tender/benchmark values cannot be recorded as actual cost', v_txt = 'INVALID_SOURCE', v_txt);
  v_cost2 := public.submit_cost_item(v_proj, v_wo, 'engineering_inspection', 'Site supervision', 'day', 3, 1500, current_date, 'organization_record');

  perform pg_temp.act_as(u_fin);
  perform public.review_cost_item(v_cost, true, 'Matches measured quantity');
  perform public.review_cost_item(v_cost2, true);
  perform public.review_invoice(v_invoice, true);
  v_id := public.submit_invoice(v_contract, 'INV-2', current_date, 8000, 0);
  perform pg_temp.act_as(u_owner);
  v_txt := pg_temp.err(format($$select public.review_invoice(%L, true)$$, v_id));
  perform pg_temp.check('E42 invoices cannot exceed contract commitment (incl. change orders)', v_txt = 'EXCEEDS_COMMITMENT', v_txt);
  perform pg_temp.act_as(u_fin);
  v_txt := pg_temp.err(format($$select public.record_payment(%L, 10, current_date, 'x')$$, v_id));
  perform pg_temp.check('E43 payments only against approved invoices', v_txt = 'INVOICE_NOT_APPROVED', v_txt);
  perform public.record_payment(v_invoice, 20000, current_date, 'TRX-1');
  v_txt := pg_temp.err(format($$select public.record_payment(%L, 8316.47, current_date, 'TRX-2')$$, v_invoice));
  perform pg_temp.check('E44 overpayment of an invoice is rejected', v_txt = 'OVERPAYMENT', v_txt);
  perform public.record_payment(v_invoice, 8316.46, current_date, 'TRX-2');

  v_res := public.project_financials(v_proj);
  -- budget 500000; committed 30000 + 2500; actual 118×210.5=24839 + 4500 = 29339; invoiced 28316.46; paid 28316.46
  perform pg_temp.check('E45 project financials keep budget/commitment/actual/invoiced/paid distinct',
    (v_res ->> 'approved_budget')::numeric = 500000 and (v_res ->> 'committed')::numeric = 32500
    and (v_res ->> 'verified_actual')::numeric = 29339 and (v_res ->> 'invoiced_approved')::numeric = 28316.46
    and (v_res ->> 'paid')::numeric = 28316.46 and (v_res ->> 'approved_estimate')::numeric = 29276.66, v_res::text);
  perform pg_temp.check('E46 remaining = budget − max(committed, actual); variance vs estimate',
    (v_res ->> 'remaining_available')::numeric = 467500 and (v_res ->> 'variance_vs_estimate')::numeric = 62.34, v_res::text);

  -- Boundary: commitment 30000 + 2500 approved change order = 32500; INV-1 (24839.00) approved → 7661.00 left.
  -- NOTE: these are SERIAL tests. They prove the sum/boundary logic only; the concurrent-approval race fixed in
  -- 20261127100900 (contract row lock) is NOT TESTED by this suite (needs two simultaneous connections).
  perform pg_temp.act_as(u_con);
  v_id := public.submit_invoice(v_contract, 'INV-OVER', current_date, 7661.01, 0);
  perform pg_temp.act_as(u_fin);
  v_txt := pg_temp.err(format($$select public.review_invoice(%L, true)$$, v_id));
  perform pg_temp.check('E71 invoice one cent over remaining commitment is rejected', v_txt = 'EXCEEDS_COMMITMENT', v_txt);
  perform public.review_invoice(v_id, false, 'over commitment');
  perform pg_temp.act_as(u_con);
  v_id := public.submit_invoice(v_contract, 'INV-EXACT', current_date, 7661.00, 0);
  perform pg_temp.act_as(u_fin);
  perform public.review_invoice(v_id, true);
  perform pg_temp.check('E72 invoice exactly at remaining commitment is approved',
    (select status::text from public.invoices where id = v_id) = 'approved');
  perform pg_temp.act_as(u_con);
  v_id := public.submit_invoice(v_contract, 'INV-ZERO', current_date, 0.01, 0);
  perform pg_temp.act_as(u_fin);
  v_txt := pg_temp.err(format($$select public.review_invoice(%L, true)$$, v_id));
  perform pg_temp.check('E73 no approvals possible once approved invoices equal commitment', v_txt = 'EXCEEDS_COMMITMENT', v_txt);
  perform pg_temp.check('E74 rejected/failed approvals do not count toward approved sum',
    (select coalesce(sum(net_amount), 0) from public.invoices where contract_id = v_contract and status = 'approved') = 32500.00);
  perform pg_temp.check('E75 contract commitment is unchanged by invoice reviews',
    (select amount from public.contracts where id = v_contract) = 30000);
  perform public.review_invoice(v_id, false, 'cleanup');

  perform pg_temp.act_as(u_eng);
  select count(*) into v_n from public.payments;
  perform pg_temp.check('E47 engineers cannot read payments', v_n = 0);
  select count(*) into v_n from public.cost_items;
  perform pg_temp.check('E48 engineers see only cost items they submitted', v_n = 1);

  perform pg_temp.act_as(u_exec);
  v_res := public.org_overview(v_org);
  perform pg_temp.check('E49 executive overview has network + finance metrics from records',
    (v_res -> 'network' ->> 'road_segments')::int = 2 and (v_res -> 'network' ->> 'segments_requiring_maintenance')::int = 1
    and (v_res -> 'finance' ->> 'paid')::numeric = 28316.46, v_res::text);
  v_txt := pg_temp.err(format($$select public.review_invoice(%L, false)$$, v_id));
  perform pg_temp.check('E50 executive viewers are read-only', v_txt = 'FORBIDDEN', v_txt);

  perform pg_temp.act_as(u_insp);
  v_res := public.org_overview(v_org);
  perform pg_temp.check('E51 field inspectors get network metrics but no finance block', v_res -> 'finance' = 'null'::jsonb, v_res::text);

  perform pg_temp.act_as(u_b);
  v_txt := pg_temp.err(format($$select public.project_financials(%L)$$, v_proj));
  perform pg_temp.check('E52 tenant isolation: Org B cannot read Org A project financials', v_txt = 'FORBIDDEN', v_txt);
  select count(*) into v_n from public.cost_items;
  perform pg_temp.check('E53 tenant isolation: Org B cannot read Org A cost items', v_n = 0);
  v_txt := pg_temp.err(format($$select public.review_cost_item(%L, false)$$, v_cost2));
  perform pg_temp.check('E54 tenant isolation: Org B cannot review Org A records', v_txt = 'FORBIDDEN', v_txt);
  v_txt := pg_temp.err(format($$select public.org_month_records(%L, '2026-01')$$, v_org));
  perform pg_temp.check('E67 tenant isolation: Org B cannot drill into Org A month records', v_txt = 'FORBIDDEN', v_txt);
  perform pg_temp.act_as(u_insp);
  v_txt := pg_temp.err(format($$select public.org_month_records(%L, '2026-01')$$, v_org));
  perform pg_temp.check('E68 field inspectors cannot read month financial records', v_txt = 'FORBIDDEN', v_txt);
  perform pg_temp.act_as(u_fin);
  select to_char(cost_date, 'YYYY-MM') into v_txt from public.cost_items where id = v_cost2;
  v_res := public.org_month_records(v_org, v_txt);
  perform pg_temp.check('E69 month drill-down lists only approved records and matches the trend',
    (select coalesce(sum((x ->> 'amount')::numeric), 0) from jsonb_array_elements(v_res -> 'cost_items') x)
      = (select verified_actual from public.org_spending_trend(v_org, 60) t where t.month = v_txt)
    and not exists (select 1 from jsonb_array_elements(v_res -> 'cost_items') x join public.cost_items c on c.id = (x ->> 'id')::uuid where c.status <> 'approved'), v_res::text);
  v_txt := pg_temp.err(format($$select public.org_month_records(%L, '2026-1')$$, v_org));
  perform pg_temp.check('E70 malformed month is rejected', v_txt = 'INVALID_INPUT', v_txt);
  perform pg_temp.act_as_owner();

  perform pg_temp.act_as(u_adm);
  select count(*) into v_n from public.invoices;
  perform pg_temp.check('E55 platform admins do not read tenant financial records without membership', v_n = 0);

  ---------------------------------------------------------------- prediction
  perform pg_temp.act_as(u_eng);
  v_proj2 := public.create_project(v_org, 'p-002', 'Repair Test Street 2', '', 2::smallint, 'mill_and_overlay', array[v_road2],
    null, null, 200);
  v_res := public.predict_project_cost(v_proj2);
  perform pg_temp.check('E56 prediction refuses with < 5 verified comparables',
    v_res ->> 'status' = 'insufficient_data' and v_res ->> 'message' like 'Insufficient verified data%', v_res::text);

  -- Five completed comparables with verified actual costs (fixtures inside this rolled-back transaction).
  perform pg_temp.act_as_owner();
  for i in 1..5 loop
    insert into public.maintenance_projects (id, org_id, code, name, status, repair_method, currency, verified_damaged_area_m2, actual_end)
    values (gen_random_uuid(), v_org, 'HIST-' || i, 'Historical test project ' || i, 'completed', 'mill_and_overlay', 'EGP', 100, current_date - i * 30)
    returning id into v_id;
    insert into public.cost_items (org_id, project_id, category, description, unit, quantity, unit_rate, amount, currency,
                                   cost_date, source_kind, status)
    values (v_org, v_id, 'asphalt', 'hist', 'm2', 100, 200 + i * 10, (100 * (200 + i * 10))::numeric, 'EGP',
            current_date - i * 30, 'organization_record', 'approved');
  end loop;
  perform pg_temp.act_as(u_eng);
  v_res := public.predict_project_cost(v_proj2);
  -- unit costs 210..250 → p25 220, p50 230, p75 240 × 200 m²
  perform pg_temp.check('E57 comparables prediction: IQR range × verified area, with drivers & assumptions',
    v_res ->> 'status' = 'ok' and (v_res ->> 'range_low')::numeric = 44000 and (v_res ->> 'median')::numeric = 46000
    and (v_res ->> 'range_high')::numeric = 48000 and (v_res ->> 'comparables_used')::int = 5
    and jsonb_array_length(v_res -> 'assumptions') = 4, v_res::text);

  ---------------------------------------------------------------- budget optimisation
  perform pg_temp.act_as(u_eng);
  v_est := public.submit_estimate(v_proj2, jsonb_build_array(jsonb_build_object('category', 'asphalt', 'quantity', 200, 'unit_rate_id', v_rate)));
  perform pg_temp.act_as(u_fin);
  perform public.review_estimate(v_est, true);
  v_res := public.optimize_budget(v_org, 50000, 'safety_first', 'Test scenario');
  -- P-001 (approved, est 29276.66, has high+critical defects) is funded first; P-002 (42100) no longer fits.
  perform pg_temp.check('E58 safety-first funds the project with verified defects first',
    v_res -> 'selected' -> 0 ->> 'code' = 'P-001' and v_res -> 'not_funded' -> 0 ->> 'code' = 'P-002'
    and (v_res ->> 'unallocated')::numeric = 20723.34, v_res::text);
  v_res := public.optimize_budget(v_org, 50000, 'critical_damage');
  perform pg_temp.check('E59 critical-damage strategy only considers critical items',
    jsonb_array_length(v_res -> 'selected') = 1 and jsonb_array_length(v_res -> 'not_funded') = 0, v_res::text);
  perform pg_temp.check('E60 scenario saved with result', (select count(*) = 1 from public.budget_scenarios where org_id = v_org));

  ---------------------------------------------------------------- audit & registry
  perform pg_temp.act_as(u_owner);
  select count(*) into v_n from public.audit_logs where org_id = v_org;
  perform pg_temp.check('E61 financial actions are audited for the org owner', v_n >= 20, v_n::text);
  perform pg_temp.act_as(u_b);
  select count(*) into v_n from public.audit_logs where org_id = v_org;
  perform pg_temp.check('E62 tenant isolation: audit log', v_n = 0);

  perform pg_temp.act_as(u_owner);
  v_txt := pg_temp.err($$select public.request_training_run('cost_model', null)$$);
  perform pg_temp.check('E63 only platform admins launch training runs', v_txt = 'FORBIDDEN', v_txt);
  perform pg_temp.act_as(u_adm);
  perform pg_temp.act_as_owner();
  insert into public.ml_models (kind, name, version, architecture, framework, license, provenance)
  values ('cost_model', 'test-cost', 'test-1', 'GBR', 'sklearn', 'BSD-3-Clause', 'trained_by_roadshield') returning id into v_id;
  perform pg_temp.act_as(u_adm);
  v_txt := pg_temp.err(format($$select public.approve_model_deployment(%L)$$, v_id));
  perform pg_temp.check('E64 a model without recorded metrics cannot be deployed', v_txt = 'METRICS_REQUIRED', v_txt);

  perform pg_temp.act_as(u_cit);
  select count(*) into v_n from public.ml_models where status = 'production' and provenance = 'third_party_pretrained';
  perform pg_temp.check('E65 model card transparency: production detector is labelled third-party pretrained', v_n = 1);

  execute 'set local role anon';
  v_txt := pg_temp.err('select count(*) from public.organizations');
  perform pg_temp.act_as_owner();
  perform pg_temp.check('E66 anonymous users cannot read organizations', v_txt like 'permission denied%', v_txt);

  select count(*) filter (where ok), count(*) filter (where not ok),
         string_agg((case when ok then 'PASS ' else 'FAIL ' end) || name || case when ok or detail = '' then '' else ' :: ' || detail end, chr(10) order by n)
  into v_pass, v_fail, v_log from pg_temp.rs_results;
  raise exception 'ENTERPRISE_TESTS passed=% failed=% :: %', v_pass, v_fail, chr(10) || v_log;
end
$tests$;
