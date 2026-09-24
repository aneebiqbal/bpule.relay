-- 20261001000003: Widen leads.score check constraint to allow the canonical
-- 0-100 scale, not just the legacy 0-12 rubric scale.
--
-- leads_score_check was set to `score between -2 and 14` back when every
-- lead's score column held only the legacy rubric's 0-12(-ish) value. A
-- separate fix (unifying /api/leads and /api/prospect/save to both store
-- the raw canonicalScore, 0-100, in this same column instead of one of them
-- dividing it by 10) made every new save with a canonical score above 14
-- violate this constraint outright — blocking lead creation entirely.
--
-- The legacy CSV import path (/api/leads/import) still writes the old 0-12
-- scale via computeScore(), so the constraint must keep allowing that range
-- too; -2 to 100 covers both without an OR condition, since 14 is already
-- inside 0-100.

alter table leads drop constraint if exists leads_score_check;
alter table leads add constraint leads_score_check check (score between -2 and 100);
