-- ============================================================================
-- Role + grant rebuild for a restored Aiven database (sections 9-10).
--
-- pg_dump does not carry roles, and --no-owner/--no-acl strips ownership and
-- privileges, so this re-establishes the deterministic production boundary:
--
--   relay_app     runtime role, RLS applies, member of authenticated
--   relay_service cron/signed-callback role, bypassrls
--
-- Never run the application as avnadmin.
-- ============================================================================

do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end $$;

-- Roles are cluster-wide on Aiven; set their passwords from psql variables.
-- Usage: psql -v relay_app_pw=... -v relay_service_pw=... -f grants.sql
alter role relay_app password :'relay_app_pw';
alter role relay_service password :'relay_service_pw';

-- relay_app is a member of authenticated so the `to authenticated` policies apply.
do $$ begin
  if not exists (select 1 from pg_auth_members m join pg_roles p on p.oid = m.roleid
                  where p.rolname = 'authenticated' and m.member = 'relay_app'::regrole) then
    grant authenticated to relay_app;
  end if;
end $$;

-- Application tables: relay_app gets full DML (RLS still applies), the service
-- role is privileged for cron/signed callbacks.
grant usage on schema public to relay_app, relay_service;
grant select, insert, update, delete on all tables in schema public to relay_app;
grant select, insert, update, delete on all tables in schema public to relay_service;
grant usage, select on all sequences in schema public to relay_app, relay_service;
grant execute on all functions in schema public to relay_app, relay_service;

-- The auth/extensions schemas stay owner-only; the app never writes them
-- through the runtime connection. (Supabase-only schemas such as `storage`
-- are absent on Neon and therefore on Aiven.)
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    revoke all on schema auth from relay_app, relay_service;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    revoke all on schema storage from relay_app, relay_service;
  end if;
end $$;

alter default privileges in schema public grant all on tables to relay_app, relay_service;
alter default privileges in schema public grant all on sequences to relay_app, relay_service;
alter default privileges in schema public grant all on functions to relay_app, relay_service;
