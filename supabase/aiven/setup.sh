#!/usr/bin/env bash
# ============================================================================
# Aiven / standard Postgres certification build.
#
#   reset -> bootstrap -> base migrations (tolerant) -> catch-up -> repairs
#         -> loose SQL -> numbered chain
#
# Usage:  SERVICE_DATABASE_URL=<aiven-url> bash supabase/aiven/setup.sh
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
URL="${SERVICE_DATABASE_URL:?set SERVICE_DATABASE_URL to the Aiven admin URL}"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
MIG="$ROOT/supabase/migrations"
MARKS="$ROOT/supabase/aiven/.applied"

mkdir -p "$MARKS"

mark() { printf '%s\n' "$1" >> "$MARKS/versions"; }
is_marked() { grep -qx "$1" "$MARKS/versions" 2>/dev/null; }
: > "$MARKS/versions"

echo "== reset =="
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -c "drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists extensions cascade; drop schema if exists supabase_migrations cascade;" >/dev/null || exit 1

echo "== bootstrap =="
"$PSQL" "$URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/aiven/bootstrap.sql" >/dev/null || { echo "bootstrap FAILED"; exit 1; }

echo "== base migrations (tolerant) =="
for file in $(find "$MIG" -maxdepth 1 -name '[0-9]*_*.sql' | sort); do
  version=$(basename "$file" | sed -E 's/^([0-9]+)_.*/\1/')
  if [ "$version" -ge 20261004000000 ]; then break; fi
  if "$PSQL" "$URL" -q -v ON_ERROR_STOP=0 --single-transaction -f "$file" >/dev/null 2>&1; then
    mark "$version"
  fi
done

echo "== catch-up (20261004 - 20261019) =="
"$PSQL" "$URL" -q -v ON_ERROR_STOP=0 --single-transaction -f "$ROOT/supabase/catchup/2026-10-19-apply.sql" >/dev/null 2>&1
for file in $(find "$MIG" -maxdepth 1 -name '[0-9]*_*.sql' | sort); do
  version=$(basename "$file" | sed -E 's/^([0-9]+)_.*/\1/')
  if [ "$version" -ge 20261004000000 ] && [ "$version" -le 20261019000003 ]; then mark "$version"; fi
done

echo "== repairs =="
"$PSQL" "$URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/aiven/repairs.sql" >/dev/null || { echo "repairs FAILED"; exit 1; }

echo "== loose files =="
for file in "$ROOT/supabase/apply-scoring-v2-migrations.sql" "$ROOT/supabase/apply_pending_2026-10-25.sql" "$ROOT/supabase/pending-production-fixes.sql" "$ROOT/supabase/apply_observability_ddl.sql"; do
  [ -f "$file" ] && "$PSQL" "$URL" -q -v ON_ERROR_STOP=0 --single-transaction -f "$file" >/dev/null 2>&1
done

echo "== numbered chain =="
# Persist the marks so the chain knows what is already applied.
"$PSQL" "$URL" -q -v ON_ERROR_STOP=1 -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, applied_at timestamptz default now());" >/dev/null
while read -r version; do
  "$PSQL" "$URL" -q -c "insert into supabase_migrations.schema_migrations (version) values ('$version') on conflict do nothing" >/dev/null
done < "$MARKS/versions"

applied=0; failed=0
while IFS= read -r file; do
  version=$(basename "$file" | sed -E 's/^([0-9]+)_.*/\1/')
  if ! printf '%s' "$version" | grep -qE '^[0-9]+$'; then continue; fi
  if is_marked "$version"; then continue; fi
  # Tolerant of demo-data errors, but only record the version when the
  # migration produced no ERROR (otherwise the schema would be silently
  # incomplete while parity claims it is applied).
  "$PSQL" "$URL" -q -v ON_ERROR_STOP=0 --single-transaction -f "$file" -c "insert into supabase_migrations.schema_migrations (version) values ('$version') on conflict do nothing" >/tmp/aiven-step.log 2>&1
  if grep -q "ERROR:" /tmp/aiven-step.log; then
    echo "FAILED $version"; sed -n '1,3p' /tmp/aiven-step.log | sed 's/^/    /'; failed=$((failed+1))
  else
    applied=$((applied+1)); mark "$version"
  fi
done < <(find "$MIG" -maxdepth 1 -name '[0-9]*_*.sql' | sort)
echo "chain applied=$applied failed=$failed"
