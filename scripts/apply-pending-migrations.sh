#!/usr/bin/env bash
# Apply every pending supabase/migrations file to the configured database and
# record its version in supabase_migrations.schema_migrations.
#
# Each migration runs in ONE transaction together with its version insert, so a
# failure rolls the migration back instead of leaving half the schema behind.
#
#   SERVICE_DATABASE_URL=... scripts/apply-pending-migrations.sh
#
# Already-recorded versions are skipped. A migration that fails is reported and
# left unrecorded, so a later run retries it.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="$(grep -E '^SERVICE_DATABASE_URL=' "$ROOT/.env.local" | head -1 | cut -d= -f2-)"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"

if [ -z "$URL" ]; then
  echo "SERVICE_DATABASE_URL is not set in .env.local" >&2
  exit 1
fi
if [ ! -x "$PSQL" ]; then
  echo "psql not found at $PSQL (set PSQL=/path/to/psql)" >&2
  exit 1
fi

recorded="$("$PSQL" "$URL" -Atc 'select version from supabase_migrations.schema_migrations' 2>/dev/null | tr -d '\r')"

applied=0
skipped=0
failed=0

while IFS= read -r file; do
  version="$(basename "$file" | sed -E 's/^([0-9]+)_.*/\1/')"
  # Only numbered migrations are versioned. Helper scripts in this directory
  # (apply_*.sql) are run by hand, never recorded.
  if ! printf '%s' "$version" | grep -qE '^[0-9]+$'; then
    continue
  fi
  if printf '%s\n' "$recorded" | grep -qx "$version"; then
    skipped=$((skipped + 1))
    continue
  fi

  printf 'applying %s ... ' "$(basename "$file")"
  if "$PSQL" "$URL" -q -v ON_ERROR_STOP=1 --single-transaction \
      -f "$file" \
      -c "insert into supabase_migrations.schema_migrations (version) values ('$version')" >/tmp/migration-out.log 2>&1; then
    echo "ok"
    applied=$((applied + 1))
  else
    echo "FAILED (see /tmp/migration-out.log)"
    sed -n '1,5p' /tmp/migration-out.log | sed 's/^/    /'
    failed=$((failed + 1))
  fi
done < <(find "$ROOT/supabase/migrations" -maxdepth 1 -name '[0-9]*_*.sql' | sort)

echo
echo "applied=$applied skipped=$skipped failed=$failed"
[ "$failed" -eq 0 ]
