-- Runtime grants for the Phase 2–4 application tables.
--
-- The first grants migration gave authenticated users SELECT only, but the
-- admin APIs write through the CALLER's session (createServerSupabase), not the
-- service role. RLS remains the authorization boundary:
--   * channels / definitions / aliases / sync requests: writes require
--     is_org_admin() plus org scoping;
--   * handoffs / retention runs: admin-only by policy.
--
-- This migration is idempotent and additive; it never revokes privileges.

grant usage on schema public to authenticated;

grant select, insert, update, delete on execution_channels to authenticated;
grant select, insert, update, delete on execution_activity_definitions to authenticated;
-- Aliases are seed-managed: read-only for client sessions.
grant select on execution_activity_aliases to authenticated;
grant select, insert on job_sync_requests to authenticated;
grant select, insert on responsibility_handoffs to authenticated;
grant select, insert on retention_runs to authenticated;

comment on table execution_channels is
  'Canonical execution channel definitions. NULL organization_id = built-in template; custom channels are org-scoped. Writes are RLS-limited to org admins.';
