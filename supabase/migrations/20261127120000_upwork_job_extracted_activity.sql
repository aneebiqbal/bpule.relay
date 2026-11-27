-- BUG-44: saving an Upwork extraction is a distinct measurable action.
-- Seed-only DML; no schema changes. Idempotent.

insert into execution_activity_definitions
  (channel_id, organization_id, key, label, description, counting_mode, evidence_policy,
   targetable, enabled, effort_minutes, recording_modes, outcome_class)
select c.id, null, 'job_extracted', 'Jobs extracted',
       'One Upwork listing saved from a paste.', 'distinct_prospect', 'internal_record',
       true, true, 2, '{manual}', 'research'
from execution_channels c
where c.organization_id is null and c.slug = 'upwork'
on conflict do nothing;

-- BUG-46 housekeeping: a stored next_followup_at that no longer has a real
-- send/cadence behind it must not keep a lead in the Follow-ups queue.
update conversation_states s
   set next_followup_at = null, updated_at = now()
  from leads l
 where l.id = s.lead_id
   and s.next_followup_at is not null
   and (
     s.followup_count >= 3
     or l.status in ('won', 'lost', 'dead', 'no')
     or not exists (
       select 1 from messages m
        where m.lead_id = s.lead_id
          and m.direction = 'outbound'
          and m.sent_at is not null
     )
   );
