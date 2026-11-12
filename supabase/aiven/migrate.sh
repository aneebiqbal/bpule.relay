#!/usr/bin/env bash
# ============================================================================
# Neon -> Aiven production data migration.
#
# Creates a FRESH Aiven database and restores a full Neon dump into it, so the
# Aiven copy is byte-for-byte the production dataset (schema + data + functions
# + RLS). The existing `relay_cert` certification database is left untouched.
#
# Prerequisites:
#   NEON_DATABASE_URL     full Neon connection string (service/owner role)
#   AIVEN_ADMIN_URL       Aiven admin connection string (avnadmin, defaultdb)
#   AIVEN_TARGET_DB       target database name on Aiven (created if absent)
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

NEON="${NEON_DATABASE_URL:?set NEON_DATABASE_URL}"
ADMIN="${AIVEN_ADMIN_URL:?set AIVEN_ADMIN_URL}"
TARGET="${AIVEN_TARGET_DB:-relay_prod}"
DUMP="${DUMP_FILE:-$ROOT/supabase/aiven/relay-neon.dump}"

HOST="$("$PSQL" "$ADMIN" -Atc 'select inet_server_addr()' 2>/dev/null || echo localhost)"
# Aiven requires the target database to exist; create it from the admin DB.
echo "== create target database $TARGET =="
"$PSQL" "$ADMIN" -v ON_ERROR_STOP=1 \
  -c "drop database if exists $TARGET" \
  -c "create database $TARGET"

# Point the admin connection string at the new database.
TARGET_URL="$(printf '%s' "$ADMIN" | sed -E "s#/[^/?]+(\?|\$)#/$TARGET\1#")"

echo "== dump Neon =="
"$PG_DUMP" "$NEON" --format=custom --no-owner --no-acl --file="$DUMP"
ls -la "$DUMP"

echo "== restore into $TARGET =="
"$PG_RESTORE" \
  --dbname="$TARGET_URL" \
  --no-owner --no-acl \
  "$DUMP"

echo "== analyze =="
"$PSQL" "$TARGET_URL" -c "analyze" >/dev/null

echo "== row counts =="
"$PSQL" "$ADMIN" -c "\dt" | head -5 || true
