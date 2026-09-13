-- 0025: Reload PostgREST schema cache.
--
-- New tables from 0022 and 0023 exist in the database but PostgREST's
-- schema cache hasn't picked them up yet. This migration forces a reload.
-- Without this, the REST API returns "table not found" for tables that
-- physically exist.

NOTIFY pgrst, 'reload schema';
