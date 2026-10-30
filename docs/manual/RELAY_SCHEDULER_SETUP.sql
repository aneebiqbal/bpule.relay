-- ============================================================================
-- RELAY SCHEDULER SETUP — Supabase Cron (pg_cron + pg_net)
--
-- Run AFTER RELAY_FOUNDATION_APPLY.sql and RELAY_FOUNDATION_VERIFY.sql pass.
--
-- ONE trigger only. Do not also enable Vercel Cron for this route, and do not
-- add a second external scheduler. Two triggers double every operational event.
--
-- Before running:
--   1. Replace __RELAY_CRON_SECRET__ below with a strong random value.
--   2. Put the SAME value in the Relay runtime environment as CRON_SECRET.
--   3. Never commit the real value.
--
-- The scheduler holds no business logic. It wakes the Relay worker; the worker
-- evaluates every organization against its own local clock.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
--    pg_cron needs to be enabled for the project (Dashboard → Database →
--    Extensions) on plans that support it. pg_net is required for HTTP.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema cron;
create extension if not exists pg_net with schema net;

-- ---------------------------------------------------------------------------
-- 2. Secret in Vault — never a literal inside cron.job
-- ---------------------------------------------------------------------------
select vault.create_secret(
  '__RELAY_CRON_SECRET__',
  'relay_cron_secret',
  'Bearer token for the Relay operational scheduler'
);

-- If the secret already exists, rotate it instead:
-- select vault.update_secret(
--   (select id from vault.secrets where name = 'relay_cron_secret'),
--   '__RELAY_CRON_SECRET__'
-- );

-- ---------------------------------------------------------------------------
-- 3. Exactly one schedule, every 10 minutes
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'relay-operational-scheduler') then
    perform cron.unschedule('relay-operational-scheduler');
  end if;
end $$;

select cron.schedule(
  'relay-operational-scheduler',
  '*/10 * * * *',
  $job$
  select net.http_get(
    url := 'https://bpule-relay.vercel.app/api/cron/operational-scheduler',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'relay_cron_secret')
    ),
    timeout_milliseconds := 100000
  );
  $job$
);

-- ---------------------------------------------------------------------------
-- 4. Verify the schedule exists and is the only one
-- ---------------------------------------------------------------------------
select 'scheduler job exists' as check,
       case when exists (select 1 from cron.job where jobname = 'relay-operational-scheduler')
            then 'PASS' else 'FAIL' end as result
union all
select 'exactly one scheduler job',
       case when (select count(*) from cron.job
                  where command ilike '%operational-scheduler%') = 1
            then 'PASS' else 'FAIL' end
union all
select 'cadence is */10 * * * *',
       case when exists (select 1 from cron.job
                         where jobname = 'relay-operational-scheduler'
                           and schedule = '*/10 * * * *')
            then 'PASS' else 'FAIL' end;

-- ---------------------------------------------------------------------------
-- 5. Execution history (paste the last few rows back after ~15 minutes)
--    A healthy run reaches Relay and returns 200. A 500 means CRON_SECRET is
--    not set in the Relay runtime; a 503 means the operating tables are missing.
-- ---------------------------------------------------------------------------
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'relay-operational-scheduler')
order by start_time desc
limit 5;
