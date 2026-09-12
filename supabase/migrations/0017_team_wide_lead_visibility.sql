-- 0017: Team-wide lead visibility.
--
-- Business rule: a lead is still assigned to and worked by one owner (insert/
-- update/delete stay owner-or-admin, unchanged from 0001), but every
-- authenticated rep can now see every lead, its messages, and its outcomes.
--
-- Why: this is what makes the create-time dedupe check (createLead's
-- fetchLeadsAll) actually global instead of silently RLS-narrowed to the
-- calling rep. Before this migration, two different reps could log the same
-- company as two separate leads because neither could see the other's rows.
-- Same pattern already used for profiles/proof_items in 0014.

drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  to authenticated using (auth.role() = 'authenticated');

drop policy if exists messages_select on messages;
create policy messages_select on messages for select
  to authenticated using (auth.role() = 'authenticated');

drop policy if exists outcomes_select on outcomes;
create policy outcomes_select on outcomes for select
  to authenticated using (auth.role() = 'authenticated');
