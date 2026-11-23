#!/usr/bin/env node
/**
 * Real-PostgreSQL integration checks for the stabilization fixes.
 *
 * Runs the ACTUAL application code (`postgresDbClient`, `saveWorkSetup`,
 * `configureCoverageStatement`, `computeAccountRevision`,
 * `getOrganizationDailySummary`) against a throwaway local database — not the
 * in-memory fake. A BEFORE INSERT trigger provides genuine failure injection,
 * so these prove real transaction rollback rather than simulated rollback.
 *
 *   npx tsx scripts/qa/postgres-txn-integration.mjs
 *
 * Requires a local PostgreSQL reachable at RELAY_TXN_TEST_URL (default
 * postgres://<user>@127.0.0.1:5432/postgres). Creates and drops its own
 * `relay_txn_integration` database. Never touches another database.
 */
import pg from 'pg'
import { postgresDbClient } from '../../src/lib/db/postgres.ts'
import { saveWorkSetup, computeAccountRevision } from '../../src/lib/operations/work-setup-write.ts'
import {
  getOrganizationDailySummary,
  getRepDailySummary,
} from '../../src/lib/execution/accountability.ts'

const ADMIN_URL =
  process.env.RELAY_TXN_TEST_URL ?? `postgres://${process.env.USER}@127.0.0.1:5432/postgres`
const DB = 'relay_txn_integration'

const ORG = '11111111-1111-1111-1111-111111111111'
const ORG_B = '22222222-2222-2222-2222-222222222222'
const IDENTITY = 'aaaaaaaa-0000-0000-0000-0000000000aa'
const PROFILE = 'bbbbbbbb-0000-0000-0000-0000000000bb'
const PRIMARY = 'cccccccc-0000-0000-0000-0000000000cc'
const OPERATOR = 'dddddddd-0000-0000-0000-0000000000dd'

const DDL = `
drop schema public cascade;
create schema public;
create extension if not exists pgcrypto;

create table organizations (id uuid primary key);
create table reps (
  id uuid primary key, organization_id uuid references organizations(id),
  name text not null default '', role text not null default 'rep',
  timezone text not null default 'UTC', created_at timestamptz not null default now()
);
create table profiles (id uuid primary key, organization_id uuid references organizations(id));
create table revenue_identities (
  id uuid primary key, organization_id uuid references organizations(id),
  profile_id uuid references profiles(id), identity_name text not null default '',
  channel text not null default 'linkedin', status text not null default 'active',
  updated_at timestamptz not null default now()
);
create table profile_coverage (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  profile_id uuid not null, rep_id uuid not null, role text not null,
  priority int not null default 1, active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pc_active_chain_uniq on profile_coverage (profile_id, rep_id, role) where active;

create table identity_assignments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  revenue_identity_id uuid not null, rep_id uuid not null, assigned_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index ia_pair_uniq on identity_assignments (revenue_identity_id, rep_id);

create table daily_target_plans (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  revenue_identity_id uuid not null, activity_type text not null,
  target_count int not null, targetable boolean not null default true,
  effective_from date not null default '2026-01-01', effective_until date,
  active boolean not null default true, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table daily_plan_allocations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  plan_id uuid not null references daily_target_plans(id), rep_id uuid not null,
  target_count int not null check (target_count > 0),
  active boolean not null default true, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index dpa_active_uniq on daily_plan_allocations (plan_id, rep_id) where active;

create table responsibility_acknowledgements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  profile_id uuid not null, rep_id uuid not null, subject text not null,
  source_row_id uuid, assigned_at timestamptz, acknowledged_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index ra_uniq on responsibility_acknowledgements (organization_id, profile_id, rep_id, subject);

create table coverage_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  profile_id uuid not null, event_type text not null, primary_rep_id uuid,
  reason text, actor_rep_id uuid
);
create table accountability_audit_log (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  rep_id uuid, revenue_identity_id uuid, event_type text, detail jsonb,
  created_at timestamptz not null default now()
);
create table daily_accountability (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  revenue_identity_id uuid not null, activity_type text not null, rep_id uuid not null,
  completed_count int not null default 0, target_date date not null
);

-- Genuine failure injection: inserting an allocation of 777 raises.
create or replace function fail_allocation_insert() returns trigger as $$
begin
  if NEW.target_count = 777 then
    raise exception 'injected allocation failure';
  end if;
  return NEW;
end;
$$ language plpgsql;
create trigger trg_fail_allocation before insert on daily_plan_allocations
  for each row execute function fail_allocation_insert();
`

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`)
  console.log(`PASS  ${message}`)
}

async function seed(pool) {
  await pool.query('delete from organizations')
  await pool.query('insert into organizations (id) values ($1), ($2)', [ORG, ORG_B])
  await pool.query(
    `insert into reps (id, organization_id, name, role) values
       ($1,$3,'Primary','rep'), ($2,$3,'Operator','rep')`,
    [PRIMARY, OPERATOR, ORG],
  )
  await pool.query('insert into profiles (id, organization_id) values ($1,$2)', [PROFILE, ORG])
  await pool.query(
    `insert into revenue_identities (id, organization_id, profile_id, identity_name, channel, status)
     values ($1,$2,$3,'Acct','linkedin','active')`,
    [IDENTITY, ORG, PROFILE],
  )
  await pool.query(
    `insert into profile_coverage (organization_id, profile_id, rep_id, role, priority, active)
     values ($1,$2,$3,'PRIMARY',1,true)`,
    [ORG, PROFILE, PRIMARY],
  )
}

async function snapshot(pool) {
  const tables = [
    'profile_coverage',
    'identity_assignments',
    'daily_target_plans',
    'daily_plan_allocations',
    'responsibility_acknowledgements',
    'coverage_events',
    'accountability_audit_log',
  ]
  const out = {}
  for (const table of tables) {
    const res = await pool.query(`select * from ${table} order by 1`)
    out[table] = JSON.stringify(res.rows)
  }
  return JSON.stringify(out)
}

async function main() {
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`drop database if exists ${DB}`)
  await admin.query(`create database ${DB}`)
  await admin.end()

  const pool = new pg.Pool({ connectionString: `${ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`)}`, max: 5 })
  try {
    await pool.query(DDL)
    await seed(pool)

    const client = () => postgresDbClient(PRIMARY, pool)
    const workInput = (extra = {}) => ({
      orgId: ORG,
      identityId: IDENTITY,
      primaryRepId: PRIMARY,
      operators: [{ repId: OPERATOR }],
      backups: [],
      actorRepId: PRIMARY,
      targets: [{ activityType: 'dm', targetCount: 30 }],
      allocations: [{ activityType: 'dm', repId: OPERATOR, targetCount: 8 }],
      ...extra,
    })

    // 1. Successful atomic Work Setup + Rep Today agreement.
    const saved = await saveWorkSetup(client(), workInput())
    assert(saved.ok === true, `work setup commits (ok=${saved.ok} error=${saved.error ?? ''})`)
    const summary = await getOrganizationDailySummary(client(), { orgId: ORG, businessDate: '2026-11-23' })
    const repToday = await getRepDailySummary(client(), { orgId: ORG, repId: OPERATOR, businessDate: '2026-11-23' })
    assert(summary.requirement === 30, `requirement is 30 (got ${summary.requirement})`)
    assert(repToday?.assigned === 8, `Rep Today operator expectation is the allocation 8 (got ${repToday?.assigned})`)
    // Two seats (PRIMARY + OPERATOR) make the lane shared; an unallocated seat
    // contributes 0 by design.
    const primaryToday = await getRepDailySummary(client(), { orgId: ORG, repId: PRIMARY, businessDate: '2026-11-23' })
    assert(primaryToday?.assigned === 0, `shared unallocated seat contributes 0 (got ${primaryToday?.assigned})`)

    // R-09: a solo lane carrying an explicit allocation uses the allocation.
    const solo = await saveWorkSetup(
      client(),
      workInput({ operators: [], allocations: [{ activityType: 'dm', repId: PRIMARY, targetCount: 10 }] }),
    )
    assert(solo.ok === true, `solo allocation save commits (${solo.error ?? ''})`)
    const soloPrimary = await getRepDailySummary(client(), { orgId: ORG, repId: PRIMARY, businessDate: '2026-11-23' })
    assert(soloPrimary?.assigned === 10, `solo lane with allocation expects 10, not 30 (got ${soloPrimary?.assigned})`)

    // 2. Real rollback: injected allocation failure must undo coverage + target.
    const before = await snapshot(pool)
    // 777 passes the lane-sum check (lane target 800) and reaches the INSERT,
    // where the BEFORE INSERT trigger raises — a genuine mid-transaction fault.
    const failed = await saveWorkSetup(
      client(),
      workInput({
        targets: [{ activityType: 'dm', targetCount: 800 }],
        allocations: [{ activityType: 'dm', repId: OPERATOR, targetCount: 777 }],
      }),
    )
    assert(failed.ok === false, `injected failure returns ok=false (${failed.error ?? ''})`)
    assert((await snapshot(pool)) === before, 'rollback restored every dependent table byte-for-byte')

    // 3. Revision conflict: committed state preserved, no writes.
    const revision = await computeAccountRevision(client(), ORG, IDENTITY, PROFILE)
    assert(Boolean(revision), 'revision is computed')
    await pool.query(`update daily_target_plans set target_count = 40, updated_at = now() where organization_id = $1`, [ORG])
    const beforeConflict = await snapshot(pool)
    const conflicted = await saveWorkSetup(
      client(),
      workInput({ expectedRevision: revision }),
    )
    assert(conflicted.code === 'CONFLICT', `stale revision returns CONFLICT (code=${conflicted.code})`)
    assert((await snapshot(pool)) === beforeConflict, 'conflict performed zero writes')

    // 4. Clearing allocations (empty list) commits atomically.
    const cleared = await saveWorkSetup(
      client(),
      workInput({ targets: [{ activityType: 'dm', targetCount: 30 }], allocations: [] }),
    )
    assert(cleared.ok === true, 'empty allocation list clears without error')
    const remaining = await pool.query(
      `select count(*)::int n from daily_plan_allocations where organization_id = $1 and active`,
      [ORG],
    )
    assert(remaining.rows[0].n === 0, 'no active allocations remain after clear')

    // 5. Two-organization isolation of the canonical projection.
    const other = await getOrganizationDailySummary(client(), { orgId: ORG_B, businessDate: '2026-11-23' })
    assert(other.tracked === 0 && other.reps.length === 0, 'organization B sees none of organization A data')

    console.log('\nALL REAL-POSTGRES CHECKS PASSED')
  } finally {
    await pool.end()
    const teardown = new pg.Client({ connectionString: ADMIN_URL })
    await teardown.connect()
    await teardown.query(`drop database if exists ${DB}`)
    await teardown.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
