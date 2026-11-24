#!/usr/bin/env bash
# Probe: how much of the migration set applies to plain PostgreSQL once the
# Supabase-only objects are stubbed, using dependency-aware retries for
# seed-before-DDL ordering issues. Read-only w.r.t. any external system;
# creates/drops its own throwaway database on the LOCAL cluster only.
set -uo pipefail
URL="${RELAY_LOCAL_BOOTSTRAP_URL:-postgres://mac@127.0.0.1:5433/postgres}"
case "$URL" in
  *aivencloud*|*relay_prod*) echo "refusing a non-local target: $URL"; exit 2 ;;
esac
DB="relay_bootstrap_probe"
psql "$URL" -c "drop database if exists $DB" >/dev/null 2>&1
psql "$URL" -c "create database $DB" >/dev/null 2>&1 || { echo "cannot create db"; exit 1; }
T="postgres://mac@127.0.0.1:5433/$DB"
psql "$T" -q <<'SQL' >/dev/null 2>&1
create extension if not exists pgcrypto;
create extension if not exists vector;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
alter table auth.users add column if not exists instance_id text;
alter table auth.users add column if not exists aud text;
alter table auth.users add column if not exists role text;
alter table auth.users add column if not exists email text;
alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists raw_app_meta_data jsonb;
alter table auth.users add column if not exists raw_user_meta_data jsonb;
alter table auth.users add column if not exists created_at timestamptz;
alter table auth.users add column if not exists updated_at timestamptz;
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid);
alter table auth.identities add column if not exists provider_id text;
alter table auth.identities add column if not exists identity_data jsonb;
alter table auth.identities add column if not exists provider text;
alter table auth.identities add column if not exists last_sign_in_at timestamptz;
alter table auth.identities add column if not exists email text;
alter table auth.identities add column if not exists created_at timestamptz;
alter table auth.identities add column if not exists updated_at timestamptz;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create or replace function auth.email() returns text language sql stable as $$ select null::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema if not exists storage;
create table if not exists storage.objects (id uuid primary key default gen_random_uuid());
alter table storage.objects add column if not exists bucket_id text;
alter table storage.objects add column if not exists name text;
alter table storage.objects add column if not exists owner uuid;
alter table storage.objects add column if not exists owner_id text;
alter table storage.objects add column if not exists metadata jsonb;
alter table storage.objects add column if not exists path_tokens text[];
alter table storage.objects add column if not exists mime_type text;
create or replace function storage.foldername(p text) returns text[] language sql as $$ select string_to_array(p, '/') $$;
create table if not exists storage.buckets (id text primary key);
alter table storage.buckets add column if not exists name text;
alter table storage.buckets add column if not exists public boolean;
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create or replace function extensions.gen_salt(p text) returns text language sql as $$ select public.gen_salt($1) $$;
create or replace function extensions.crypt(p text, s text) returns text language sql as $$ select public.crypt($1, $2) $$;
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select public.gen_random_bytes($1) $$;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);
alter table supabase_migrations.schema_migrations add column if not exists name text;
alter table supabase_migrations.schema_migrations add column if not exists applied_at timestamptz;
create table if not exists auth_user_mapping (id uuid primary key default gen_random_uuid(), user_id uuid, email text);
do $$ begin
  create role anon; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role; exception when duplicate_object then null; end $$;
do $$ begin
  create role neondb_owner; exception when duplicate_object then null; end $$;
do $$ begin
  create role relay_app; exception when duplicate_object then null; end $$;
SQL
ALL=()
while IFS= read -r f; do ALL+=("$f"); done < <(ls supabase/migrations/*.sql | sort)
pending=("${ALL[@]}")
pass=0; fail=0
for attempt in 1 2 3 4 5 6; do
  next=()
  progressed=0
  for f in "${pending[@]}"; do
    if psql "$T" -q -v ON_ERROR_STOP=1 -f "$f" >/tmp/probe-mig.out 2>&1; then
      pass=$((pass+1)); progressed=1
    else
      next+=("$f")
      cp /tmp/probe-mig.out "/tmp/probe-$(basename "$f").err"
    fi
  done
  pending=("${next[@]:-}")
  [ "$progressed" = "0" ] && break
  [ ${#pending[@]} -eq 0 ] && break
done
fail=${#pending[@]}
echo "PASS=$pass FAIL=$fail (after $attempt passes)"
printf '%s\n' "$(basename "${pending[@]:-}")" | sed '/^$/d' | head -30
