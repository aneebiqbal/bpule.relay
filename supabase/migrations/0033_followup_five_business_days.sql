-- 0033: follow-up eligibility is five WORKING days after the last send, not
-- three calendar days. ONE follow-up, ever — the lock is already structural
-- (a lead moves out of 'contacted' into 'followed_up' the moment a follow-up
-- is sent, so this trigger only ever fires for a lead's first-and-only
-- follow-up window; it never re-fires once that window has been used).

create or replace function public.business_days_between(from_ts timestamptz, to_ts timestamptz)
returns integer
language sql
immutable
as $$
  select coalesce(
    (
      select count(*)::int
      from generate_series(
        date_trunc('day', from_ts) + interval '1 day',
        date_trunc('day', to_ts),
        interval '1 day'
      ) as d
      where extract(dow from d) not in (0, 6) -- exclude Saturday (6) and Sunday (0)
    ),
    0
  )
$$;

create or replace function public.check_followup_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A lead becomes follow-up eligible five WORKING days after being
  -- contacted with no reply. ONE follow-up, ever: this only ever matches a
  -- lead still in 'contacted' status, which a lead permanently leaves the
  -- moment its one follow-up is sent (status -> 'followed_up').
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
    and public.business_days_between(new.sent_at, now()) >= 5;
  return new;
end;
$$;
