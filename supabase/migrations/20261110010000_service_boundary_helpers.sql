-- Referral sender lookup without a service-role client.
--
-- The refer route must resolve which reps can send as a profile. RLS limits
-- identity_assignments / profile_assignments reads to the caller's own rows, so
-- a rep cannot resolve another rep's holdings through the request client. This
-- SECURITY DEFINER helper performs that single lookup; the organisation is
-- supplied by the authenticated caller and matched inside the function, so the
-- request path never needs the service role.
create or replace function public.get_profile_holder_reps(p_org uuid, p_profile_id uuid)
returns table(rep_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select p.rep_id from public.profiles p
   where p.id = p_profile_id and p.organization_id = p_org and p.rep_id is not null
  union
  select pa.rep_id from public.profile_assignments pa
   join public.profiles p on p.id = pa.profile_id
   where pa.profile_id = p_profile_id and p.organization_id = p_org
  union
  select ia.rep_id from public.identity_assignments ia
   join public.revenue_identities ri on ri.id = ia.revenue_identity_id
   where ri.profile_id = p_profile_id and ri.organization_id = p_org and ri.status <> 'archived'
$$;

revoke all on function public.get_profile_holder_reps(uuid, uuid) from public, anon;
grant execute on function public.get_profile_holder_reps(uuid, uuid) to authenticated, service_role;
