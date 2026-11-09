-- Sender attribution reconciliation.
--
-- `revenue_identity_id` is the authoritative channel attribution. The
-- denormalised `sender_profile_id` on leads/messages is rebuilt from it where
-- the identity proves the correct sender account.
--
-- Rules:
--   SAFE_REPAIR      identity present + identity.profile_id present + sender
--                    differs  -> repair to revenue_identities.profile_id
--   MISSING_IDENTITY identity is NULL -> leave unattributed, never invent one
--   HISTORICAL_KEEP  identity is NULL but a sender is stored -> keep as-is
--   ORPHAN           identity present but profile_id is NULL -> cannot repair
--
-- Every changed row is snapshotted into relay_reconciliation_sender_backup so
-- the repair is reversible.

create table if not exists public.relay_reconciliation_sender_backup (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  revenue_identity_id uuid,
  old_sender_profile_id uuid,
  new_sender_profile_id uuid,
  repaired_at timestamptz not null default now()
);

-- Leads: snapshot then repair.
insert into public.relay_reconciliation_sender_backup
  (table_name, row_id, revenue_identity_id, old_sender_profile_id, new_sender_profile_id)
select 'leads', l.id, l.revenue_identity_id, l.sender_profile_id, ri.profile_id
  from leads l
  join revenue_identities ri on ri.id = l.revenue_identity_id
 where ri.profile_id is not null
   and l.sender_profile_id is distinct from ri.profile_id;

update leads l
   set sender_profile_id = ri.profile_id
  from revenue_identities ri
 where ri.id = l.revenue_identity_id
   and ri.profile_id is not null
   and l.sender_profile_id is distinct from ri.profile_id;

-- Messages: snapshot then repair.
insert into public.relay_reconciliation_sender_backup
  (table_name, row_id, revenue_identity_id, old_sender_profile_id, new_sender_profile_id)
select 'messages', m.id, m.revenue_identity_id, m.sender_profile_id, ri.profile_id
  from messages m
  join revenue_identities ri on ri.id = m.revenue_identity_id
 where ri.profile_id is not null
   and m.sender_profile_id is distinct from ri.profile_id;

update messages m
   set sender_profile_id = ri.profile_id
  from revenue_identities ri
 where ri.id = m.revenue_identity_id
   and ri.profile_id is not null
   and m.sender_profile_id is distinct from ri.profile_id;

-- Invariant: no remaining cross-person mismatch where an identity is present.
do $$
declare
  v_leads bigint;
  v_messages bigint;
begin
  select count(*) into v_leads
    from leads l join revenue_identities ri on ri.id = l.revenue_identity_id
   where ri.profile_id is not null
     and l.sender_profile_id is not null
     and l.sender_profile_id <> ri.profile_id;
  if v_leads <> 0 then
    raise exception 'sender repair failed: % lead mismatches remain', v_leads;
  end if;

  select count(*) into v_messages
    from messages m join revenue_identities ri on ri.id = m.revenue_identity_id
   where ri.profile_id is not null
     and m.sender_profile_id is not null
     and m.sender_profile_id <> ri.profile_id;
  if v_messages <> 0 then
    raise exception 'sender repair failed: % message mismatches remain', v_messages;
  end if;
end $$;
