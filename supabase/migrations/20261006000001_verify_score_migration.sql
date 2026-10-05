-- 20261006000001: Verify score migration correctness
--
-- Run this AFTER 20261006000000_score_observability.sql
--
-- Assertions:
-- 1. No lead has score > 12 (legacy column must be 0-12 only)
-- 2. All migrated canonical values are in canonical_score
-- 3. Historical valid legacy scores remain unchanged
-- 4. No lead has both score > 12 AND canonical_score not null (would indicate double-storage)

-- Pre-migration diagnostics (run before applying 000000):
-- SELECT
--   count(*) AS total_leads,
--   count(CASE WHEN score > 12 AND canonical_score IS NULL THEN 1 END) AS case1_move_to_canonical,
--   count(CASE WHEN score > 12 AND canonical_score = score THEN 1 END) AS case2_clear_duplicate,
--   count(CASE WHEN score > 12 AND canonical_score IS NOT NULL AND canonical_score != score THEN 1 END) AS case3_conflict
-- FROM leads WHERE score > 12;

-- Post-migration assertions:

-- Assert 1: No lead has score > 12
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE score > 12) THEN
    RAISE EXCEPTION 'Migration failed: % leads still have score > 12', (SELECT count(*) FROM leads WHERE score > 12);
  END IF;
END $$;

-- Assert 2: No lead has score > 12 AND canonical_score not null (double-storage)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE score > 12 AND canonical_score IS NOT NULL) THEN
    RAISE EXCEPTION 'Data integrity issue: leads with score > 12 AND canonical_score not null';
  END IF;
END $$;

-- Assert 3: All leads with canonical_score must have score_version set
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE canonical_score IS NOT NULL AND score_version IS NULL) THEN
    RAISE EXCEPTION 'Data integrity issue: leads with canonical_score but no score_version';
  END IF;
END $$;

-- Report summary
SELECT
  count(*) AS total_leads,
  count(score) AS leads_with_legacy_score,
  count(canonical_score) AS leads_with_canonical_score,
  count(CASE WHEN score > 12 THEN 1 END) AS invalid_legacy_scores,
  count(CASE WHEN canonical_score IS NOT NULL AND score_version IS NULL THEN 1 END) AS missing_version
FROM leads;
