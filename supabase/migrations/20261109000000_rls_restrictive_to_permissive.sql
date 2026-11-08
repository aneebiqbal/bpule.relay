-- ============================================================================
-- Restore PERMISSIVE policies.
--
-- 20261106170000_public_policy_roles.sql compared pg_policies.permissive to
-- the lowercase 'permissive', but PostgreSQL reports 'PERMISSIVE' (uppercase).
-- Every `to public` policy was therefore recreated AS RESTRICTIVE. A restrictive
-- policy never grants rows — it only narrows permissive ones — so the 27 tables
-- whose only policies were restrictive became invisible to `authenticated`
-- (and to `relay_app`, which inherits it), while the owner bypassed RLS and
-- never noticed.
--
-- This recreates each restrictive-only policy as PERMISSIVE with the same
-- command, USING and WITH CHECK expressions and the same application roles.
-- ============================================================================

DO $$
DECLARE
  p record;
  v_using text;
  v_check text;
  v_cmd text;
  has_permissive boolean;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_policies pp
      WHERE pp.schemaname = p.schemaname
        AND pp.tablename = p.tablename
        AND pp.cmd = p.cmd
        AND pp.permissive = 'PERMISSIVE'
    ) INTO has_permissive;
    IF has_permissive THEN CONTINUE; END IF;

    v_using := coalesce(p.qual, 'true');
    v_check := coalesce(p.with_check, p.qual, 'true');
    v_cmd := CASE lower(p.cmd)
      WHEN 'select' THEN 'select'
      WHEN 'insert' THEN 'insert'
      WHEN 'update' THEN 'update'
      WHEN 'delete' THEN 'delete'
      ELSE 'all'
    END;

    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    CASE v_cmd
      WHEN 'select' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR select TO authenticated, service_role USING (%s)', p.policyname, p.schemaname, p.tablename, v_using);
      WHEN 'insert' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR insert TO authenticated, service_role WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_check);
      WHEN 'update' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR update TO authenticated, service_role USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_using, v_check);
      WHEN 'delete' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR delete TO authenticated, service_role USING (%s)', p.policyname, p.schemaname, p.tablename, v_using);
      ELSE
        EXECUTE format('CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR all TO authenticated, service_role USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_using, v_check);
    END CASE;
  END LOOP;
END $$;

-- Verification: no public table should be restrictive-only any more.
--   select tablename from pg_policies where schemaname='public'
--   group by tablename
--   having count(*) filter (where permissive='PERMISSIVE') = 0;
--   -- expect 0 rows
