-- B2: make the follow-up notification trigger use the SAME policy as the app.
-- The trigger previously fired at "5 business days" while the app's canonical
-- policy (src/lib/conversation/follow-up-policy.ts) uses a 3-calendar-day first
-- follow-up. The trigger only ever fires for a lead still in 'contacted'
-- (a follow-up moves it to 'followed_up'), so it is the first-follow-up
-- notification only; the queue in supabase-store.fetchFollowupsDue remains
-- the authority for the 3/6/6 cadence and the 3-follow-up cap.

create or replace function public.check_followup_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_log (rep_id, type, payload)
  select
    l.owner_rep_id,
    'followup_eligible',
    jsonb_build_object('lead_id', new.lead_id, 'sent_at', new.sent_at)
  from leads l
  where l.id = new.lead_id
    and l.status = 'contacted'
    and not exists (
      select 1 from outcomes o
      where o.lead_id = new.lead_id and o.stage = 'replied'
    )
    -- Canonical first follow-up: 3 calendar days, matching followupDueInDays(0).
    and (new.sent_at + interval '3 days') <= now();
  return new;
end;
$$;
