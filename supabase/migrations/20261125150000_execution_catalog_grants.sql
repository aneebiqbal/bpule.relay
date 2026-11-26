-- Grants for the execution catalog + manual sync tables.
--
-- The disposable/Aiven bootstrap grants existing tables explicitly, so new
-- tables must grant their own access. Roles differ between Supabase
-- (anon/authenticated/service_role) and the Aiven deployment
-- (relay_app/relay_service); the block below grants whichever exist.
--
-- Idempotent. RLS remains the authorization boundary; these are only
-- table-level privileges.

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role', 'relay_app', 'relay_service'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'grant select on execution_channels, execution_activity_definitions, execution_activity_aliases, job_sync_requests to %I',
        role_name
      );
      if role_name in ('service_role', 'relay_service') then
        execute format(
          'grant insert, update, delete on execution_channels, execution_activity_definitions, execution_activity_aliases, job_sync_requests to %I',
          role_name
        );
      end if;
    end if;
  end loop;
end
$$;
