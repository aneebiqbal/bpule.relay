#!/usr/bin/env bash
# ============================================================================
# Neon -> Aiven production data migration (sections 3-4).
#
# Restores a FULL Neon dump into a FRESH Aiven database, so the Aiven copy is
# the production dataset exactly: schema, data, functions, indexes,
# constraints, triggers, RLS policies, sequences.
#
# Roles are NOT in a pg_dump (only pg_dumpall dumps them), so they are created
# here after the restore. Ownership/ACL is stripped by --no-owner --no-acl and
# re-granted deterministically.
#
# Usage:
#   NEON_DATABASE_URL=... AIVEN_ADMIN_URL=... AIVEN_TARGET_DB=relay_prod \
#     bash supabase/aiven/migrate.sh
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
PG_DUMP="${PG_DUMP:-/opt/homebrew/opt/postgresql@17/bin/pg_dump}"
PG_RESTORE="${PG_RESTORE:-/opt/homebrew/opt/postgresql@17/bin/pg_restore}"

NEON="${NEON_DATABASE_URL:?set NEON_DATABASE_URL (Neon service/owner role)}"
ADMIN="${AIVEN_ADMIN_URL:?set AIVEN_ADMIN_URL (Aiven avnadmin)}"
TARGET="${AIVEN_TARGET_DB:-relay_prod}"
DUMP="${DUMP_FILE:-$ROOT/supabase/aiven/relay-neon-final.dump}"

started_at=$(date +%s)

# Point the admin connection string at the target database (drop any query
# params: Aiven's proxy uses a private CA and `sslmode=require` would defeat
# the driver's SSL config).
TARGET_URL="$(printf '%s' "$ADMIN" | sed -E 's#^(.*/)[^/?]+(\?.*)?$#\1'"$TARGET"'#')"

echo "== create fresh target database: $TARGET =="
"$PSQL" "$ADMIN" -v ON_ERROR_STOP=1 \
  -c "drop database if exists $TARGET" \
  -c "create database $TARGET"

echo "== dump Neon =="
"$PG_DUMP" "$NEON" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$DUMP"
dump_size="$(ls -lh "$DUMP" | awk '{print $5}')"
echo "DUMP SIZE: $dump_size"
echo "DUMP DURATION: $(( $(date +%s) - started_at ))s"

echo "== restore into $TARGET =="
"$PG_RESTORE" \
  --dbname="$TARGET_URL" \
  --no-owner \
  --no-acl \
  "$DUMP" 2>&1 | tee /tmp/aiven-restore.log
restore_errors="$(grep -c 'ERROR' /tmp/aiven-restore.log || true)"
echo "RESTORE ERRORS: $restore_errors"

echo "== analyze =="
"$PSQL" "$TARGET_URL" -c "analyze" >/dev/null

echo "== recreate application roles =="
# Passwords come from the environment; never hardcode them.
"$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin if not exists (select 1 from pg_roles where rolname='relay_app') then
  create role relay_app login password '${RELAY_APP_PASSWORD:?set RELAY_APP_PASSWORD}';
end if; end \$\$;
do \$\$ begin if not exists (select 1 from pg_roles where rolname='relay_service') then
  create role relay_service login password '${RELAY_SERVICE_PASSWORD:?set RELAY_SERVICE_PASSWORD}' bypassrls;
end if; end \$\$;
SQL

echo "== grant runtime access =="
"$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema public to relay_app, relay_service;
grant select, insert, update, delete on all tables in schema public to relay_app;
grant select, insert, update, delete on all tables in schema public to relay_service;
grant usage, select on all sequences in schema public to relay_app, relay_service;
grant execute on all functions in schema public to relay_app, relay_service;
alter default privileges in schema public grant all on tables to relay_app, relay_service;
SQL

echo "== done =="
echo "TARGET_URL: $TARGET_URL"
