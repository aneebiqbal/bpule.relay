-- Final security pass — close the remaining SECURITY DEFINER gaps.
--
-- `append_rescore_event` took only a lead id and updated that lead's canonical
-- score with no organisation check, so any authenticated user could call
-- /rpc/append_rescore_event and overwrite another organisation's lead. The
-- update now requires the lead to belong to the caller's organisation.

create or replace function public.append_rescore_event(
  p_lead_id uuid,
  p_canonical_score int,
  p_score_version text,
  p_score_breakdown jsonb,
  p_rescore_event jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads
  set
    canonical_score = p_canonical_score,
    score_version = p_score_version,
    scored_at = now(),
    score_breakdown = p_score_breakdown,
    rescore_events = array_append(coalesce(rescore_events, '{}'), p_rescore_event)
  where id = p_lead_id
    and organization_id = current_org_id();
end;
$$;

comment on function public.append_rescore_event(uuid, int, text, jsonb, jsonb) is
  'Appends a canonical rescore event and updates the lead score. Scoped to the caller''s organisation.';
