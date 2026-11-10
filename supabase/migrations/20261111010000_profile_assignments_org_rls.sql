-- profile_assignments has no organization_id column, so its policies must
-- scope through profiles. The previous policies granted any admin/owner of any
-- organization read, insert and delete over every assignment row in the
-- database. Scope them to the profile's organization.

drop policy if exists "profile_assignments_select" on profile_assignments;
create policy "profile_assignments_select" on profile_assignments for select
to authenticated
using (
  rep_id = public.current_rep_id()
  or exists (
    select 1 from profiles p
    where p.id = profile_assignments.profile_id
      and p.organization_id = public.current_org_id()
  )
);

drop policy if exists "profile_assignments_insert" on profile_assignments;
create policy "profile_assignments_insert" on profile_assignments for insert
to authenticated
with check (
  rep_id = public.current_rep_id()
  and exists (
    select 1 from profiles p
    where p.id = profile_assignments.profile_id
      and p.organization_id = public.current_org_id()
  )
);

drop policy if exists "profile_assignments_delete" on profile_assignments;
create policy "profile_assignments_delete" on profile_assignments for delete
to authenticated
using (
  rep_id = public.current_rep_id()
  or exists (
    select 1 from profiles p
    where p.id = profile_assignments.profile_id
      and p.organization_id = public.current_org_id()
  )
);
