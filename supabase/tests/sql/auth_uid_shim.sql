-- ISOLATED DATABASE ONLY. Run as supabase_admin on a bare supabase/postgres
-- image before the RLS fixtures. The image ships the legacy auth.uid() that
-- reads only `request.jwt.claim.sub`; hosted Supabase (GoTrue migrations)
-- also reads `request.jwt.claims`, which is what the harness sets.
create or replace function auth.uid() returns uuid
language sql stable as
$$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
