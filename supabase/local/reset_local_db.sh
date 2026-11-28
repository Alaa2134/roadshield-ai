#!/usr/bin/env bash
# Rebuild a local PostGIS database from all migrations and run both SQL test suites.
# Usage: PGHOST=localhost PGUSER=postgres PGPASSWORD=... supabase/local/reset_local_db.sh [dbname]
set -euo pipefail
DB=${1:-roadshield_local}
cd "$(dirname "$0")/../.."
dropdb --if-exists "$DB"; createdb "$DB"
P="psql -d $DB -v ON_ERROR_STOP=1 -q"
$P -f supabase/local/supabase_stub.sql 2>&1 | grep -v -E "wal_level|HINT" || true
for f in supabase/migrations/*.sql; do
  # pg_net exists only on Supabase; the stub provides net.http_post.
  sed 's/create extension if not exists pg_net with schema extensions;//' "$f" | $P
done
echo "migrations applied: $(ls supabase/migrations/*.sql | wc -l)"
psql -d "$DB" -f supabase/tests/database_security_tests.sql 2>&1 | grep -oE "ROADSHIELD_TESTS passed=[0-9]+ failed=[0-9]+"
psql -d "$DB" -f supabase/tests/enterprise_tests.sql 2>&1 | grep -oE "ENTERPRISE_TESTS passed=[0-9]+ failed=[0-9]+"
