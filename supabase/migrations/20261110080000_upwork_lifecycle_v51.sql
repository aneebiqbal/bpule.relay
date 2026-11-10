-- ============================================================================
-- RELAY V5.1 — SUPERSEDED (no-op)
--
-- Version 20261110080000 was applied to production externally as the original
-- destructive V5.1 lifecycle migration (status constraint widened to the eight
-- canonical states, upwork_applications reshaped, submit_upwork_application
-- created). The safe cutover was then completed by:
--   20261110110000_upwork_v51_backfill.sql   (applications, directions, connects)
--   20261110120000_upwork_v51_contract.sql   (strict constraint, legacy columns)
--
-- This file is intentionally a no-op so a migration runner cannot re-apply a
-- constraint downgrade. Do not edit it back into a live migration.
-- ============================================================================

select 1;
