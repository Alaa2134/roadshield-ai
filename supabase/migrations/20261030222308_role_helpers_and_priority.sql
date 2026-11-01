-- RoadShield AI — role helpers, explainable priority engine, labels, report state machine

create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select r.role from public.user_roles r where r.user_id = auth.uid()),
    'citizen'::public.user_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('maintenance_officer', 'admin')
  );
$$;

-- ---------------------------------------------------------------- explainable priority engine (rs-priority-v1)
-- Pure function of its inputs: identical inputs (including p_at) always give identical output.
-- Weights: severity 40, independent confirmations 20, age 15, traffic exposure 15, maintenance status 10.
-- When no traffic exposure data exists the factor is excluded and the remaining weights are renormalised.
-- This is a maintenance priority score, not an accident prediction.
create or replace function public.compute_priority(
  p_severity public.hazard_severity,
  p_confirmations integer,
  p_created_at timestamptz,
  p_traffic_exposure smallint,
  p_status public.report_status,
  p_at timestamptz
)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  w_sev constant integer := 40;
  w_conf constant integer := 20;
  w_age constant integer := 15;
  w_traffic constant integer := 15;
  w_maint constant integer := 10;
  s_sev integer;
  s_conf integer;
  s_age integer;
  s_traffic integer;
  s_maint integer;
  v_days integer;
  v_num integer;
  v_den integer;
  v_score integer;
  v_level text;
begin
  if p_status in ('resolved', 'rejected', 'duplicate') then
    return jsonb_build_object(
      'model', 'rs-priority-v1', 'score', 0, 'level', 'none', 'active', false,
      'factors', '[]'::jsonb
    );
  end if;

  s_sev := case p_severity when 'low' then 25 when 'medium' then 50 when 'high' then 75 else 100 end;
  s_conf := least(100, greatest(0, coalesce(p_confirmations, 0)) * 20);
  v_days := greatest(0, floor(extract(epoch from (p_at - p_created_at)) / 86400)::integer);
  s_age := least(100, round(v_days * 100.0 / 30)::integer);
  s_traffic := case when p_traffic_exposure is null then null else (p_traffic_exposure - 1) * 25 end;
  s_maint := case p_status when 'assigned' then 60 when 'in_progress' then 30 else 100 end;

  v_num := w_sev * s_sev + w_conf * s_conf + w_age * s_age + w_maint * s_maint
           + coalesce(w_traffic * s_traffic, 0);
  v_den := w_sev + w_conf + w_age + w_maint + case when s_traffic is null then 0 else w_traffic end;
  v_score := round(v_num::numeric / v_den)::integer;
  v_level := case when v_score >= 70 then 'high' when v_score >= 40 then 'medium' else 'low' end;

  return jsonb_build_object(
    'model', 'rs-priority-v1',
    'score', v_score,
    'level', v_level,
    'active', true,
    'factors', jsonb_build_array(
      jsonb_build_object('key', 'severity', 'input', p_severity, 'score', s_sev, 'weight', w_sev),
      jsonb_build_object('key', 'confirmations', 'input', coalesce(p_confirmations, 0), 'score', s_conf, 'weight', w_conf),
      jsonb_build_object('key', 'age_days', 'input', v_days, 'score', s_age, 'weight', w_age),
      jsonb_build_object('key', 'traffic_exposure', 'input', p_traffic_exposure, 'score', s_traffic,
                         'weight', case when s_traffic is null then 0 else w_traffic end),
      jsonb_build_object('key', 'maintenance_status', 'input', p_status, 'score', s_maint, 'weight', w_maint)
    )
  );
end;
$$;

-- Computed column: GET /hazards?select=*,priority
create or replace function public.priority(h public.hazards)
returns jsonb
language sql stable set search_path = ''
as $$
  select public.compute_priority(h.severity, h.confirmations_count, h.created_at,
                                 h.traffic_exposure, h.status, now());
$$;

-- ---------------------------------------------------------------- private helpers
create or replace function app_private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.set_point_location()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.location := extensions.st_setsrid(
    extensions.st_makepoint(new.longitude, new.latitude), 4326
  )::extensions.geography;
  return new;
end;
$$;

create or replace function app_private.status_label(p_status public.report_status, p_lang text)
returns text language sql immutable set search_path = ''
as $$
  select case p_lang
    when 'ar' then case p_status
      when 'submitted' then 'تم الإرسال'
      when 'under_review' then 'قيد المراجعة'
      when 'verified' then 'تم التحقق'
      when 'assigned' then 'أُسند لفريق الصيانة'
      when 'in_progress' then 'جارٍ الإصلاح'
      when 'resolved' then 'تم الحل'
      when 'rejected' then 'لم يُقبل'
      when 'duplicate' then 'بلاغ مكرر'
      when 'reopened' then 'أُعيد فتحه'
    end
    else case p_status
      when 'submitted' then 'Submitted'
      when 'under_review' then 'Under review'
      when 'verified' then 'Verified'
      when 'assigned' then 'Assigned to maintenance'
      when 'in_progress' then 'Repair in progress'
      when 'resolved' then 'Resolved'
      when 'rejected' then 'Not accepted'
      when 'duplicate' then 'Marked as duplicate'
      when 'reopened' then 'Reopened'
    end
  end;
$$;

create or replace function app_private.category_label(p_category public.hazard_category, p_lang text)
returns text language sql immutable set search_path = ''
as $$
  select case p_lang
    when 'ar' then case p_category
      when 'pothole' then 'حفرة'
      when 'crack' then 'تشقق'
      when 'surface_damage' then 'تلف في سطح الطريق'
      when 'flooding' then 'تجمّع مياه على الطريق'
      when 'damaged_signage' then 'لافتة تالفة'
      when 'obstruction' then 'عائق على الطريق'
      when 'street_lighting' then 'عطل في الإنارة'
      else 'خطر آخر'
    end
    else case p_category
      when 'pothole' then 'pothole'
      when 'crack' then 'crack'
      when 'surface_damage' then 'surface damage'
      when 'flooding' then 'flooded road'
      when 'damaged_signage' then 'damaged sign'
      when 'obstruction' then 'road obstruction'
      when 'street_lighting' then 'street lighting fault'
      else 'road hazard'
    end
  end;
$$;

-- Allowed report state machine (moderation + maintenance).
create or replace function app_private.can_transition(p_from public.report_status, p_to public.report_status)
returns boolean language sql immutable set search_path = ''
as $$
  select case p_from
    when 'submitted'    then p_to in ('under_review', 'verified', 'rejected', 'duplicate')
    when 'under_review' then p_to in ('verified', 'rejected', 'duplicate')
    when 'verified'     then p_to in ('assigned', 'resolved', 'rejected', 'duplicate')
    when 'assigned'     then p_to in ('in_progress', 'verified', 'resolved')
    when 'in_progress'  then p_to in ('resolved', 'assigned', 'verified')
    when 'resolved'     then p_to in ('reopened')
    when 'reopened'     then p_to in ('under_review', 'verified', 'assigned', 'rejected', 'duplicate', 'resolved')
    when 'rejected'     then p_to in ('under_review')
    when 'duplicate'    then p_to in ('under_review')
    else false
  end;
$$;
