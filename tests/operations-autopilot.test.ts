/**
 * Operations Autopilot foundation contracts.
 *
 * The daily coverage engine is deterministic and pure: every status,
 * recommendation and eligibility decision is derived from canonical facts
 * (identity_assignments, rep availability, workload) and is asserted here.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  compareBackupCandidates,
  evaluateBackupEligibility,
  evaluateDailyCoverage,
  fallbackAvailability,
  filterCoveragePlanToReps,
  isAutoCoverEligible,
  labelForAvailability,
  AUTO_COVER_REQUIRES_READINESS,
  type CoverageEngineInput,
  type CoverageMode,
  type RepWorkloadInput,
} from '@/lib/coverage/engine'
import {
  approveCoveragePlan,
  configureCoverage,
  restorePrimaryCoverage,
  setRepAvailability,
} from '@/lib/coverage/actions'
import { listActiveCoveredIdentities, listWorkableProfiles } from '@/lib/coverage/access'
import { createFakeSupabase } from './helpers/fake-supabase'
import type { DbClient } from '@/lib/db/types'
import type { AuthContext } from '@/lib/auth/organization'

const ROOT = process.cwd()
const MIGRATION = '20261106120000_operations_autopilot.sql'

const ORG = '11111111-1111-1111-1111-111111111111'
const P_LINKEDIN = 'profile-hassan-linkedin'
const P_UPWORK = 'profile-aneeb-upwork'
const DAWOOD = 'rep-dawood'
const MADIHA = 'rep-madiha'
const AHMAD = 'rep-ahmad'
const ANEEB = 'rep-aneeb'

function workload(over: Partial<RepWorkloadInput> = {}): RepWorkloadInput {
  return {
    repId: DAWOOD,
    name: 'Dawood',
    assignedProfileCount: 1,
    primaryProfileCount: 1,
    openCount: 5,
    replies: 2,
    followUps: 1,
    overdue: 0,
    activeCoverageCount: 0,
    ...over,
  }
}

function baseInput(over: Partial<CoverageEngineInput> = {}): CoverageEngineInput {
  return {
    businessDate: '2026-11-06',
    isWorkingDay: true,
    coveragePolicy: 'APPROVAL_REQUIRED' as CoverageMode,
    maxProfilesPerRep: 3,
    profiles: [{ profileId: P_LINKEDIN, name: 'Hassan · LinkedIn', channels: ['linkedin'], identityIds: ['ri-1'] }],
    assignments: [
      { profileId: P_LINKEDIN, repId: DAWOOD, channels: ['linkedin'] },
      { profileId: P_LINKEDIN, repId: MADIHA, channels: ['linkedin'] },
      { profileId: P_LINKEDIN, repId: AHMAD, channels: ['linkedin'] },
    ],
    coverage: [
      { profileId: P_LINKEDIN, repId: DAWOOD, role: 'PRIMARY', priority: 0 },
      { profileId: P_LINKEDIN, repId: MADIHA, role: 'BACKUP', priority: 1 },
      { profileId: P_LINKEDIN, repId: AHMAD, role: 'BACKUP', priority: 2 },
    ],
    availability: [
      { repId: DAWOOD, state: 'WORKING' },
      { repId: MADIHA, state: 'WORKING' },
      { repId: AHMAD, state: 'WORKING' },
    ],
    workloads: [
      workload(),
      workload({ repId: MADIHA, name: 'Madiha', assignedProfileCount: 1, openCount: 8 }),
      workload({ repId: AHMAD, name: 'Ahmad', assignedProfileCount: 1, openCount: 3 }),
    ],
    activeCoverage: [],
    readiness: [],
    profileWork: { [P_LINKEDIN]: { replies: 8, followUps: 4, tasks: 1 } },
    ...over,
  }
}

function planFor(input: CoverageEngineInput) {
  return evaluateDailyCoverage(input)
}

describe('DAILY_COVERAGE_PRIMARY_AVAILABLE', () => {
  it('marks a profile COVERED when the primary rep is available', () => {
    const plan = planFor(baseInput())
    expect(plan.counts.COVERED).toBe(1)
    expect(plan.counts.UNCOVERED).toBe(0)
    expect(plan.requiresApproval).toEqual([])
    expect(plan.unchanged).toBe(1)
    expect(plan.profiles[0].status).toBe('COVERED')
    expect(plan.profiles[0].primaryRepId).toBe(DAWOOD)
  })
})

describe('DAILY_COVERAGE_PRIMARY_ON_LEAVE', () => {
  it('raises an approval item when the primary is on leave', () => {
    const plan = planFor(
      baseInput({ availability: [
        { repId: DAWOOD, state: 'ON_LEAVE' },
        { repId: MADIHA, state: 'WORKING' },
        { repId: AHMAD, state: 'WORKING' },
      ] }),
    )
    expect(plan.counts.AT_RISK).toBe(1)
    expect(plan.profiles[0].status).toBe('AT_RISK')
    expect(plan.profiles[0].recommendation).toBe('COVER')
    expect(plan.requiresApproval).toHaveLength(1)
    expect(plan.requiresApproval[0].kind).toBe('COVER')
    expect(plan.requiresApproval[0].fromRepId).toBe(DAWOOD)
    expect(plan.requiresApproval[0].toRepId).toBe(MADIHA)
    expect(plan.requiresApproval[0].workPackage).toEqual({ replies: 8, followUps: 4, tasks: 1 })
  })
})

describe('DAILY_COVERAGE_SELECTS_ELIGIBLE_BACKUP', () => {
  it('skips an on-leave backup and recommends the eligible one', () => {
    const plan = planFor(
      baseInput({ availability: [
        { repId: DAWOOD, state: 'ON_LEAVE' },
        { repId: MADIHA, state: 'ON_LEAVE' },
        { repId: AHMAD, state: 'WORKING' },
      ] }),
    )
    expect(plan.profiles[0].recommendedRepId).toBe(AHMAD)
    const madihas = plan.profiles[0].backups.find((b) => b.repId === MADIHA)!
    expect(madihas.eligible).toBe(false)
    expect(madihas.reasons.join(' ')).toContain('On leave')
    expect(plan.requiresApproval[0].toRepId).toBe(AHMAD)
  })

  it('exposes the deterministic reason for the recommendation', () => {
    const plan = planFor(
      baseInput({ availability: [
        { repId: DAWOOD, state: 'ON_LEAVE' },
        { repId: MADIHA, state: 'WORKING' },
        { repId: AHMAD, state: 'WORKING' },
      ] }),
    )
    const reasons = plan.profiles[0].recommendationReasons.join(' · ')
    expect(reasons).toContain('Available')
    expect(reasons).toContain('LinkedIn access confirmed')
    expect(reasons).toContain('remaining action')
  })

  it('orders eligible backups deterministically by priority, then workload, then name', () => {
    const a = { repId: 'a', name: 'A', priority: 1, availability: 'WORKING' as const, eligible: true, reasons: [], missingChannels: [], assignedProfileCount: 1, activeCoverageCount: 0, openCount: 9, ready: true }
    const b = { repId: 'b', name: 'B', priority: 1, availability: 'WORKING' as const, eligible: true, reasons: [], missingChannels: [], assignedProfileCount: 1, activeCoverageCount: 0, openCount: 2, ready: true }
    const c = { repId: 'c', name: 'C', priority: 2, availability: 'WORKING' as const, eligible: true, reasons: [], missingChannels: [], assignedProfileCount: 0, activeCoverageCount: 0, openCount: 0, ready: true }
    expect([a, b, c].sort(compareBackupCandidates).map((row) => row.repId)).toEqual(['b', 'a', 'c'])
  })
})

describe('DAILY_COVERAGE_CHANNEL_CAPABILITY_REQUIRED', () => {
  it('refuses a backup who holds only Upwork access on a LinkedIn profile', () => {
    const plan = planFor(
      baseInput({
        assignments: [
          { profileId: P_LINKEDIN, repId: DAWOOD, channels: ['linkedin'] },
          { profileId: P_LINKEDIN, repId: MADIHA, channels: ['upwork'] },
        ],
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
      }),
    )
    expect(plan.profiles[0].backups.find((b) => b.repId === MADIHA)!.eligible).toBe(false)
    expect(plan.profiles[0].backups.find((b) => b.repId === MADIHA)!.missingChannels).toEqual(['linkedin'])
    expect(plan.profiles[0].recommendedRepId).not.toBe(MADIHA)
  })

  it('treats a LinkedIn-only assignment as ineligible for an Upwork profile', () => {
    const verdict = evaluateBackupEligibility({
      backup: { profileId: P_UPWORK, repId: MADIHA, role: 'BACKUP', priority: 1 },
      profile: { profileId: P_UPWORK, name: 'Aneeb · Upwork', channels: ['upwork'], identityIds: [] },
      assignment: { profileId: P_UPWORK, repId: MADIHA, channels: ['linkedin'] },
      availability: 'WORKING',
      workload: workload({ repId: MADIHA, name: 'Madiha' }),
      maxProfilesPerRep: 3,
      ready: true,
    })
    expect(verdict.eligible).toBe(false)
    expect(verdict.missingChannels).toEqual(['upwork'])
  })
})

describe('DAILY_COVERAGE_NEVER_CROSS_ORG', () => {
  it('never recommends a rep with no canonical assignment on the profile', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'ON_LEAVE' },
          { repId: AHMAD, state: 'ON_LEAVE' },
          { repId: ANEEB, state: 'WORKING' },
        ],
        workloads: [
          workload(),
          workload({ repId: MADIHA, name: 'Madiha' }),
          workload({ repId: AHMAD, name: 'Ahmad' }),
          workload({ repId: ANEEB, name: 'Aneeb', openCount: 0 }),
        ],
      }),
    )
    expect(plan.profiles[0].recommendedRepId).toBeNull()
    expect(plan.profiles[0].status).toBe('UNCOVERED')
    expect(plan.profiles[0].ineligibleReason).toBe('NO_SAFE_COVERAGE')
  })

  it('every coverage policy is scoped to the caller organization', () => {
    const sql = readFileSync(path.join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8')
    const policyBlocks = sql.match(/create policy[\s\S]*?;/g) ?? []
    expect(policyBlocks.length).toBeGreaterThan(5)
    for (const block of policyBlocks) {
      expect(block, `policy not org-scoped: ${block.slice(0, 80)}`).toMatch(/current_org_id\(\)/)
    }
  })
})

describe('DAILY_COVERAGE_OVERLOAD_PROTECTION', () => {
  it('does not stack coverage past the ceiling onto one rep', () => {
    const plan = planFor(
      baseInput({
        maxProfilesPerRep: 2,
        workloads: [
          workload({ assignedProfileCount: 1, activeCoverageCount: 1 }),
          // Madiha is already at 2 of 2 — covering a third is unsafe.
          workload({ repId: MADIHA, name: 'Madiha', assignedProfileCount: 1, activeCoverageCount: 1 }),
          workload({ repId: AHMAD, name: 'Ahmad', assignedProfileCount: 0, activeCoverageCount: 0, openCount: 4 }),
        ],
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
      }),
    )
    expect(plan.profiles[0].recommendedRepId).toBe(AHMAD)
    expect(plan.profiles[0].backups.find((b) => b.repId === MADIHA)!.reasons.join(' ')).toContain('At capacity')
  })

  it('escalates NO_SAFE_COVERAGE instead of overloading the last backup', () => {
    const plan = planFor(
      baseInput({
        maxProfilesPerRep: 1,
        workloads: [
          workload({ assignedProfileCount: 1, activeCoverageCount: 0 }),
          workload({ repId: MADIHA, name: 'Madiha', assignedProfileCount: 1, activeCoverageCount: 0 }),
          workload({ repId: AHMAD, name: 'Ahmad', assignedProfileCount: 1, activeCoverageCount: 0 }),
        ],
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
      }),
    )
    expect(plan.profiles[0].status).toBe('UNCOVERED')
    expect(plan.profiles[0].ineligibleReason).toBe('NO_SAFE_COVERAGE')
    expect(plan.requiresApproval).toEqual([])
  })

  it('counts owned + covered profiles, not every assignment, toward capacity', () => {
    // Madiha is assigned to 5 profiles but owns none: she is still eligible.
    const plan = planFor(
      baseInput({
        workloads: [
          workload({ repId: MADIHA, name: 'Madiha', assignedProfileCount: 5, primaryProfileCount: 0, openCount: 8 }),
          workload({ repId: AHMAD, name: 'Ahmad', assignedProfileCount: 2, primaryProfileCount: 2 }),
        ],
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
      }),
    )
    expect(plan.profiles[0].recommendedRepId).toBe(MADIHA)
    expect(plan.profiles[0].backups.find((b) => b.repId === MADIHA)!.eligible).toBe(true)
  })
})

describe('AUTO_COVER_REQUIRES_READINESS', () => {
  it('is a hard contract', () => {
    expect(AUTO_COVER_REQUIRES_READINESS).toBe(true)
  })

  it('never auto-covers an unready backup, even when otherwise eligible', () => {
    expect(isAutoCoverEligible({ eligible: true, ready: true })).toBe(true)
    expect(isAutoCoverEligible({ eligible: true, ready: false })).toBe(false)
    expect(isAutoCoverEligible({ eligible: false, ready: true })).toBe(false)
  })
})

describe('TEMPORARY_COVERAGE_PRESERVES_PRIMARY', () => {
  it('keeps the primary owner of record while a backup is active', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
        activeCoverage: [{ profileId: P_LINKEDIN, primaryRepId: DAWOOD, coveringRepId: MADIHA, effectiveUntil: '2026-11-08' }],
      }),
    )
    const profile = plan.profiles[0]
    expect(profile.status).toBe('BACKUP_ACTIVE')
    expect(profile.primaryRepId).toBe(DAWOOD)
    expect(profile.activeCoveringRepId).toBe(MADIHA)
    expect(profile.activeCoverageUntil).toBe('2026-11-08')
    expect(plan.requiresApproval).toEqual([])
  })
})

describe('TEMPORARY_COVERAGE_PRESERVES_HISTORY', () => {
  it('coverage writes never touch profiles or identity assignments', () => {
    const src = readFileSync(path.join(ROOT, 'src', 'lib', 'coverage', 'actions.ts'), 'utf8')
    expect(src).not.toMatch(/\.from\('profiles'\)[\s\S]{0,200}\.update/)
    expect(src).not.toMatch(/\.from\('identity_assignments'\)[\s\S]{0,200}\.(update|insert|delete)/)
    expect(src).not.toMatch(/\.from\('profiles'\)[\s\S]{0,200}\.delete/)
  })

  it('records who covered, for how long, why and who approved it', () => {
    const sql = readFileSync(path.join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8')
    const table = sql.match(/create table if not exists coverage_assignments[\s\S]*?\);/)?.[0] ?? ''
    for (const column of ['profile_id', 'primary_rep_id', 'covering_rep_id', 'reason', 'effective_from', 'effective_until', 'approved_by', 'created_at']) {
      expect(table).toContain(column)
    }
  })
})

describe('TEMPORARY_COVERAGE_EXPIRES', () => {
  it('restore closes the assignment on the business date without deleting it', async () => {
    const { client, tables } = createFakeSupabase({
      coverage_assignments: [
        { id: 'ca-1', organization_id: ORG, profile_id: P_LINKEDIN, primary_rep_id: DAWOOD, covering_rep_id: MADIHA, status: 'ACTIVE', effective_from: '2026-11-06', reason: 'On leave' },
      ],
    })
    const db = client as unknown as DbClient

    const result = await restorePrimaryCoverage({
      organizationId: ORG,
      profileId: P_LINKEDIN,
      actorRepId: ANEEB,
      actorName: 'Aneeb',
      reason: 'Primary rep is available again',
      businessDate: '2026-11-09',
      client: db,
    })

    expect(result.ok).toBe(true)
    const row = tables.coverage_assignments.find((r) => r.id === 'ca-1')!
    expect(row.status).toBe('COMPLETED')
    expect(row.effective_until).toBe('2026-11-09')
    expect(tables.coverage_events).toHaveLength(1)
    expect(tables.coverage_events[0].event_type).toBe('COVERAGE_RESTORED')
  })
})

describe('RETURN_TO_WORK_RESTORES_PRIMARY', () => {
  it('recommends restoring the primary once they are available again', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'WORKING' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
        activeCoverage: [{ profileId: P_LINKEDIN, primaryRepId: DAWOOD, coveringRepId: MADIHA, effectiveUntil: null }],
      }),
    )
    const profile = plan.profiles[0]
    expect(profile.status).toBe('BACKUP_ACTIVE')
    expect(profile.recommendation).toBe('RESTORE_PRIMARY')
    expect(plan.requiresApproval).toHaveLength(1)
    expect(plan.requiresApproval[0].kind).toBe('RESTORE_PRIMARY')
    expect(plan.requiresApproval[0].toRepId).toBe(DAWOOD)
  })
})

describe('REP_COVERAGE_VISIBLE_ON_HOME', () => {
  it('a covering rep sees the profile under covering, with the primary named', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
        activeCoverage: [{ profileId: P_LINKEDIN, primaryRepId: DAWOOD, coveringRepId: MADIHA, effectiveUntil: '2026-11-08' }],
      }),
    )
    const profile = plan.profiles[0]
    expect(profile.activeCoveringRepId).toBe(MADIHA)
    expect(profile.primaryRepName).toBe('Dawood')
    expect(labelForAvailability(profile.primaryAvailability)).toBe('On leave')
  })

  it('the plan separates the rep availability summary from profile coverage', () => {
    const plan = planFor(baseInput())
    expect(plan.counts.COVERED).toBe(1)
    expect(plan.requiresApproval).toEqual([])
  })
})

describe('REP_COVERAGE_READINESS_REQUIRED', () => {
  it('flags a recommended backup who has not confirmed device access', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
        readiness: [],
      }),
    )
    expect(plan.profiles[0].recommendedReady).toBe(false)
    expect(plan.requiresApproval[0].readinessRequired).toBe(true)
    expect(plan.profiles[0].recommendationReasons.join(' ')).toContain('not confirmed')
  })

  it('clears the readiness flag once the covering rep acknowledges', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
        readiness: [{ profileId: P_LINKEDIN, repId: MADIHA }],
      }),
    )
    expect(plan.profiles[0].recommendedReady).toBe(true)
    expect(plan.requiresApproval[0].readinessRequired).toBe(false)
  })
})

describe('TASK_HANDOFF_PROFILE_BOUND_ONLY', () => {
  it('the work package counts profile-bound tasks, never personal tasks', () => {
    const plan = planFor(baseInput())
    expect(plan.requiresApproval).toEqual([])
    // The work package is carried on the approval item, not mixed into task ownership.
    const withLeave = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
      }),
    )
    expect(withLeave.requiresApproval[0].workPackage.tasks).toBe(1)
    expect(withLeave.requiresApproval[0].workPackage.replies).toBe(8)
  })

  it('the engine never reassigns a task', () => {
    const src = readFileSync(path.join(ROOT, 'src', 'lib', 'coverage', 'engine.ts'), 'utf8')
    expect(src).not.toMatch(/assigned_tasks/)
    expect(src).not.toMatch(/reassign/i)
  })
})

describe('INBOX_HANDOFF_USES_CANONICAL_WAITING_STATE', () => {
  it('the work package is derived from the canonical conversation state, not lead status', () => {
    const src = readFileSync(path.join(ROOT, 'src', 'lib', 'coverage', 'load.ts'), 'utf8')
    expect(src).toContain('deriveConversationRow')
    expect(src).not.toContain("status === 'replied'")
    expect(src).not.toContain("status === 'followed_up'")
  })
})

describe('UPWORK_COVERAGE_REQUIRES_UPWORK_IDENTITY', () => {
  it('an Upwork profile cannot be covered by a LinkedIn-only assignment', () => {
    const plan = planFor(
      baseInput({
        profiles: [{ profileId: P_UPWORK, name: 'Aneeb · Upwork', channels: ['upwork'], identityIds: ['ri-2'] }],
        assignments: [
          { profileId: P_UPWORK, repId: DAWOOD, channels: ['upwork'] },
          { profileId: P_UPWORK, repId: MADIHA, channels: ['linkedin'] },
        ],
        coverage: [
          { profileId: P_UPWORK, repId: DAWOOD, role: 'PRIMARY', priority: 0 },
          { profileId: P_UPWORK, repId: MADIHA, role: 'BACKUP', priority: 1 },
        ],
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
      }),
    )
    expect(plan.profiles[0].status).toBe('UNCOVERED')
    expect(plan.profiles[0].ineligibleReason).toBe('NO_SAFE_COVERAGE')
  })
})

describe('LINKEDIN_COVERAGE_REQUIRES_LINKEDIN_IDENTITY', () => {
  it('a LinkedIn profile cannot be covered by an Upwork-only assignment', () => {
    const plan = planFor(
      baseInput({
        assignments: [
          { profileId: P_LINKEDIN, repId: DAWOOD, channels: ['linkedin'] },
          { profileId: P_LINKEDIN, repId: MADIHA, channels: ['upwork'] },
        ],
      }),
    )
    expect(plan.profiles[0].backups.find((b) => b.repId === MADIHA)!.eligible).toBe(false)
  })
})

describe('ADMIN_DAILY_PLAN_ONLY_SHOWS_EXCEPTIONS', () => {
  it('requiresApproval contains only non-covered profiles', () => {
    const plan = planFor(baseInput())
    const exceptionIds = new Set(plan.requiresApproval.map((item) => item.profileId))
    for (const profile of plan.profiles) {
      if (profile.status === 'COVERED') expect(exceptionIds.has(profile.profileId)).toBe(false)
    }
    expect(plan.unchanged).toBe(plan.counts.COVERED)
  })

  it('a scoped manager view recomputes counts instead of leaking org totals', () => {
    const plan = planFor(baseInput())
    const scoped = filterCoveragePlanToReps(plan, new Set([MADIHA]))
    expect(scoped.totalProfiles).toBe(1)
    expect(scoped.counts.COVERED).toBe(1)

    const empty = filterCoveragePlanToReps(plan, new Set())
    expect(empty.totalProfiles).toBe(0)
    expect(empty.counts.COVERED).toBe(0)
    expect(empty.requiresApproval).toEqual([])
  })
})

describe('availability authority', () => {
  it('falls back to the clock-derived default, never to a guess about leave', () => {
    expect(fallbackAvailability(true)).toBe('AVAILABLE')
    expect(fallbackAvailability(false)).toBe('OFFLINE')
  })

  it('writes one explicit row per rep per day, idempotently', async () => {
    const { client, tables } = createFakeSupabase()
    const db = client as unknown as DbClient

    const first = await setRepAvailability({
      organizationId: ORG,
      repId: DAWOOD,
      businessDate: '2026-11-06',
      state: 'ON_LEAVE',
      source: 'SELF',
      note: 'Out of office',
      actorRepId: DAWOOD,
      client: db,
    })
    const second = await setRepAvailability({
      organizationId: ORG,
      repId: DAWOOD,
      businessDate: '2026-11-06',
      state: 'ON_LEAVE',
      source: 'SELF',
      note: 'Out of office',
      actorRepId: DAWOOD,
      client: db,
    })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    const rows = tables.rep_availability.filter((row) => row.rep_id === DAWOOD && row.business_date === '2026-11-06')
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe('ON_LEAVE')
  })

  it('defaults to APPROVAL_REQUIRED so nothing is silently reassigned', () => {
    const sql = readFileSync(path.join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8')
    expect(sql).toContain("coverage_policy text not null default 'APPROVAL_REQUIRED'")
    expect(sql).toContain("'AUTO_COVER', 'APPROVAL_REQUIRED', 'MANUAL_ONLY'")
  })
})

describe('COVERAGE_PARTIAL_FAILURE_IS_REPORTED', () => {
  it('returns per-item results and ok=false when one activation fails', async () => {
    const { client, tables } = createFakeSupabase()
    const failProfile = P_UPWORK
    const originalFrom = client.from.bind(client)
    const wrapped = {
      provider: 'neon' as const,
      from(table: string) {
        const builder = originalFrom(table)
        if (table === 'coverage_assignments') {
          const originalInsert = builder.insert.bind(builder)
          builder.insert = ((values: Record<string, unknown>) => {
            if (values?.profile_id === failProfile) {
              const failing = {
                select: () => failing,
                maybeSingle: async () => ({ data: null, error: { message: 'insert failed' } }),
              }
              return failing
            }
            return originalInsert(values)
          }) as typeof builder.insert
        }
        return builder
      },
    } as unknown as DbClient

    const result = await approveCoveragePlan({
      organizationId: ORG,
      actorRepId: ANEEB,
      actorName: 'Aneeb',
      items: [
        { profileId: P_LINKEDIN, primaryRepId: DAWOOD, coveringRepId: MADIHA, kind: 'COVER', reason: 'On leave', businessDate: '2026-11-06' },
        { profileId: failProfile, primaryRepId: DAWOOD, coveringRepId: AHMAD, kind: 'COVER', reason: 'On leave', businessDate: '2026-11-06' },
      ],
      client: wrapped,
    })

    expect(result.ok).toBe(false)
    expect(result.results).toHaveLength(2)
    expect(result.results.find((r) => r.profileId === P_LINKEDIN)?.applied).toBe(true)
    expect(result.results.find((r) => r.profileId === failProfile)?.applied).toBe(false)
    // The successful activation is still recorded — partial state, never faked.
    expect(tables.coverage_assignments).toHaveLength(1)
    expect(tables.coverage_events).toHaveLength(1)
  })
})

describe('COVERAGE_CONFIGURATION_REPLACES_CHAIN', () => {
  it('deactivates the previous chain and records the change without deleting history', async () => {
    const { client, tables } = createFakeSupabase({
      profile_coverage: [
        { id: 'pc-1', organization_id: ORG, profile_id: P_LINKEDIN, rep_id: DAWOOD, role: 'PRIMARY', priority: 0, active: true },
        { id: 'pc-2', organization_id: ORG, profile_id: P_LINKEDIN, rep_id: MADIHA, role: 'BACKUP', priority: 1, active: true },
      ],
    })
    const db = client as unknown as DbClient

    const result = await configureCoverage({
      organizationId: ORG,
      profileId: P_LINKEDIN,
      primaryRepId: DAWOOD,
      backups: [{ repId: MADIHA, priority: 1 }, { repId: AHMAD, priority: 2 }],
      actorRepId: ANEEB,
      client: db,
    })

    expect(result.ok).toBe(true)
    expect(tables.profile_coverage).toHaveLength(5) // 2 deactivated + 3 new
    const active = tables.profile_coverage.filter((row) => row.active)
    expect(active).toHaveLength(3)
    // priority is 1-based: the DB carries `check (priority >= 1)`, so a
    // PRIMARY row written with 0 is rejected. Primary = 1, backups follow.
    expect(active.find((row) => row.role === 'PRIMARY')?.priority).toBe(1)
    expect(active.filter((row) => row.role === 'BACKUP').map((row) => row.priority).sort()).toEqual([2, 3])
    expect(tables.coverage_events).toHaveLength(1)
    expect(tables.coverage_events[0].event_type).toBe('BACKUP_CONFIGURED')
  })
})

describe('migration shape', () => {
  it('creates the autopilot tables and no second profile or task table', () => {
    const sql = readFileSync(path.join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8')
    for (const table of [
      'rep_availability',
      'profile_coverage',
      'coverage_assignments',
      'coverage_events',
      'profile_readiness',
    ]) {
      expect(sql).toContain(`create table if not exists ${table}`)
    }
    // No new profile, identity or task tables.
    expect(sql).not.toMatch(/create table if not exists (profiles|revenue_identities|identity_assignments|assigned_tasks|task_events)/)
  })

  it('keeps coverage uniqueness to the active chain so reconfiguration keeps history', () => {
    const foundation = readFileSync(path.join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8')
    expect(foundation).not.toMatch(/unique\s*\(\s*profile_id\s*,\s*rep_id\s*\)/i)
    expect(foundation).toContain('pc_active_chain_uniq')
    expect(foundation).toContain('pc_active_rep_uniq')

    const followUp = readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '20261106130000_profile_coverage_active_uniqueness.sql'),
      'utf8',
    )
    expect(followUp).toContain('drop constraint if exists profile_coverage_organization_id_profile_id_role_priority_key')
    expect(followUp).toContain('drop constraint if exists profile_coverage_profile_id_rep_id_key')
    expect(followUp).toMatch(/create unique index[\s\S]*where active/i)
  })
})

describe('COVERAGE_GRANTS_EXECUTION_ACCESS', () => {
  it('returns the identities a covering rep may work today, and excludes expired coverage', async () => {
    const { client, tables } = createFakeSupabase({
      coverage_assignments: [
        { id: 'ca-1', organization_id: ORG, profile_id: P_LINKEDIN, primary_rep_id: DAWOOD, covering_rep_id: MADIHA, status: 'ACTIVE', effective_from: '2026-11-06', effective_until: '2026-11-08' },
        { id: 'ca-2', organization_id: ORG, profile_id: P_UPWORK, primary_rep_id: DAWOOD, covering_rep_id: MADIHA, status: 'ACTIVE', effective_from: '2026-11-01', effective_until: '2026-11-05' },
        { id: 'ca-3', organization_id: ORG, profile_id: 'other-profile', primary_rep_id: DAWOOD, covering_rep_id: MADIHA, status: 'ACTIVE', effective_from: '2026-11-07', effective_until: null },
      ],
      revenue_identities: [
        { id: 'ri-1', organization_id: ORG, profile_id: P_LINKEDIN, channel: 'linkedin', status: 'active' },
        { id: 'ri-2', organization_id: ORG, profile_id: P_UPWORK, channel: 'upwork', status: 'active' },
      ],
    })
    const db = client as unknown as DbClient
    const covered = await listActiveCoveredIdentities(db, ORG, MADIHA, '2026-11-06')
    const ids = covered.map((row) => row.revenueIdentityId)
    expect(ids).toContain('ri-1')
    expect(ids).not.toContain('ri-2') // expired
    expect(covered[0].primaryRepId).toBe(DAWOOD)
    expect(tables.coverage_assignments).toHaveLength(3) // read-only
  })

  it('adds covered profiles to the workable profile set without removing owned ones', async () => {
    const { client } = createFakeSupabase({
      coverage_assignments: [
        { id: 'ca-1', organization_id: ORG, profile_id: P_LINKEDIN, primary_rep_id: DAWOOD, covering_rep_id: MADIHA, status: 'ACTIVE', effective_from: '2026-11-06', effective_until: null },
      ],
      revenue_identities: [
        { id: 'ri-1', organization_id: ORG, profile_id: P_LINKEDIN, channel: 'linkedin', status: 'active' },
      ],
      profiles: [
        { id: P_LINKEDIN, organization_id: ORG, rep_id: DAWOOD, platform: 'linkedin', label: 'Hassan · LinkedIn', created_at: '2026-11-06' },
      ],
    })
    const db = client as unknown as DbClient
    const owned = [{ id: 'owned-1' } as never]
    const workable = await listWorkableProfiles(db, ORG, MADIHA, '2026-11-06', owned)
    expect(workable.map((profile) => profile.id)).toEqual(['owned-1', P_LINKEDIN])
  })
})

describe('COVERAGE_EXPIRY_IS_A_LIVE_EXCEPTION', () => {
  it('flags expired coverage and recommends a new cover instead of letting it disappear', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
        activeCoverage: [{
          profileId: P_LINKEDIN,
          primaryRepId: DAWOOD,
          coveringRepId: MADIHA,
          effectiveUntil: '2026-11-05',
          expired: true,
        }],
      }),
    )
    const profile = plan.profiles[0]
    expect(profile.status).toBe('AT_RISK')
    expect(profile.ineligibleReason).toBe('COVERAGE_EXPIRED')
    expect(profile.recommendation).toBe('COVER')
    expect(plan.requiresApproval[0].reason).toContain('expired')
  })

  it('flags coverage that ends today without changing the covered status', () => {
    const plan = planFor(
      baseInput({
        availability: [
          { repId: DAWOOD, state: 'ON_LEAVE' },
          { repId: MADIHA, state: 'WORKING' },
          { repId: AHMAD, state: 'WORKING' },
        ],
        activeCoverage: [{
          profileId: P_LINKEDIN,
          primaryRepId: DAWOOD,
          coveringRepId: MADIHA,
          effectiveUntil: '2026-11-06',
        }],
      }),
    )
    const profile = plan.profiles[0]
    expect(profile.status).toBe('BACKUP_ACTIVE')
    expect(profile.coverageExpiring).toBe(true)
  })
})

describe('COVERAGE_TASK_HANDOFF_IS_PROFILE_BOUND_ONLY', () => {
  it('moves profile-bound tasks to the covering rep and leaves personal tasks alone', async () => {
    const { client, tables } = createFakeSupabase({
      assigned_tasks: [
        { id: 'task-1', organization_id: ORG, profile_id: P_LINKEDIN, assignee_rep_id: DAWOOD, status: 'OPEN', title: 'Reply to lead', due_at: null, created_at: '2026-11-06' },
        { id: 'task-2', organization_id: ORG, profile_id: null, assignee_rep_id: DAWOOD, status: 'OPEN', title: 'Personal admin', due_at: null, created_at: '2026-11-06' },
      ],
      reps: [
        { id: DAWOOD, organization_id: ORG, name: 'Dawood' },
        { id: MADIHA, organization_id: ORG, name: 'Madiha' },
      ],
    })
    const db = client as unknown as DbClient
    const auth = {
      orgId: ORG,
      repId: ANEEB,
      isAdmin: true,
      isOwner: false,
      isManager: false,
      managedTeamIds: [],
    } as AuthContext

    const result = await approveCoveragePlan({
      organizationId: ORG,
      actorRepId: ANEEB,
      actorName: 'Aneeb',
      auth,
      items: [{
        profileId: P_LINKEDIN,
        primaryRepId: DAWOOD,
        coveringRepId: MADIHA,
        kind: 'COVER',
        reason: 'On leave',
        businessDate: '2026-11-06',
      }],
      client: db,
    })

    expect(result.ok).toBe(true)
    const moved = tables.assigned_tasks.find((row) => row.id === 'task-1')!
    expect(moved.assignee_rep_id).toBe(MADIHA)
    expect(moved.previous_assignee_rep_id).toBe(DAWOOD)
    const personal = tables.assigned_tasks.find((row) => row.id === 'task-2')!
    expect(personal.assignee_rep_id).toBe(DAWOOD)
  })
})
