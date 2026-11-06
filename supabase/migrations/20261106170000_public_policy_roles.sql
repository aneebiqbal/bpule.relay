-- ============================================================================
-- Policy roles: `public` means every role, including the anonymous key.
--
-- A large set of policies were created `to public`. With the anon table
-- grants revoked (20261106150000) anon can no longer reach the tables, but a
-- policy that names `public` also covers every future role and would expose the
-- table the moment a grant is added again. They are recreated for the
-- application roles only: `authenticated` (which `relay_app` inherits) and
-- `service_role`.
--
-- The policy bodies are unchanged — only the role list narrows.
-- ============================================================================

do $$
declare
  p record;
  v_using text;
  v_check text;
  v_kind text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check, permissive
    from pg_policies
    where schemaname = 'public' and 'public' = any(roles)
  loop
    v_using := coalesce(p.qual, 'true');
    v_check := coalesce(p.with_check, p.qual, 'true');
    v_kind := case when p.permissive = 'permissive' then 'permissive' else 'restrictive' end;

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    case lower(p.cmd)
      when 'select' then
        execute format(
          'create policy %I on %I.%I as %s for select to authenticated, service_role using (%s)',
          p.policyname, p.schemaname, p.tablename, v_kind, v_using
        );
      when 'insert' then
        execute format(
          'create policy %I on %I.%I as %s for insert to authenticated, service_role with check (%s)',
          p.policyname, p.schemaname, p.tablename, v_kind, v_check
        );
      when 'update' then
        execute format(
          'create policy %I on %I.%I as %s for update to authenticated, service_role using (%s) with check (%s)',
          p.policyname, p.schemaname, p.tablename, v_kind, v_using, v_check
        );
      when 'delete' then
        execute format(
          'create policy %I on %I.%I as %s for delete to authenticated, service_role using (%s)',
          p.policyname, p.schemaname, p.tablename, v_kind, v_using
        );
      else
        execute format(
          'create policy %I on %I.%I as %s for all to authenticated, service_role using (%s) with check (%s)',
          p.policyname, p.schemaname, p.tablename, v_kind, v_using, v_check
        );
    end case;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select count(*) from pg_policies where schemaname='public' and 'public' = any(roles);
--   -- expect 0
-- ---------------------------------------------------------------------------
