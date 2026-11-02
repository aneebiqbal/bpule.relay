-- Pin search_path on the three SECURITY DEFINER functions that did not set it.
--
-- A SECURITY DEFINER function without a pinned search_path is a privilege
-- escalation trap: an attacker who can create an object in a schema earlier on
-- the search_path can shadow a table the function reads. Supabase shipped these
-- three without a setting; the migration keeps them working and closes the hole.
--
-- Behaviour is unchanged: every object these functions touch lives in public
-- (operator_availability, revenue_identity_contracts, contract_allocations,
-- day_closes, identity_assignments), which the pinned path resolves.

alter function public.ensure_day_close(uuid, uuid, uuid, date)
  set search_path = public, extensions;

alter function public.ensure_day_closes_for_person(uuid, uuid, date)
  set search_path = public, extensions;

alter function public.record_canonical_progress(uuid, uuid, uuid, text, text, text, date)
  set search_path = public, extensions;
