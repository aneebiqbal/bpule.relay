#!/usr/bin/env bash
# ============================================================================
# Backup / restore certification (section 30).
#
# Takes an independent dump of the restored Aiven database and restores it into
# a disposable database, then verifies schema + row parity. A backup that has
# never been restored is not certified.
#
# Usage:  AIVEN_ADMIN_URL=... AIVEN_SOURCE_DB=relay_prod \
#           AIVEN_RESTORE_DB=relay_restore_test bash supabase/aiven/backup-restore-test.sh
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
# Aiven runs PostgreSQL 18; pg_dump must be >= the server version.
PG18="$(ls -d /opt/homebrew/opt/postgresql@18/bin 2>/dev/null || true)"
if [ -n "$PG18" ] && [ -x "$PG18/pg_dump" ]; then
  PG_DUMP="${PG_DUMP:-$PG18/pg_dump}"
  PG_RESTORE="${PG_RESTORE:-$PG18/pg_restore}"
else
  PG_DUMP="${PG_DUMP:-/opt/homebrew/opt/postgresql@17/bin/pg_dump}"
  PG_RESTORE="${PG_RESTORE:-/opt/homebrew/opt/postgresql@17/bin/pg_restore}"
fi

ADMIN="${AIVEN_ADMIN_URL:?set AIVEN_ADMIN_URL}"
SOURCE="${AIVEN_SOURCE_DB:-relay_prod}"
RESTORE="${AIVEN_RESTORE_DB:-relay_restore_test}"
DUMP="${DUMP_FILE:-$ROOT/supabase/aiven/relay-aiven-backup.dump}"

SOURCE_URL="$(printf '%s' "$ADMIN" | sed -E 's#^(.*/)[^/?]+(\?.*)?$#\1'"$SOURCE"'#')"
RESTORE_URL="$(printf '%s' "$ADMIN" | sed -E 's#^(.*/)[^/?]+(\?.*)?$#\1'"$RESTORE"'#')"

echo "== dump $SOURCE =="
"$PG_DUMP" "$SOURCE_URL" --format=custom --no-owner --no-acl --file="$DUMP"
echo "DUMP SIZE: $(ls -lh "$DUMP" | awk '{print $5}')"

echo "== restore into $RESTORE =="
"$PSQL" "$ADMIN" -v ON_ERROR_STOP=1 \
  -c "drop database if exists $RESTORE" \
  -c "create database $RESTORE" >/dev/null
"$PG_RESTORE" --dbname="$RESTORE_URL" --no-owner --no-acl "$DUMP" 2>&1 | tee /tmp/aiven-backup-restore.log
echo "RESTORE ERRORS: $(grep -c 'ERROR' /tmp/aiven-backup-restore.log || true)"

echo "== parity =="
"$PSQL" "$SOURCE_URL" -Atc "
select 'source '||t||'='||n from (
  select 'tables' t, count(*) n from pg_tables where schemaname='public'
  union all select 'rls', count(*) from pg_tables where schemaname='public' and rowsecurity
  union all select 'policies', count(*) from pg_policies where schemaname='public'
  union all select 'migrations', count(*) from supabase_migrations.schema_migrations
) s" > /tmp/src-parity.txt
"$PSQL" "$RESTORE_URL" -Atc "
select 'restore '||t||'='||n from (
  select 'tables' t, count(*) n from pg_tables where schemaname='public'
  union all select 'rls', count(*) from pg_tables where schemaname='public' and rowsecurity
  union all select 'policies', count(*) from pg_policies where schemaname='public'
  union all select 'migrations', count(*) from supabase_migrations.schema_migrations
) s" > /tmp/dst-parity.txt
cat /tmp/src-parity.txt /tmp/dst-parity.txt

echo "== row counts (drift check) =="
"$PSQL" "$SOURCE_URL" -Atc "
select tablename from pg_tables where schemaname='public' order by 1" > /tmp/tables.txt
drift=0
while read -r t; do
  a=$("$PSQL" "$SOURCE_URL" -Atc "select count(*) from \"$t\"")
  b=$("$PSQL" "$RESTORE_URL" -Atc "select count(*) from \"$t\"")
  [ "$a" = "$b" ] || { echo "DRIFT $t: $a vs $b"; drift=$((drift+1)); }
done < /tmp/tables.txt
echo "ROW DRIFT TABLES: $drift"
