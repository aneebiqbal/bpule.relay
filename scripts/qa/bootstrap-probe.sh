#!/usr/bin/env bash
# Probe: how much of the migration set applies to plain PostgreSQL once the
# Supabase-only objects are stubbed. Read-only w.r.t. any external system;
# creates/drops its own throwaway database.
set -uo pipefail
URL="${RELAY_LOCAL_BOOTSTRAP_URL:-postgres://mac@127.0.0.1:5432/postgres}"
DB="relay_bootstrap_probe"
psql "$URL" -c "drop database if exists $DB" >/dev/null 2>&1
psql "$URL" -c "create database $DB" >/dev/null 2>&1 || { echo "cannot create db"; exit 1; }
T="postgres://mac@127.0.0.1:5432/$DB"
psql "$T" -q <<'SQL' >/dev/null 2>&1
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create schema if not exists storage;
create table if not exists storage.objects (id uuid primary key default gen_random_uuid());
create schema if not exists extensions;
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid);
alter table auth.identities add column if not exists identity_data jsonb;
alter table auth.identities add column if not exists provider text;
alter table auth.identities add column if not exists last_sign_in_at timestamptz;
alter table auth.identities add column if not exists email text;
alter table auth.identities add column if not exists created_at timestamptz;
alter table auth.identities add column if not exists updated_at timestamptz;
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
create extension if not exists pgcrypto with schema extensions;
create or replace function extensions.gen_salt(p text) returns text language sql as $$ select public.gen_salt($1) $$;
create or replace function extensions.crypt(p text, s text) returns text language sql as $$ select public.crypt($1, $2) $$;
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select public.gen_random_bytes($1) $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create or replace function auth.email() returns text language sql stable as $$ select null::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
do $$ begin
  create role anon; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role; exception when duplicate_object then null; end $$;
SQL
pass=0; fail=0; failed=()
for f in $(ls supabase/migrations/*.sql | sort); do
  if psql "$T" -q -v ON_ERROR_STOP=1 -f "$f" >/tmp/probe-mig.out 2>&1; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); failed+=("$(basename "$f")")
    cp /tmp/probe-mig.out "/tmp/probe-$(basename "$f").err"
  fi
done
echo "PASS=$pass FAIL=$fail"
printf '%s\n' "${failed[@]:-}" | head -30
