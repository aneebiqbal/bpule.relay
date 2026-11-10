-- ============================================================================
-- RELAY V5.1 — BACKFILL / SWITCH PHASE
--
-- Runs ONLY after the V5.1 code is deployed and healthy. Transactional:
-- snapshots every touched row, maps legacy statuses to canonical, creates one
-- application per job from real submission evidence, backfills directions,
-- connects and reply timestamps.
--
-- Evidence rules:
--   application = a sent cover proposal (type='cover', sent_text not null)
--   status recovery = a job with an application but a pre-deploy status
--   connects_spent = upwork_jobs.connects_used ONLY when proven; else NULL
--   direction = the old writer's type mapping: reply=inbound, cover/followup=outbound
--   ambiguous jobs (no sent cover, no event) are NOT coerced into applications
-- ============================================================================

begin;

-- ============================================================================
-- 0. Backup (rollback plan: restore from these tables)
-- ============================================================================
create table if not exists public.relay_reconciliation_v51_jobs_backup as select * from upwork_jobs;
create table if not exists public.relay_reconciliation_v51_messages_backup as select * from upwork_messages;
create table if not exists public.relay_reconciliation_v51_applications_backup as select * from upwork_applications;
create table if not exists public.relay_reconciliation_v51_events_backup as
  select * from action_events where action_type like 'UPWORK%';

create table if not exists public.relay_reconciliation_v51_log (
  id bigint generated always as identity primary key,
  step text not null,
  count bigint not null default 0,
  at timestamptz not null default now()
);

-- Before counts
insert into public.relay_reconciliation_v51_log (step, count)
select 'before_jobs', count(*) from upwork_jobs;
insert into public.relay_reconciliation_v51_log (step, count)
select 'before_applications', count(*) from upwork_applications;
insert into public.relay_reconciliation_v51_log (step, count)
select 'before_messages', count(*) from upwork_messages;

-- ============================================================================
-- 1. Status mapping (exact counts logged)
-- ============================================================================
insert into public.relay_reconciliation_v51_log (step, count)
select 'map_new_to_saved', count(*) from upwork_jobs where status = 'new';
insert into public.relay_reconciliation_v51_log (step, count)
select 'map_drafted_to_draft_ready', count(*) from upwork_jobs where status = 'drafted';
insert into public.relay_reconciliation_v51_log (step, count)
select 'map_applied_to_applied', count(*) from upwork_jobs where status = 'applied';
insert into public.relay_reconciliation_v51_log (step, count)
select 'map_replied_to_client_replied', count(*) from upwork_jobs where status = 'replied';
insert into public.relay_reconciliation_v51_log (step, count)
select 'map_dead_to_archived', count(*) from upwork_jobs where status = 'dead';
insert into public.relay_reconciliation_v51_log (step, count)
select 'map_no_to_archived', count(*) from upwork_jobs where status = 'no';

update upwork_jobs set status = case status
  when 'new' then 'SAVED'
  when 'drafted' then 'DRAFT_READY'
  when 'applied' then 'APPLIED'
  when 'replied' then 'CLIENT_REPLIED'
  when 'dead' then 'ARCHIVED'
  when 'no' then 'ARCHIVED'
  else status
end,
updated_at = now()
where status in ('new','drafted','applied','replied','dead','no');

-- ============================================================================
-- 2. Applications from real submission evidence (one per job)
-- ============================================================================
insert into upwork_applications (
  organization_id, job_id, rep_id, person_profile_id, revenue_identity_id,
  submitted_at, proposal_text, connects_spent, boost_connects, screening_answers, status
)
select
  j.organization_id,
  j.id,
  j.owner_rep_id,
  j.sender_profile_id,
  (select ri.id from revenue_identities ri
    where ri.profile_id = j.sender_profile_id and ri.channel = 'upwork' and ri.status = 'active'
    limit 1),
  m.sent_at,
  m.sent_text,
  j.connects_used,
  0,
  '[]'::jsonb,
  'submitted'
from upwork_jobs j
join lateral (
  select sent_text, sent_at
    from upwork_messages
   where job_id = j.id and type = 'cover' and sent_text is not null
   order by sent_at desc
   limit 1
) m on true
where not exists (select 1 from upwork_applications a where a.job_id = j.id)
on conflict (job_id) do nothing;

insert into public.relay_reconciliation_v51_log (step, count)
select 'applications_created', count(*) from upwork_applications;

-- ============================================================================
-- 3. Recover statuses for jobs that were applied before the status column caught up
-- ============================================================================
update upwork_jobs j
   set status = 'APPLIED', updated_at = now()
 where j.status in ('SAVED','DRAFT_READY')
   and exists (select 1 from upwork_applications a where a.job_id = j.id);

insert into public.relay_reconciliation_v51_log (step, count)
select 'status_recovered_to_applied', count(*) from upwork_jobs j
 where j.status = 'APPLIED'
   and exists (select 1 from upwork_applications a where a.job_id = j.id);

-- ============================================================================
-- 4. Reply timestamps (from deterministic inbound reply rows)
-- ============================================================================
update upwork_applications a
   set first_reply_at = r.first_reply,
       latest_reply_at = r.latest_reply,
       updated_at = now()
  from (
    select job_id, min(created_at) as first_reply, max(created_at) as latest_reply
      from upwork_messages
     where type = 'reply'
     group by job_id
  ) r
 where r.job_id = a.job_id;

insert into public.relay_reconciliation_v51_log (step, count)
select 'applications_with_reply', count(*) from upwork_applications where first_reply_at is not null;

-- ============================================================================
-- 5. Message direction (the old writer's type mapping is deterministic)
--    The destructive migration defaulted every row to 'outbound'; this corrects
--    the inbound client replies from the type the old writer used.
-- ============================================================================
update upwork_messages
   set direction = case type when 'reply' then 'inbound' else 'outbound' end;

insert into public.relay_reconciliation_v51_log (step, count)
select 'messages_direction_backfilled', count(*) from upwork_messages where direction = 'inbound';

-- ============================================================================
-- 6. Connects: only proven actual spend is claimed (already set from connects_used)
-- ============================================================================
insert into public.relay_reconciliation_v51_log (step, count)
select 'applications_with_known_connects', count(*) from upwork_applications where connects_spent is not null;
insert into public.relay_reconciliation_v51_log (step, count)
select 'applications_with_unknown_connects', count(*) from upwork_applications where connects_spent is null;

-- After counts
insert into public.relay_reconciliation_v51_log (step, count)
select 'after_jobs', count(*) from upwork_jobs;
insert into public.relay_reconciliation_v51_log (step, count)
select 'after_applications', count(*) from upwork_applications;
insert into public.relay_reconciliation_v51_log (step, count)
select 'after_messages', count(*) from upwork_messages;

-- Ambiguous jobs: applied/replied status with no application and no sent cover.
insert into public.relay_reconciliation_v51_log (step, count)
select 'ambiguous_jobs_without_application', count(*)
  from upwork_jobs j
 where j.status in ('APPLIED','CLIENT_REPLIED')
   and not exists (select 1 from upwork_applications a where a.job_id = j.id);

commit;
