#!/usr/bin/env node
/**
 * Read-only operations reconciliation.
 *
 * Recomputes the canonical accountability populations and the per-rep /
 * per-account contribution ledger for one organization and business date, and
 * prints the candidate "headline" metrics that different screens have shown, so
 * the differences are explained rather than guessed.
 *
 *   node scripts/qa/reconcile-operations.mjs [orgId]
 *
 * Never writes. Uses SERVICE_DATABASE_URL from .env.local.
 */
import pg from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('SERVICE_DATABASE_URL is required')
  process.exit(1)
}

const ssl =
  process.env.DATABASE_SSL === 'false'
    ? undefined
    : {
        rejectUnauthorized:
          process.env.DATABASE_SSL_VERIFY === 'true' || process.env.DATABASE_SSL_CA ? true : false,
        ca: process.env.DATABASE_SSL_CA || undefined,
      }

const client = new pg.Client({ connectionString: url, ssl })

function businessDate(timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function effective(row, day) {
  if (!row.active) return false
  if (row.effective_from > day) return false
  return row.effective_until == null || row.effective_until >= day
}

async function main() {
  await client.connect()
  const orgId = process.argv[2]
  const org = orgId
    ? (await client.query('select id, name, timezone from organizations where id = $1', [orgId])).rows[0]
    : (await client.query('select id, name, timezone from organizations order by created_at limit 1')).rows[0]
  if (!org) throw new Error('No organization found')

  const policy =
    (await client.query('select timezone from organization_operating_policy where organization_id = $1', [org.id])).rows[0]
      ?.timezone ?? null
  const timezone = policy || org.timezone || 'UTC'
  const day = businessDate(timezone)

  const [plans, seats, allocations, accountability, identities, reps] = await Promise.all([
    client.query(
      `select id, revenue_identity_id, activity_type, target_count, targetable, effective_from, effective_until, active
       from daily_target_plans where organization_id = $1`,
      [org.id],
    ),
    client.query(
      `select profile_id, rep_id, role from profile_coverage
       where organization_id = $1 and active and role in ('PRIMARY','OPERATOR')`,
      [org.id],
    ),
    client.query(
      `select plan_id, rep_id, target_count from daily_plan_allocations where organization_id = $1 and active`,
      [org.id],
    ),
    client.query(
      `select revenue_identity_id, activity_type, rep_id, completed_count from daily_accountability
       where organization_id = $1 and target_date = $2`,
      [org.id, day],
    ),
    client.query(
      `select id, identity_name, channel, profile_id, status from revenue_identities where organization_id = $1`,
      [org.id],
    ),
    client.query(`select id, name from reps where organization_id = $1 order by name`, [org.id]),
  ])

  const repName = new Map(reps.rows.map((row) => [row.id, row.name]))
  const identityById = new Map(identities.rows.map((row) => [row.id, row]))
  const lanes = plans.rows.filter((row) => effective(row, day))
  const seatsByProfile = new Map()
  for (const row of seats.rows) {
    const list = seatsByProfile.get(row.profile_id) ?? []
    if (!list.includes(row.rep_id)) list.push(row.rep_id)
    seatsByProfile.set(row.profile_id, list)
  }
  const allocationByPlan = new Map()
  for (const row of allocations.rows) {
    const list = allocationByPlan.get(row.plan_id) ?? []
    const existing = list.find((entry) => entry.repId === row.rep_id)
    if (existing) existing.targetCount += row.target_count
    else list.push({ repId: row.rep_id, targetCount: row.target_count })
    allocationByPlan.set(row.plan_id, list)
  }
  const completedByLane = new Map()
  for (const row of accountability.rows) {
    const key = `${row.revenue_identity_id}:${row.activity_type}`
    completedByLane.set(key, (completedByLane.get(key) ?? 0) + (row.completed_count ?? 0))
  }

  const laneRows = lanes.map((plan) => {
    const identity = identityById.get(plan.revenue_identity_id)
    const profileId = identity?.profile_id ?? null
    const seats = profileId ? (seatsByProfile.get(profileId) ?? []) : []
    const alloc = allocationByPlan.get(plan.id) ?? []
    const completed = completedByLane.get(`${plan.revenue_identity_id}:${plan.activity_type}`) ?? 0
    const personal = seats.reduce(
      (sum, repId) => sum + (alloc.find((row) => row.repId === repId)?.targetCount ?? (seats.length > 1 ? 0 : plan.target_count)),
      0,
    )
    return {
      planId: plan.id,
      identityId: plan.revenue_identity_id,
      identityName: identity?.identity_name ?? 'Unnamed',
      channel: identity?.channel ?? 'other',
      profileId,
      activityType: plan.activity_type,
      targetCount: plan.target_count,
      targetable: plan.targetable,
      seats,
      allocations: alloc,
      completed,
      personal,
    }
  })

  const tracked = laneRows.reduce((sum, row) => sum + row.targetCount, 0)
  const requirement = laneRows.filter((row) => row.targetable).reduce((sum, row) => sum + row.targetCount, 0)
  const assigned = laneRows.reduce(
    (sum, row) => sum + (row.seats.length === 1 ? row.targetCount : row.allocations.reduce((inner, a) => inner + a.targetCount, 0)),
    0,
  )
  const requirementAssigned = laneRows
    .filter((row) => row.targetable)
    .reduce((sum, row) => sum + row.personal, 0)
  const completed = laneRows.reduce((sum, row) => sum + row.completed, 0)
  const unseatedAllocationUnits = laneRows.reduce(
    (sum, row) => sum + row.allocations.filter((a) => !row.seats.includes(a.repId)).reduce((inner, a) => inner + a.targetCount, 0),
    0,
  )

  const byRep = new Map()
  for (const row of laneRows) {
    for (const repId of row.seats) {
      const entry = byRep.get(repId) ?? { repId, repName: repName.get(repId) ?? 'Unknown', assigned: 0, completed: 0 }
      const allocation = row.allocations.find((a) => a.repId === repId)?.targetCount ?? null
      entry.assigned += allocation ?? (row.seats.length > 1 ? 0 : row.targetCount)
      const contribution = accountability.rows
        .filter((a) => a.revenue_identity_id === row.identityId && a.activity_type === row.activityType && a.rep_id === repId)
        .reduce((sum, a) => sum + (a.completed_count ?? 0), 0)
      entry.completed += contribution
      byRep.set(repId, entry)
    }
  }
  for (const entry of byRep.values()) entry.remaining = Math.max(0, entry.assigned - entry.completed)

  const byIdentity = new Map()
  for (const row of laneRows) {
    const entry = byIdentity.get(row.identityId) ?? {
      identityId: row.identityId,
      identityName: row.identityName,
      channel: row.channel,
      profileId: row.profileId,
      requirement: 0,
      tracked: 0,
      allocated: 0,
      completed: 0,
      seats: row.seats,
    }
    if (row.targetable) entry.requirement += row.targetCount
    entry.tracked += row.targetCount
    entry.allocated += row.allocations
      .filter((a) => row.seats.includes(a.repId))
      .reduce((sum, a) => sum + a.targetCount, 0)
    entry.completed += row.completed
    byIdentity.set(row.identityId, entry)
  }

  const allActivePlans = plans.rows.filter((row) => row.active)
  const candidates = {
    'admin targets: every active plan target_count (no effectiveness, no targetable)': allActivePlans.reduce(
      (sum, row) => sum + row.target_count,
      0,
    ),
    'canonical tracked (effective lanes)': tracked,
    'canonical requirement (effective targetable lanes)': requirement,
    'canonical remaining (tracked - completed)': Math.max(0, tracked - completed),
    'canonical requirement remaining': Math.max(0, requirement - completed),    'canonical assigned (personal expectation)': assigned,
    'canonical requirementAssigned': requirementAssigned,
    'canonical unallocated (tracked - assigned)': Math.max(0, tracked - assigned),
    'canonical requirementUnallocated': Math.max(0, requirement - requirementAssigned),
    'unseated allocation units': unseatedAllocationUnits,
    'sum of rep assigned (personal)': [...byRep.values()].reduce((sum, row) => sum + row.assigned, 0),
    'sum of rep remaining (personal)': [...byRep.values()].reduce((sum, row) => sum + row.remaining, 0),
  }

  console.log(
    JSON.stringify(
      {
        organization: { id: org.id, name: org.name },
        timezone,
        businessDate: day,
        laneCount: laneRows.length,
        identityCount: byIdentity.size,
        populations: {
          tracked,
          requirement,
          trackedNonTargetable: tracked - requirement,
          assigned,
          requirementAssigned,
          unallocated: Math.max(0, tracked - assigned),
          requirementUnallocated: Math.max(0, requirement - requirementAssigned),
          unseatedAllocationUnits,
          completed,
          remaining: Math.max(0, tracked - completed),
        },
        candidates,
        reps: [...byRep.values()].sort((a, b) => a.repName.localeCompare(b.repName)),
        accounts: [...byIdentity.values()].sort((a, b) => a.identityName.localeCompare(b.identityName)),
        lanes: laneRows.sort((a, b) => a.identityName.localeCompare(b.identityName) || a.activityType.localeCompare(b.activityType)),
      },
      null,
           2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => client.end().catch(() => {}))
