-- 0083: Distributed rate limiting via Supabase
--
-- Replaces the in-memory Map rate limiter (which doesn't work across
-- Vercel serverless instances) with a database-backed solution.
-- No new infrastructure required — uses existing Supabase project.

create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  action text not null default 'signup',
  created_at timestamptz not null default now()
);

create index if not exists rate_limits_key_action_created_idx
  on rate_limits (key, action, created_at);

-- RLS: only service role can manage rate limits (no client access)
alter table rate_limits enable row level security;

drop policy if exists "rate_limits_service_only" on rate_limits;
create policy "rate_limits_service_only" on rate_limits
  to service_role
  using (true)
  with check(true);

-- Auto-cleanup: delete entries older than 2x the window (120s)
-- This keeps the table small. Runs implicitly on each rate limit check.
create or replace function public.cleanup_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limits
  where created_at < now() - interval '120 seconds';
$$;
