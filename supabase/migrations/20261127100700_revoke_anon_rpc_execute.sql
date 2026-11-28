-- Defence in depth: functions created in the enterprise migrations inherited PostgreSQL's default
-- EXECUTE grant to PUBLIC, so anonymous API callers could invoke them (each still raised FORBIDDEN
-- because it checks auth.uid() and the caller's org role). Restrict them to signed-in users.
-- submit_contact_request stays callable by anonymous visitors on purpose (public contact form).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname in ('approve_model_deployment', 'optimize_budget', 'org_activity', 'org_analytics',
        'org_citizen_reports', 'org_month_records', 'org_overview', 'org_spending_trend',
        'predict_project_cost', 'predictive_flags', 'project_financials', 'reject_model',
        'request_training_run')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end
$$;
