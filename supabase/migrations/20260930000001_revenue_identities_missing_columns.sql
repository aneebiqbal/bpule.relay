-- 20260930000001: Backfill revenue_identities columns lost to migration-order drift
--
-- 0081_revenue_identity_os.sql and 0088_fix_missing_tables.sql both used
-- `create table if not exists revenue_identities (...)` with two different
-- column sets. Whichever migration's CREATE actually ran first "won" —
-- 0088's narrower definition (no source_kind, forbidden_claims,
-- channel_rules) is what's live. Every later migration and application code
-- path that assumed 0081's fuller shape (source_kind, forbidden_claims,
-- channel_rules) was silently writing against a table missing those
-- columns, which src/app/api/admin/revenue-identities/route.ts had been
-- working around with a runtime fallback that dropped those fields
-- entirely on insert rather than surfacing the schema gap. This migration
-- adds the missing columns directly (purely additive, existing rows get the
-- same defaults 0081 specified) so the fallback is no longer needed.

alter table revenue_identities
  add column if not exists forbidden_claims text[] not null default '{}',
  add column if not exists channel_rules jsonb not null default '{}'::jsonb,
  add column if not exists source_kind text not null default 'import';

alter table revenue_identities drop constraint if exists revenue_identities_source_kind_check;
alter table revenue_identities add constraint revenue_identities_source_kind_check
  check (source_kind in ('import', 'manual', 'synced'));
