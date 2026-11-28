#!/usr/bin/env bash
# Real two-session regression for last-owner concurrency; LOCAL POSTGIS DATABASE ONLY.
# Run after reset_local_db.sh has applied migrations to a disposable DB.
# Usage: PGHOST=localhost PGUSER=postgres PGPASSWORD=... bash supabase/tests/last_owner_concurrency.sh roadshield_ci
set -euo pipefail

DB="${1:?Specify a disposable local PostGIS database name}"
case "$DB" in roadshield_ci|roadshield_local|roadshield_test) ;; *) echo "Refusing non-test database: $DB" >&2; exit 2 ;; esac
PSQL=(psql -X -v ON_ERROR_STOP=1 -q -d "$DB")
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ORG=00000000-0000-4000-8000-000000009001
A=00000000-0000-4000-8000-000000001001
B=00000000-0000-4000-8000-000000001002

# Local ephemeral fixture. Names/slugs are never written to live Supabase.
"${PSQL[@]}" > "$tmp/setup" <<SQL
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
('$A','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a-concurrency@roadshield.invalid','{"full_name":"Owner A"}',now(),now(),now()),
('$B','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b-concurrency@roadshield.invalid','{"full_name":"Owner B"}',now(),now(),now());
insert into public.organizations (id, slug, name, country_code, default_currency, created_by, verification_status)
values ('$ORG','roadshield-concurrency-test','Local concurrency test','EG','EGP','$A','verified');
insert into public.org_members (org_id, user_id, role) values
('$ORG','$A','owner'),('$ORG','$B','owner');
SQL
function owner_count() {
  "${PSQL[@]}" -Atc "select count(*) from public.org_members where org_id = '$ORG' and role = 'owner'"
}
if [[ "$(owner_count)" != "2" ]]; then echo "Fixture expected 2 owners" >&2; exit 1; fi

# Transaction A holds the organization lock for 2 seconds *after* removing A.
# B must block, see the post-commit count=1, and reject B's self-removal.
"${PSQL[@]}" > "$tmp/a1.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claims','{"sub":"$A","role":"authenticated"}',true);
set local role authenticated;
select public.remove_member('$ORG','$A');
select pg_sleep(2);
commit;
SQL
pid=$!
sleep 0.5
set +e
"${PSQL[@]}" > "$tmp/b1.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"$B","role":"authenticated"}',true);
set local role authenticated;
select public.remove_member('$ORG','$B');
commit;
SQL
b_rc=$?
wait "$pid"; a_rc=$?
set -e
if [[ "$a_rc" != 0 || "$b_rc" == 0 ]] || ! grep -q 'LAST_OWNER' "$tmp/b1.log"; then
  echo "FAIL: concurrent remove/remove race" >&2
  sed -n '1,12p' "$tmp/a1.log" "$tmp/b1.log" >&2
  exit 1
fi
if [[ "$(owner_count)" != "1" ]]; then echo "FAIL: removal left wrong owner count" >&2; exit 1; fi
echo "PASS remove/remove: only one owner remains; second transaction rejected"

# A is re-added as owner by the test DB admin. A demotes itself to inspector while
# B tries to remove itself. Same serialized lock protects both RPCs.
"${PSQL[@]}" -c "insert into public.org_members (org_id, user_id, role) values ('$ORG','$A','owner');" > /dev/null
"${PSQL[@]}" > "$tmp/a2.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claims','{"sub":"$A","role":"authenticated"}',true);
set local role authenticated;
select public.set_member_role('$ORG','$A','field_inspector');
select pg_sleep(2);
commit;
SQL
pid=$!
sleep 0.5
set +e
"${PSQL[@]}" > "$tmp/b2.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"$B","role":"authenticated"}',true);
set local role authenticated;
select public.remove_member('$ORG','$B');
commit;
SQL
b_rc=$?
wait "$pid"; a_rc=$?
set -e
if [[ "$a_rc" != 0 || "$b_rc" == 0 ]] || ! grep -q 'LAST_OWNER' "$tmp/b2.log"; then
  echo "FAIL: concurrent demotion/removal race" >&2
  sed -n '1,12p' "$tmp/a2.log" "$tmp/b2.log" >&2
  exit 1
fi
if [[ "$(owner_count)" != "1" ]]; then echo "FAIL: demotion left wrong owner count" >&2; exit 1; fi
echo "PASS demote/remove: only one owner remains; second transaction rejected"
echo "OWNER_CONCURRENCY_TESTS passed=2 failed=0"
