#!/usr/bin/env bash
# ============================================================================
# Source-of-truth snapshot from Neon (section 2). Read-only.
#
# Captures database size, table/row counts, migration/function/policy counts,
# and high-value aggregates. Saved as the canonical parity reference.
#
# Usage:  NEON_DATABASE_URL=... bash supabase/aiven/source-snapshot.sh
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
NEON="${NEON_DATABASE_URL:?set NEON_DATABASE_URL}"
OUT="${1:-$ROOT/supabase/aiven/neon-source-snapshot.json}"

mkdir -p "$(dirname "$OUT")"

"$PSQL" "$NEON" -Atc "
select json_build_object(
  'captured_at', now(),
  'database', current_database(),
  'size', pg_size_pretty(pg_database_size(current_database())),
  'tables', (select count(*) from pg_tables where schemaname='public'),
  'rls_tables', (select count(*) from pg_tables where schemaname='public' and rowsecurity),
  'policies', (select count(*) from pg_policies where schemaname='public'),
  'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'migrations', (select count(*) from supabase_migrations.schema_migrations),
  'sequences', (select count(*) from information_schema.sequences where sequence_schema='public'),
  'triggers', (select count(*) from information_schema.triggers where trigger_schema='public')
)" > "$OUT"

echo "== row counts =="
"$PSQL" "$NEON" -Atc "
select json_object_agg(t, c)
from (
  select relname as t, n_live_tup as c
  from pg_stat_user_tables
  where schemaname='public'
  order by relname
) s" > "$OUT.rows"

echo "== high-value aggregates =="
"$PSQL" "$NEON" -Atc "
select json_build_object(
  'profiles', (select count(*) from profiles),
  'revenue_identities', (select count(*) from revenue_identities),
  'leads', (select count(*) from leads),
  'messages', (select count(*) from messages),
  'assigned_tasks', (select count(*) from assigned_tasks),
  'action_events', (select count(*) from action_events),
  'daily_target_plans', (select count(*) from daily_target_plans),
  'daily_accountability', (select count(*) from daily_accountability),
  'coverage_assignments', (select count(*) from coverage_assignments),
  'responsibility_acknowledgements', (select count(*) from responsibility_acknowledgements),
  'upwork_jobs', (select count(*) from upwork_jobs),
  'upwork_applications', (select count(*) from upwork_applications),
  'captured_prospects', (select count(*) from captured_prospects),
  'provider_saved_searches', (select count(*) from provider_saved_searches),
  'contact_points', (select count(*) from contact_points)
)" > "$OUT.aggregates"

echo "== migration versions =="
"$PSQL" "$NEON" -Atc "select version from supabase_migrations.schema_migrations order by version" > "$OUT.migrations"

echo "saved: $OUT*"
