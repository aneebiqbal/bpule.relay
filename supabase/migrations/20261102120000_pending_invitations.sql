-- Pending invitations live in Relay's own database, not in auth metadata.
--
-- Supabase stores the invitation in admin-only `app_metadata`, which only
-- Supabase can write. Neon Auth has no equivalent field, and reading an auth
-- vendor's metadata to decide membership would put authorization authority
-- outside Relay. Storing the invitation here keeps the invite-only contract on
-- both providers and makes the authority a Relay row.
--
-- The row is consumed once: the auth callback reads it by email, provisions the
-- rep and organisation role, and stamps `consumed_at`. A unique partial index on
-- the unconsumed email keeps one live invitation per address.
--
-- Read and write happen through the service role (the caller has no
-- organisation yet, so RLS cannot authorise the insert), so RLS is enabled with
-- no policies: the table is unreachable with an anon or authenticated key.
--
-- Idempotent.

create table if not exists public.pending_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null default 'MEMBER',
  invited_by uuid references public.reps(id) on delete set null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One live invitation per email address, case-insensitively.
create unique index if not exists pending_invitations_email_key
  on public.pending_invitations (lower(email))
  where consumed_at is null;

create index if not exists pending_invitations_organization_idx
  on public.pending_invitations (organization_id);

alter table public.pending_invitations enable row level security;

-- No policies: only the service role may read or write. This is deliberate —
-- an authenticated user must never be able to enumerate or forge invitations.
