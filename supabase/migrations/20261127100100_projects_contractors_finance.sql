-- RoadShield OS — maintenance projects, contractors, work orders and the financial ledger.
--
-- Money: numeric(18,2) amounts, numeric(18,4) quantities/rates, never floating point.
-- Every financial record of a project is in the project's currency (enforced by trigger);
-- RoadShield never silently converts between currencies.
--
-- The six financial quantities are kept in separate tables and are never mixed:
--   budget      — money allocated (budgets, approved)
--   estimate    — engineering estimate of cost (cost_estimates, approved)
--   commitment  — contracted amount (contracts + approved change orders)
--   invoiced    — contractor invoices approved for payment (invoices)
--   actual cost — verified actual expenditure (cost_items, approved)
--   paid        — money actually paid out (payments)

create type public.project_status as enum
  ('planning', 'approved', 'in_progress', 'completed', 'closed', 'cancelled');
create type public.work_order_status as enum
  ('draft', 'issued', 'in_progress', 'submitted', 'accepted', 'rejected', 'cancelled');
create type public.cost_category as enum (
  'asphalt', 'milling', 'excavation', 'filling', 'aggregate', 'transportation', 'labor',
  'equipment', 'traffic_control', 'engineering_inspection', 'testing', 'taxes', 'other'
);
create type public.cost_source as enum (
  'engineer_measurement', 'contractor_submission', 'organization_record', 'invoice',
  'public_procurement', 'benchmark_publication'
);

-- ---------------------------------------------------------------- contractors
create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  registration_no text check (char_length(registration_no) <= 80),
  contact_name text check (char_length(contact_name) <= 120),
  contact_email text check (char_length(contact_email) <= 254),
  phone text check (char_length(phone) <= 40),
  qualifications text not null default '' check (char_length(qualifications) <= 2000),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint contractors_org_name_unique unique (org_id, name)
);

alter table public.org_members add constraint org_members_contractor_fk
  foreign key (contractor_id) references public.contractors (id) on delete set null;
alter table public.org_invitations add constraint org_invitations_contractor_fk
  foreign key (contractor_id) references public.contractors (id) on delete cascade;
alter table public.org_members add constraint org_members_contractor_role_chk
  check ((role = 'contractor') = (contractor_id is not null));

-- ---------------------------------------------------------------- projects
create table public.maintenance_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (char_length(code) between 2 and 40),
  name text not null check (char_length(name) between 3 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  status public.project_status not null default 'planning',
  priority smallint not null default 3 check (priority between 1 and 5),  -- 1 = highest
  repair_method text check (char_length(repair_method) <= 80),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  verified_damaged_area_m2 numeric(12, 2) check (verified_damaged_area_m2 >= 0),
  contractor_id uuid references public.contractors (id) on delete set null,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  boundary extensions.geometry(MultiPolygon, 4326),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_code_unique unique (org_id, code),
  constraint projects_dates_chk check (planned_end is null or planned_start is null or planned_end >= planned_start)
);
create index projects_org_idx on public.maintenance_projects (org_id, status);
create index projects_contractor_idx on public.maintenance_projects (contractor_id);

create table public.project_roads (
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  road_id uuid not null references public.road_segments (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  primary key (project_id, road_id)
);
create index project_roads_road_idx on public.project_roads (road_id);

create table public.project_status_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  from_status public.project_status,
  to_status public.project_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index project_status_history_idx on public.project_status_history (project_id, created_at);

-- ---------------------------------------------------------------- unit rates (reference prices)
-- Empty by default. Rows are added by an organization from a cited source and must be
-- verified by a different person before an estimate may use them.
create table public.unit_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  region text check (char_length(region) <= 80),
  category public.cost_category not null,
  description text not null check (char_length(description) between 3 and 300),
  unit text not null check (char_length(unit) between 1 and 20),
  rate numeric(18, 4) not null check (rate > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  rate_kind text not null check (rate_kind in ('historical_benchmark', 'current_market', 'contract_rate')),
  effective_date date not null,
  source_kind public.cost_source not null,
  source_title text not null check (char_length(source_title) between 3 and 300),
  source_url text check (char_length(source_url) <= 500),
  verified boolean not null default false,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index unit_rates_lookup_idx on public.unit_rates (org_id, category, effective_date desc);

-- ---------------------------------------------------------------- budgets
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.maintenance_projects (id) on delete cascade,
  road_id uuid references public.road_segments (id) on delete cascade,
  fiscal_year smallint not null check (fiscal_year between 2000 and 2100),
  label text not null check (char_length(label) between 2 and 160),
  amount numeric(18, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  funding_source text check (char_length(funding_source) <= 160),
  status public.approval_status not null default 'submitted',
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now()
);
create index budgets_org_idx on public.budgets (org_id, fiscal_year, status);
create index budgets_project_idx on public.budgets (project_id);
create index budgets_road_idx on public.budgets (road_id);

-- ---------------------------------------------------------------- estimates
create table public.cost_estimates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  version integer not null check (version > 0),
  method text not null default 'quantity_x_unit_rate' check (method = 'quantity_x_unit_rate'),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  total numeric(18, 2) not null check (total >= 0),
  assumptions text not null default '' check (char_length(assumptions) <= 4000),
  status public.approval_status not null default 'submitted',
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint cost_estimates_version_unique unique (project_id, version)
);

create table public.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.cost_estimates (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  line_no smallint not null check (line_no > 0),
  category public.cost_category not null,
  description text not null check (char_length(description) between 2 and 300),
  unit text not null check (char_length(unit) between 1 and 20),
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_rate numeric(18, 4) not null check (unit_rate >= 0),
  unit_rate_id uuid references public.unit_rates (id) on delete set null,
  rate_source text not null check (char_length(rate_source) between 3 and 300),
  amount numeric(18, 2) not null check (amount >= 0),
  constraint estimate_lines_amount_chk check (amount = round(quantity * unit_rate, 2)),
  constraint estimate_lines_unique unique (estimate_id, line_no)
);

-- ---------------------------------------------------------------- contracts (commitments)
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  contractor_id uuid not null references public.contractors (id) on delete restrict,
  reference text not null check (char_length(reference) between 2 and 80),
  signed_on date not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  retention_pct numeric(5, 2) not null default 0 check (retention_pct between 0 and 100),
  warranty_months smallint check (warranty_months between 0 and 240),
  status text not null default 'active' check (status in ('active', 'completed', 'terminated')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint contracts_reference_unique unique (org_id, reference)
);
create index contracts_project_idx on public.contracts (project_id);
create index contracts_contractor_idx on public.contracts (contractor_id);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  amount numeric(18, 2) not null check (amount <> 0),   -- may be negative (de-scope)
  reason text not null check (char_length(reason) between 3 and 1000),
  status public.approval_status not null default 'submitted',
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index change_orders_contract_idx on public.change_orders (contract_id);

-- ---------------------------------------------------------------- work orders
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  contractor_id uuid references public.contractors (id) on delete set null,
  assigned_engineer uuid references public.profiles (id) on delete set null,
  code text not null check (char_length(code) between 2 and 40),
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  status public.work_order_status not null default 'draft',
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  due_date date,
  issued_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_code_unique unique (org_id, code)
);
create index work_orders_project_idx on public.work_orders (project_id);
create index work_orders_contractor_idx on public.work_orders (contractor_id, status);
create index work_orders_engineer_idx on public.work_orders (assigned_engineer, status);

create table public.work_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  log_date date not null,
  note text not null check (char_length(note) between 1 and 4000),
  progress_pct smallint check (progress_pct between 0 and 100),
  photo_paths text[] not null default '{}',
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint work_logs_client_unique unique (author_id, client_id)
);
create index work_logs_wo_idx on public.work_logs (work_order_id, log_date desc);

-- ---------------------------------------------------------------- actual costs
create table public.cost_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  work_order_id uuid references public.work_orders (id) on delete set null,
  contractor_id uuid references public.contractors (id) on delete set null,
  category public.cost_category not null,
  description text not null check (char_length(description) between 2 and 300),
  unit text not null check (char_length(unit) between 1 and 20),
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_rate numeric(18, 4) not null check (unit_rate >= 0),
  amount numeric(18, 2) not null check (amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  cost_date date not null,
  source_kind public.cost_source not null,
  status public.approval_status not null default 'submitted',
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint cost_items_amount_chk check (amount = round(quantity * unit_rate, 2)),
  constraint cost_items_client_unique unique (submitted_by, client_id)
);
create index cost_items_project_idx on public.cost_items (project_id, status);
create index cost_items_org_idx on public.cost_items (org_id, status, cost_date);
create index cost_items_contractor_idx on public.cost_items (contractor_id);

-- ---------------------------------------------------------------- invoices & payments
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  contractor_id uuid not null references public.contractors (id) on delete restrict,
  invoice_number text not null check (char_length(invoice_number) between 1 and 80),
  invoice_date date not null,
  net_amount numeric(18, 2) not null check (net_amount > 0),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(18, 2) generated always as (net_amount + tax_amount) stored,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status public.approval_status not null default 'submitted',
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint invoices_number_unique unique (contractor_id, invoice_number)
);
create index invoices_project_idx on public.invoices (project_id, status);
create index invoices_contract_idx on public.invoices (contract_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  project_id uuid not null references public.maintenance_projects (id) on delete cascade,
  amount numeric(18, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  paid_on date not null,
  reference text not null check (char_length(reference) between 1 and 120),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_project_idx on public.payments (project_id, paid_on);

-- ---------------------------------------------------------------- budget scenarios
create table public.budget_scenarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  strategy text not null check (strategy in ('safety_first', 'max_coverage', 'balanced', 'critical_damage')),
  total_funding numeric(18, 2) not null check (total_funding > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  result jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index budget_scenarios_org_idx on public.budget_scenarios (org_id, created_at desc);

-- ---------------------------------------------------------------- integrity triggers
-- Child financial rows must belong to the same org as their project and use its currency.
create or replace function app_private.enforce_project_money()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_cur char(3);
begin
  select p.org_id, p.currency into v_org, v_cur from public.maintenance_projects p where p.id = new.project_id;
  if v_org is null then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if new.org_id <> v_org then
    raise exception 'ORG_MISMATCH' using errcode = 'P0001';
  end if;
  if new.currency <> v_cur then
    raise exception 'CURRENCY_MISMATCH' using errcode = 'P0001', hint = v_cur;
  end if;
  return new;
end;
$$;

create trigger budgets_money before insert or update on public.budgets
  for each row when (new.project_id is not null) execute function app_private.enforce_project_money();
create trigger estimates_money before insert or update on public.cost_estimates
  for each row execute function app_private.enforce_project_money();
create trigger contracts_money before insert or update on public.contracts
  for each row execute function app_private.enforce_project_money();
create trigger cost_items_money before insert or update on public.cost_items
  for each row execute function app_private.enforce_project_money();
create trigger invoices_money before insert or update on public.invoices
  for each row execute function app_private.enforce_project_money();
create trigger payments_money before insert or update on public.payments
  for each row execute function app_private.enforce_project_money();

create trigger projects_touch before update on public.maintenance_projects
  for each row execute function app_private.touch_updated_at();
create trigger work_orders_touch before update on public.work_orders
  for each row execute function app_private.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.contractors enable row level security;
alter table public.maintenance_projects enable row level security;
alter table public.project_roads enable row level security;
alter table public.project_status_history enable row level security;
alter table public.unit_rates enable row level security;
alter table public.budgets enable row level security;
alter table public.cost_estimates enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.contracts enable row level security;
alter table public.change_orders enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_logs enable row level security;
alter table public.cost_items enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.budget_scenarios enable row level security;

-- Contractors: staff see all of the org's contractors; a contractor user sees its own record.
create policy contractors_select on public.contractors for select to authenticated
  using ((select public.is_org_staff(org_id)) or id = (select public.my_contractor_id(org_id)));

-- Projects: staff see all; contractors see projects they are assigned to (directly or by work order).
create policy projects_select on public.maintenance_projects for select to authenticated
  using (
    (select public.is_org_staff(org_id))
    or contractor_id = (select public.my_contractor_id(org_id))
    or exists (select 1 from public.work_orders w where w.project_id = maintenance_projects.id
               and w.contractor_id = (select public.my_contractor_id(org_id)))
  );

create policy project_roads_select on public.project_roads for select to authenticated
  using ((select public.is_org_staff(org_id)));

create policy project_status_history_select on public.project_status_history for select to authenticated
  using (exists (select 1 from public.maintenance_projects p where p.id = project_id));

create policy unit_rates_select on public.unit_rates for select to authenticated
  using ((select public.has_org_role(org_id,
    array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[])));

-- Budgets & estimates: finance readers + engineers (who prepare estimates).
create policy budgets_select on public.budgets for select to authenticated
  using ((select public.has_org_role(org_id,
    array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[])));
create policy estimates_select on public.cost_estimates for select to authenticated
  using ((select public.has_org_role(org_id,
    array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[])));
create policy estimate_lines_select on public.estimate_lines for select to authenticated
  using ((select public.has_org_role(org_id,
    array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[])));

-- Contracts / change orders / invoices / payments: finance readers, engineers (contracts only),
-- and the contractor that is party to the contract.
create policy contracts_select on public.contracts for select to authenticated
  using (
    (select public.has_org_role(org_id,
      array['owner','finance_manager','road_engineer','executive_viewer']::public.org_role[]))
    or contractor_id = (select public.my_contractor_id(org_id))
  );
create policy change_orders_select on public.change_orders for select to authenticated
  using (
    (select public.can_read_org_finance(org_id))
    or exists (select 1 from public.contracts c where c.id = contract_id
               and c.contractor_id = (select public.my_contractor_id(c.org_id)))
  );
create policy invoices_select on public.invoices for select to authenticated
  using ((select public.can_read_org_finance(org_id)) or contractor_id = (select public.my_contractor_id(org_id)));
create policy payments_select on public.payments for select to authenticated
  using (
    (select public.can_read_org_finance(org_id))
    or exists (select 1 from public.invoices i where i.id = invoice_id
               and i.contractor_id = (select public.my_contractor_id(i.org_id)))
  );

-- Work orders: staff see all; contractors see their own.
create policy work_orders_select on public.work_orders for select to authenticated
  using ((select public.is_org_staff(org_id)) or contractor_id = (select public.my_contractor_id(org_id)));
create policy work_logs_select on public.work_logs for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = work_order_id));

-- Actual costs: finance readers; anyone sees the items they submitted; contractors their own.
create policy cost_items_select on public.cost_items for select to authenticated
  using (
    (select public.can_read_org_finance(org_id))
    or submitted_by = (select auth.uid())
    or (contractor_id is not null and contractor_id = (select public.my_contractor_id(org_id)))
  );

create policy budget_scenarios_select on public.budget_scenarios for select to authenticated
  using ((select public.can_read_org_finance(org_id)));

-- Documents: staff see all documents; others see documents they uploaded.
create policy org_documents_select on public.org_documents for select to authenticated
  using (
    (entity_type in ('contract', 'invoice', 'payment', 'cost_item', 'unit_rate')
       and (select public.can_read_org_finance(org_id)))
    or (entity_type in ('road', 'inspection', 'project', 'work_order') and (select public.is_org_staff(org_id)))
    or uploaded_by = (select auth.uid())
  );

grant select on public.contractors, public.maintenance_projects, public.project_roads,
  public.project_status_history, public.unit_rates, public.budgets, public.cost_estimates,
  public.estimate_lines, public.contracts, public.change_orders, public.work_orders, public.work_logs,
  public.cost_items, public.invoices, public.payments, public.budget_scenarios to authenticated;
revoke all on public.contractors, public.maintenance_projects, public.project_roads,
  public.project_status_history, public.unit_rates, public.budgets, public.cost_estimates,
  public.estimate_lines, public.contracts, public.change_orders, public.work_orders, public.work_logs,
  public.cost_items, public.invoices, public.payments, public.budget_scenarios from anon;
