-- Upwork / Relay attribution backfill.
--
-- Only rows whose attribution is proven by an existing relationship are
-- repaired. Anything not derivable is left NULL rather than guessed.
--
--   relay_runs.sender_profile_id   <- leads.sender_profile_id via primary_entity_id
--   relay_runs.revenue_identity_id <- leads.revenue_identity_id via primary_entity_id
--   relay_events.revenue_identity_id <- leads via entity_id, then via relay_run_id
--   upwork_jobs.sender_profile_id  <- upwork_messages.sender_profile_id via job_id

create table if not exists public.relay_reconciliation_attribution_backup (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  column_name text not null,
  old_value uuid,
  new_value uuid,
  repaired_at timestamptz not null default now()
);

-- Relay runs: sender + identity from the lead they operate on.
insert into public.relay_reconciliation_attribution_backup
  (table_name, row_id, column_name, old_value, new_value)
select 'relay_runs', rr.id, 'sender_profile_id', rr.sender_profile_id, l.sender_profile_id
  from relay_runs rr join leads l on l.id = rr.primary_entity_id
 where rr.sender_profile_id is null and l.sender_profile_id is not null;

update relay_runs rr set sender_profile_id = l.sender_profile_id
  from leads l
 where l.id = rr.primary_entity_id
   and rr.sender_profile_id is null
   and l.sender_profile_id is not null;

insert into public.relay_reconciliation_attribution_backup
  (table_name, row_id, column_name, old_value, new_value)
select 'relay_runs', rr.id, 'revenue_identity_id', rr.revenue_identity_id, l.revenue_identity_id
  from relay_runs rr join leads l on l.id = rr.primary_entity_id
 where rr.revenue_identity_id is null and l.revenue_identity_id is not null;

update relay_runs rr set revenue_identity_id = l.revenue_identity_id
  from leads l
 where l.id = rr.primary_entity_id
   and rr.revenue_identity_id is null
   and l.revenue_identity_id is not null;

-- Relay events: identity from the lead entity, then from the run's lead.
insert into public.relay_reconciliation_attribution_backup
  (table_name, row_id, column_name, old_value, new_value)
select 'relay_events', re.id, 'revenue_identity_id', re.revenue_identity_id, l.revenue_identity_id
  from relay_events re join leads l on l.id = re.entity_id
 where re.revenue_identity_id is null and l.revenue_identity_id is not null;

update relay_events re set revenue_identity_id = l.revenue_identity_id
  from leads l
 where l.id = re.entity_id
   and re.revenue_identity_id is null
   and l.revenue_identity_id is not null;

insert into public.relay_reconciliation_attribution_backup
  (table_name, row_id, column_name, old_value, new_value)
select 'relay_events', re.id, 'revenue_identity_id', re.revenue_identity_id, l.revenue_identity_id
  from relay_events re
  join relay_runs rr on rr.id = re.relay_run_id
  join leads l on l.id = rr.primary_entity_id
 where re.revenue_identity_id is null
   and l.revenue_identity_id is not null;

update relay_events re set revenue_identity_id = l.revenue_identity_id
  from relay_runs rr join leads l on l.id = rr.primary_entity_id
 where rr.id = re.relay_run_id
   and re.revenue_identity_id is null
   and l.revenue_identity_id is not null;

-- Upwork jobs: sender from the message that was actually sent for the job.
insert into public.relay_reconciliation_attribution_backup
  (table_name, row_id, column_name, old_value, new_value)
select 'upwork_jobs', uj.id, 'sender_profile_id', uj.sender_profile_id, m.sender_profile_id
  from upwork_jobs uj
  join (
    select distinct on (job_id) job_id, sender_profile_id
      from upwork_messages
     where sender_profile_id is not null
     order by job_id, created_at desc
  ) m on m.job_id = uj.id
 where uj.sender_profile_id is null;

update upwork_jobs uj set sender_profile_id = m.sender_profile_id
  from (
    select distinct on (job_id) job_id, sender_profile_id
      from upwork_messages
     where sender_profile_id is not null
     order by job_id, created_at desc
  ) m
 where m.job_id = uj.id
   and uj.sender_profile_id is null;
