-- 20260929000000: Auto-create day_close on assignment/contract
--
-- Ensures that when an operator has an effective assignment + daily contract
-- for a working day, the corresponding day_close row always exists.
-- Idempotent, concurrency-safe, respects availability.

create or replace function ensure_day_close(
  p_org_id uuid,
  p_person_id uuid,
  p_revenue_identity_id uuid,
  p_date date default current_date
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_contract_id uuid;
  v_allocation_pct int;
  v_availability text;
  v_existing_id uuid;
  v_status text;
begin
  -- Check availability: skip if not working
  select status into v_availability
  from operator_availability
  where person_id = p_person_id and date = p_date;

  if v_availability is not null and v_availability != 'working' then
    return null;
  end if;

  -- Find active contract for this identity
  select id into v_contract_id
  from revenue_identity_contracts
  where revenue_identity_id = p_revenue_identity_id
    and status = 'active'
    and effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
  order by effective_from desc
  limit 1;

  if v_contract_id is null then
    return null;
  end if;

  -- Find allocation for this person
  select allocation_pct into v_allocation_pct
  from contract_allocations
  where contract_id = v_contract_id and person_id = p_person_id;

  -- If no allocation row and there are allocations, skip (not assigned)
  if v_allocation_pct is null and exists (
    select 1 from contract_allocations where contract_id = v_contract_id
  ) then
    return null;
  end if;

  -- Check for existing day_close (idempotent)
  select id, status into v_existing_id, v_status
  from day_closes
  where person_id = p_person_id
    and revenue_identity_id = p_revenue_identity_id
    and date = p_date;

  if v_existing_id is not null then
    -- Already exists — never mutate historical closed days
    return v_existing_id;
  end if;

  -- Create day_close
  insert into day_closes (
    organization_id, person_id, revenue_identity_id, contract_id,
    date, status, completion_snapshot
  ) values (
    p_org_id, p_person_id, p_revenue_identity_id, v_contract_id,
    p_date, 'not_started', '{}'::jsonb
  )
  on conflict (person_id, revenue_identity_id, date) do nothing
  returning id into v_existing_id;

  return v_existing_id;
end;
$$;

comment on function ensure_day_close is
  'Idempotently creates a day_close row for a person+identity+date when an active contract exists and the person is working. Returns existing row if already present. Returns null if no contract or not working.';

-- Function: ensure day closes for all of a person's active assignments
create or replace function ensure_day_closes_for_person(
  p_org_id uuid,
  p_person_id uuid,
  p_date date default current_date
)
returns table(identity_id uuid, day_close_id uuid)
language plpgsql
security definer
as $$
declare
  v_identity_id uuid;
  v_dc_id uuid;
begin
  for v_identity_id in
    select distinct ia.revenue_identity_id
    from identity_assignments ia
    where ia.rep_id = p_person_id
      and ia.organization_id = p_org_id
  loop
    v_dc_id := ensure_day_close(p_org_id, p_person_id, v_identity_id, p_date);
    identity_id := v_identity_id;
    day_close_id := v_dc_id;
    return next;
  end loop;
end;
$$;

comment on function ensure_day_closes_for_person is
  'Ensures day_close rows exist for all of a person''s assigned identities. Called after identity assignment or contract changes.';
