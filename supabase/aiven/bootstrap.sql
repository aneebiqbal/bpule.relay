-- ============================================================================
-- Aiven / standard PostgreSQL bootstrap for Relay.
--
-- The Relay migrations were written for Supabase and expect a few
-- provider-compatibility schemas and roles. This bootstrap creates them on a
-- standard PostgreSQL host so the migration chain applies unchanged:
--
--   auth      — auth.uid() / auth.role() + the auth.users / auth.identities
--               tables the migrations reference
--   storage   — a minimal storage.buckets / storage.objects + foldername()
--               (Supabase Storage stays the object store; the DB shim only
--               lets the schema and RLS policies apply)
--   extensions— pgcrypto in the `extensions` schema (Supabase convention)
--   roles     — anon / authenticated / service_role / relay_app / relay_service
--
-- It does NOT create an Aiven-specific adapter; the application uses
-- src/lib/db/postgres.ts for any standard Postgres host.
-- ============================================================================

-- 1. Roles (idempotent) ------------------------------------------------------
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'neondb_owner') then create role neondb_owner nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'storage_admin') then create role storage_admin nologin; end if; end $$;

-- Runtime role: RLS applies, member of `authenticated` so the policies apply.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'relay_app') then create role relay_app login password 'relay_app_cert_632' in role authenticated; end if; end $$;
-- Service role: the trusted boundary for cron/signed callbacks (RLS bypass).
do $$ begin if not exists (select 1 from pg_roles where rolname = 'relay_service') then create role relay_service login password 'relay_service_cert_632' bypassrls; end if; end $$;

-- 2. Extensions schema (Supabase installs pgcrypto here) ----------------------
create schema if not exists public;
grant usage on schema public to authenticated, anon, service_role;
alter default privileges for role avnadmin in schema public
  grant all on tables to relay_app, relay_service;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector;

-- 3. auth schema compatibility ----------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists auth.identities (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  identity_data jsonb,
  provider text,
  provider_id text,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The app's identity travels in app.current_user_id (set by the DB adapter).
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.current_user_id', true), ''),
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select 'authenticated'
$$;

-- Neon Auth internal mapping table (referenced by a later migration).
create table if not exists public.auth_user_mapping (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  neon_auth_user_id uuid,
  email text,
  created_at timestamptz default now()
);

-- 4. storage schema compatibility (DB side only) -----------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit int,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- 5. Migration bookkeeping ----------------------------------------------------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  applied_at timestamptz default now()
);

-- 6. Default privileges for the tables the migrations create ------------------
alter default privileges for role avnadmin in schema public
  grant all on tables to relay_app, relay_service;
alter default privileges for role avnadmin in schema public
  grant all on sequences to relay_app, relay_service;
alter default privileges for role avnadmin in schema public
  grant all on functions to relay_app, relay_service;
