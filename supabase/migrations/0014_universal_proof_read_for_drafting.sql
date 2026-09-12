-- 0014: Universal proof read access for authenticated users.
--
-- Goal: every signed-in rep can read the same profiles/proof pool so draft
-- generation quality is consistent across users.

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  to authenticated using (auth.role() = 'authenticated');

drop policy if exists proof_items_select on proof_items;
create policy proof_items_select on proof_items for select
  to authenticated using (auth.role() = 'authenticated');
