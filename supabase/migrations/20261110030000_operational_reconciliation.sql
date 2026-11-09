-- Operational reconciliation: stale targets, coverage on merged profiles, and
-- provably-test profile data.
--
-- Targets are deactivated, never deleted, so history stays queryable.
-- Coverage on a merged/archived profile is deactivated so it stops granting
-- execution eligibility.
-- The `testing` profile is archived only after proving it has zero operating
-- references (no channel, lead, message, task, target, coverage or readiness).

create table if not exists public.relay_reconciliation_target_backup (
  id bigint generated always as identity primary key,
  target_id uuid not null,
  revenue_identity_id uuid,
  rep_id uuid,
  activity_type text,
  target_count int,
  reason text not null,
  repaired_at timestamptz not null default now()
);

-- 1. Stale target lanes.
insert into public.relay_reconciliation_target_backup
  (target_id, revenue_identity_id, rep_id, activity_type, target_count, reason)
select dt.id, dt.revenue_identity_id, dt.rep_id, dt.activity_type, dt.target_count, r.reason
  from daily_targets dt
  cross join lateral (
    select case
      when ri.status = 'archived' then 'identity_archived'
      when ri.profile_id is null then 'identity_orphan'
      when p.archived_at is not null or p.merged_into_profile_id is not null then 'person_not_active'
      when not exists (select 1 from identity_assignments ia
                         where ia.revenue_identity_id = dt.revenue_identity_id
                           and ia.rep_id = dt.rep_id) then 'rep_not_assigned'
      when exists (select 1 from profile_coverage pc
                    where pc.profile_id = ri.profile_id and pc.rep_id = dt.rep_id
                      and pc.role = 'BACKUP' and pc.active) then 'backup_only'
      else null
    end as reason
  ) r
  join revenue_identities ri on ri.id = dt.revenue_identity_id
  left join profiles p on p.id = ri.profile_id
 where dt.active and r.reason is not null;

update daily_targets dt
   set active = false, updated_at = now()
 where dt.active and exists (
   select 1 from relay_reconciliation_target_backup b where b.target_id = dt.id
 );

-- 2. Coverage rows that still grant eligibility on a merged/archived person.
update profile_coverage pc
   set active = false, updated_at = now()
 where pc.active
   and exists (
     select 1 from profiles p
      where p.id = pc.profile_id
        and (p.archived_at is not null or p.merged_into_profile_id is not null)
   );

-- 3. Provably test-only profile (zero operating references).
update profiles
   set archived_at = now(), readiness = 'incomplete', updated_at = now()
 where id = '6a4d7bea-727f-4ec0-ba7a-fd5c82a9bc6b'
   and archived_at is null
   and not exists (select 1 from revenue_identities ri where ri.profile_id = profiles.id)
   and not exists (select 1 from leads l where l.sender_profile_id = profiles.id)
   and not exists (select 1 from messages m where m.sender_profile_id = profiles.id)
   and not exists (select 1 from assigned_tasks t where t.profile_id = profiles.id)
   and not exists (select 1 from profile_coverage pc where pc.profile_id = profiles.id)
   and not exists (select 1 from profile_readiness pr where pr.profile_id = profiles.id)
   and not exists (select 1 from profile_assignments pa where pa.profile_id = profiles.id);

-- Invariants.
do $$
declare
  v_stale bigint;
  v_merged_coverage bigint;
  v_test_active bigint;
begin
  select count(*) into v_stale from daily_targets dt
   where dt.active and (
     exists (select 1 from revenue_identities ri where ri.id=dt.revenue_identity_id
               and (ri.status='archived' or ri.profile_id is null))
     or not exists (select 1 from identity_assignments ia
                     where ia.revenue_identity_id=dt.revenue_identity_id and ia.rep_id=dt.rep_id));

  if v_stale <> 0 then
    raise exception 'target reconciliation failed: % stale active targets remain', v_stale;
  end if;

  select count(*) into v_merged_coverage from profile_coverage pc
    join profiles p on p.id = pc.profile_id
   where pc.active and (p.archived_at is not null or p.merged_into_profile_id is not null);
  if v_merged_coverage <> 0 then
    raise exception 'coverage cleanup failed: % active rows remain on inactive people', v_merged_coverage;
  end if;

  select count(*) into v_test_active from profiles
   where id = '6a4d7bea-727f-4ec0-ba7a-fd5c82a9bc6b' and archived_at is null;
  if v_test_active <> 0 then
    raise exception 'test profile cleanup failed: still active';
  end if;
end $$;
