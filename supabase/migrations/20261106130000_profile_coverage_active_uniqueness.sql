-- ============================================================================
-- Profile coverage: uniqueness belongs to the ACTIVE chain only.
--
-- 20261106120000 created profile_coverage with full unique constraints on
-- (profile_id, rep_id) and (organization_id, profile_id, role, priority).
-- Reconfiguring a profile deactivates the previous chain instead of deleting
-- it, so the next configuration with the same rep or priority collided with
-- the retained history.
--
-- The constraints are replaced by partial unique indexes over active rows:
-- the live chain stays unique, the history stays queryable.
-- ============================================================================

alter table profile_coverage
  drop constraint if exists profile_coverage_organization_id_profile_id_role_priority_key;

alter table profile_coverage
  drop constraint if exists profile_coverage_profile_id_rep_id_key;

create unique index if not exists pc_active_chain_uniq
  on profile_coverage (organization_id, profile_id, role, priority) where active;

create unique index if not exists pc_active_rep_uniq
  on profile_coverage (profile_id, rep_id) where active;

-- At most one active primary per profile (already created by the foundation
-- migration; repeated here so a schema that predates it is still correct).
create unique index if not exists pc_one_primary_idx
  on profile_coverage (profile_id) where role = 'PRIMARY' and active;

comment on table profile_coverage is
  'Ordered coverage configuration per sending profile. PRIMARY is the owner of record; BACKUP rows are the ordered fallback chain. Inactive rows are retained history.';
