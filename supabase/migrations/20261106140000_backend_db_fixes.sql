-- ============================================================================
-- Backend database fixes found while exercising every write path.
--
-- 1. email_oauth_challenges: the mailbox CONNECT route inserts the PKCE
--    challenge with the authenticated client; only the callback (service role)
--    reads or consumes it. The table had RLS enabled with no policy at all, so
--    the insert was denied the moment RLS was actually enforced (production
--    currently connects as neondb_owner, which bypasses RLS and masks this).
--
-- 2. coverage_assignments: the approve flow already ends the previous
--    assignment before activating the next, but the database now enforces one
--    ACTIVE coverage per profile instead of relying on the route.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Mailbox OAuth challenge insert (authenticated, org-scoped)
-- ---------------------------------------------------------------------------

drop policy if exists "eoc_insert" on email_oauth_challenges;
create policy "eoc_insert" on email_oauth_challenges for insert
  to authenticated with check (organization_id = current_org_id());

comment on table email_oauth_challenges is
  'Server-side PKCE verifier and single-use marker for a mailbox OAuth handshake. A replayed state is rejected because consumed_at is already set. The connect route inserts as the authenticated caller; the callback consumes as the service role.';

-- ---------------------------------------------------------------------------
-- 2. One active coverage per profile
-- ---------------------------------------------------------------------------

create unique index if not exists ca_one_active_profile_idx
  on coverage_assignments (profile_id) where status = 'ACTIVE';

comment on index ca_one_active_profile_idx is
  'A profile has at most one active temporary coverage. Restores and revocations end the previous assignment before a new one is activated.';

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select policyname, cmd from pg_policies where tablename = 'email_oauth_challenges';
--   select indexname, indexdef from pg_indexes where indexname = 'ca_one_active_profile_idx';
-- ---------------------------------------------------------------------------
