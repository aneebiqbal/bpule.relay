-- 0082: Security fixes — refresh_few_shot_wins authorization + adversarial test cleanup

-- Fix refresh_few_shot_wins to verify caller belongs to p_org_id when provided
create or replace function public.refresh_few_shot_wins(p_org_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
  target_org_id uuid;
  caller_org_id uuid;
begin
  caller_org_id := current_org_id();
  target_org_id := coalesce(p_org_id, caller_org_id);

  if target_org_id is null then
    raise exception 'refresh_few_shot_wins: no organization context available';
  end if;

  -- SECURITY: When p_org_id is explicitly provided, verify the caller belongs
  -- to that organization. This prevents a rep from writing few-shot wins into
  -- another org. Service-role (cron) callers bypass this — they are trusted
  -- infrastructure that iterates orgs from the database.
  if p_org_id is not null and p_org_id != caller_org_id then
    raise exception 'refresh_few_shot_wins: cross-org denied. Caller org %, requested org %', caller_org_id, p_org_id;
  end if;

  insert into few_shot_wins (organization_id, message_id, lead_id, play_id, signal_type, sent_text, company, signal_evidence, tags)
  select
    target_org_id,
    m.id,
    m.lead_id,
    l.play_id,
    l.signal_type,
    m.sent_text,
    l.company,
    l.signal_evidence,
    l.tags
  from messages m
  join leads l on l.id = m.lead_id
  where m.sent_text is not null
    and l.organization_id = target_org_id
    and exists (
      select 1 from outcomes o
      where o.lead_id = m.lead_id and o.stage = 'replied'
    )
    and not exists (
      select 1 from few_shot_wins f where f.message_id = m.id
    )
  on conflict (message_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
