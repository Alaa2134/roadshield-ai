#!/usr/bin/env bash
# Regression for issue #12 using TWO simultaneous Postgres sessions on a disposable CI DB.
# Never point this script at a live/production Supabase project.
set -euo pipefail
DB="${1:?Use a disposable roadshield_ci database}"
case "$DB" in roadshield_ci|roadshield_local|roadshield_test) ;; *) echo "Refusing non-test DB $DB" >&2; exit 2 ;; esac
PSQL=(psql -X -v ON_ERROR_STOP=1 -q -d "$DB")
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
ORG=00000000-0000-4000-8000-000000009102
S=00000000-0000-4000-8000-000000002101
A=00000000-0000-4000-8000-000000002102
B=00000000-0000-4000-8000-000000002103
P=00000000-0000-4000-8000-000000009103
C=00000000-0000-4000-8000-000000009104
CONTRACT=00000000-0000-4000-8000-000000009105
I1=00000000-0000-4000-8000-000000009106
I2=00000000-0000-4000-8000-000000009107

"${PSQL[@]}" > "$tmp/setup" <<SQL
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
('$S','00000000-0000-0000-0000-000000000000','authenticated','authenticated','finance-submitter@roadshield.invalid','{"full_name":"Finance Submitter"}',now(),now(),now()),
('$A','00000000-0000-0000-0000-000000000000','authenticated','authenticated','finance-reviewer-a@roadshield.invalid','{"full_name":"Finance Reviewer A"}',now(),now(),now()),
('$B','00000000-0000-0000-0000-000000000000','authenticated','authenticated','finance-reviewer-b@roadshield.invalid','{"full_name":"Finance Reviewer B"}',now(),now(),now());
insert into public.organizations (id, slug, name, country_code, default_currency, created_by, verification_status)
values ('$ORG','roadshield-finance-concurrency','Finance concurrency fixture','EG','EGP','$S','verified');
insert into public.org_members (org_id, user_id, role) values
('$ORG','$S','owner'),('$ORG','$A','finance_manager'),('$ORG','$B','finance_manager');
insert into public.contractors (id, org_id, name) values ('$C','$ORG','Test Contractor');
insert into public.maintenance_projects (id, org_id, code, name, currency, contractor_id)
values ('$P','$ORG','FIN-RACE','Finance concurrency test','EGP','$C');
insert into public.contracts (id, org_id, project_id, contractor_id, reference, signed_on, amount, currency, created_by)
values ('$CONTRACT','$ORG','$P','$C','RACE-1',current_date,100,'EGP','$S');
insert into public.invoices (id, org_id, contract_id, project_id, contractor_id, invoice_number,
  invoice_date, net_amount, tax_amount, currency, status, submitted_by)
values
('$I1','$ORG','$CONTRACT','$P','$C','RACE-INV-1',current_date,70,0,'EGP','submitted','$S'),
('$I2','$ORG','$CONTRACT','$P','$C','RACE-INV-2',current_date,70,0,'EGP','submitted','$S');
SQL

# A approves one invoice, then holds its contract lock while B attempts a different invoice.
# With contract-level serialisation, B observes the newly approved 70 and MUST reject 70 > 100.
"${PSQL[@]}" > "$tmp/a.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claims','{"sub":"$A","role":"authenticated"}',true);
set local role authenticated;
select public.review_invoice('$I1',true,'Test 1');
select pg_sleep(2);
commit;
SQL
pid=$!
sleep 0.5
set +e
"${PSQL[@]}" > "$tmp/b.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"$B","role":"authenticated"}',true);
set local role authenticated;
select public.review_invoice('$I2',true,'Test 2');
commit;
SQL
b_rc=$?
wait "$pid"; a_rc=$?
set -e
if [[ "$a_rc" != 0 || "$b_rc" == 0 ]] || ! grep -q 'EXCEEDS_COMMITMENT' "$tmp/b.log"; then
  echo "FAIL: concurrent invoice approval exceeded contract commitment" >&2
  sed -n '1,15p' "$tmp/a.log" "$tmp/b.log" >&2
  exit 1
fi
total=$("${PSQL[@]}" -Atc "select coalesce(sum(net_amount),0) from public.invoices where contract_id = '$CONTRACT' and status='approved'")
count=$("${PSQL[@]}" -Atc "select count(*) from public.invoices where contract_id = '$CONTRACT' and status='approved'")
if [[ "$total" != "70.00" && "$total" != "70" ]] || [[ "$count" != "1" ]]; then
  echo "FAIL: approved total=$total invoice_count=$count; expected 70 and one approved invoice" >&2
  exit 1
fi
echo "PASS: simultaneous review of two different invoices cannot exceed 100 EGP contract; approved 70 EGP"
echo "INVOICE_CONCURRENCY_TESTS passed=1 failed=0"
