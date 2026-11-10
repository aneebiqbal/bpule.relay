/**
 * V6.0 responsibility foundation contracts.
 *
 * PRIMARY OWNER is permanent. ACTIVE OPERATOR is temporary execution with an
 * explicit mode (SHARED keeps the primary executing, REPLACE excludes it).
 * BACKUP is eligibility only. Acknowledgement is separate from readiness.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACK_ESCALATION,
  acknowledgementDedupeKey,
  acknowledgementStage,
  dueNotificationStage,
} from '@/lib/responsibility/ack-policy'
import { isCoverageActiveOn } from '@/lib/coverage/access'
import { evaluateDailyCoverage, type CoverageEngineInput, type CoverageMode } from '@/lib/coverage/engine'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const P = 'profile-zaira-upwork'
const HASSAN = 'rep-hassan'
const DAWOOD = 'rep-dawood'
const MADIHA = 'rep-madiha'

function baseInput(over: Partial<CoverageEngineInput> = {}): CoverageEngineInput {
  return {
    businessDate: '2026-11-11',
    isWorkingDay: true,
    coveragePolicy: 'APPROVAL_REQUIRED' as CoverageMode,
    maxProfilesPerRep: 3,
    profiles: [{ profileId: P, name: 'Zaira · Upwork', channels: ['upwork'], identityIds: ['ri-1'] }],
    assignments: [
      { profileId: P, repId: HASSAN, channels: ['upwork'] },
      { profileId: P, repId: DAWOOD, channels: ['upwork'] },
      { profileId: P, repId: MADIHA, channels: ['upwork'] },
    ],
    coverage: [
      { profileId: P, repId: HASSAN, role: 'PRIMARY', priority: 1 },
      { profileId: P, repId: DAWOOD, role: 'BACKUP', priority: 2 },
      { profileId: P, repId: MADIHA, role: 'BACKUP', priority: 3 },
    ],
    availability: [
      { repId: HASSAN, state: 'WORKING' },
      { repId: DAWOOD, state: 'WORKING' },
      { repId: MADIHA, state: 'WORKING' },
    ],
    workloads: [
      { repId: HASSAN, name: 'Hassan', assignedProfileCount: 1, primaryProfileCount: 1, openCount: 5, replies: 1, followUps: 0, overdue: 0, activeCoverageCount: 0, personalTaskCount: 0 },
      { repId: DAWOOD, name: 'Dawood', assignedProfileCount: 1, primaryProfileCount: 1, openCount: 5, replies: 1, followUps: 0, overdue: 0, activeCoverageCount: 0, personalTaskCount: 0 },
      { repId: MADIHA, name: 'Madiha', assignedProfileCount: 1, primaryProfileCount: 1, openCount: 5, replies: 1, followUps: 0, overdue: 0, activeCoverageCount: 0, personalTaskCount: 0 },
    ],
    activeCoverage: [],
    readiness: [],
    ...over,
  }
}

function activeRow(over: Partial<{
  id: string
  profileId: string
  primaryRepId: string
  coveringRepId: string
  effectiveUntil: string | null
  mode: 'SHARED' | 'REPLACE' | null
  expired: boolean
}> = {}) {
  return {
    id: 'ca-1',
    profileId: P,
    primaryRepId: HASSAN,
    coveringRepId: DAWOOD,
    effectiveUntil: null,
    mode: 'SHARED' as const,
    expired: false,
    ...over,
  }
}

function resultFor(input: CoverageEngineInput) {
  return evaluateDailyCoverage(input).profiles.find((profile) => profile.profileId === P)!
}

describe('ONE_PRIMARY_MANY_ACTIVE_OPERATORS', () => {
  it('a profile has exactly one primary and any number of active operators', () => {
    const result = resultFor(baseInput({
      activeCoverage: [
        activeRow({ id: 'ca-1', coveringRepId: DAWOOD, mode: 'SHARED' }),
        activeRow({ id: 'ca-2', coveringRepId: MADIHA, mode: 'SHARED' }),
      ],
    }))
    expect(result.primaryRepId).toBe(HASSAN)
    expect(result.activeOperators.map((op) => op.repId)).toEqual([DAWOOD, MADIHA])
    expect(result.activeCoverageMode).toBe('SHARED')
  })

  it('two replacement operators are both listed, and the primary is unchanged', () => {
    const result = resultFor(baseInput({
      activeCoverage: [
        activeRow({ id: 'ca-1', coveringRepId: DAWOOD, mode: 'REPLACE' }),
        activeRow({ id: 'ca-2', coveringRepId: MADIHA, mode: 'REPLACE' }),
      ],
    }))
    expect(result.primaryRepId).toBe(HASSAN)
    expect(result.activeOperators).toHaveLength(2)
    expect(result.activeCoverageMode).toBe('REPLACE')
  })
})

describe('SHARED_PRIMARY_REMAINS_EXECUTABLE', () => {
  it('shared coverage never asks to restore the primary', () => {
    const result = resultFor(baseInput({
      activeCoverage: [activeRow({ mode: 'SHARED' })],
    }))
    expect(result.recommendation).toBe('NONE')
    expect(result.status).toBe('BACKUP_ACTIVE')
    expect(result.activeCoverageMode).toBe('SHARED')
  })
})

describe('REPLACE_PRIMARY_NOT_EXECUTABLE', () => {
  it('replace coverage with an available primary asks to end the exclusion', () => {
    const result = resultFor(baseInput({
      activeCoverage: [activeRow({ mode: 'REPLACE' })],
    }))
    expect(result.activeCoverageMode).toBe('REPLACE')
    expect(result.recommendation).toBe('RESTORE_PRIMARY')
  })

  it('replace coverage with an unavailable primary keeps the cover', () => {
    const input = baseInput({
      activeCoverage: [activeRow({ mode: 'REPLACE' })],
      availability: [
        { repId: HASSAN, state: 'ON_LEAVE' },
        { repId: DAWOOD, state: 'WORKING' },
        { repId: MADIHA, state: 'WORKING' },
      ],
    })
    const result = resultFor(input)
    expect(result.recommendation).toBe('NONE')
    expect(result.status).toBe('BACKUP_ACTIVE')
  })
})

describe('REPLACE_RESTORE_REENABLES_PRIMARY', () => {
  it('restore completes every active coverage row for the profile', () => {
    const source = read('src/lib/coverage/actions.ts')
    const restore = source.slice(source.indexOf('export async function restorePrimaryCoverage'))
    const next = restore.indexOf('\nexport async function ', 10)
    const body = restore.slice(0, next === -1 ? restore.length : next)
    expect(body).toMatch(/status: 'COMPLETED'/)
    // Ends the episode, not one operator.
    expect(body).not.toMatch(/maybeSingle/)
  })
})

describe('PRIMARY_NEVER_MOVES_ON_TEMP_COVER', () => {
  it('activation never writes the ownership chain', () => {
    const source = read('src/lib/coverage/actions.ts')
    const approve = source.slice(source.indexOf('export async function approveCoveragePlan'))
    const next = approve.indexOf('\nexport async function ', 10)
    const body = approve.slice(0, next === -1 ? approve.length : next)
    expect(body).not.toMatch(/from\('profile_coverage'\)[\s\S]{0,300}\.(insert|update|upsert|delete)/)
    expect(body).not.toMatch(/role:\s*'PRIMARY'/)
  })
})

describe('BACKUP_ONLY_NOT_EXECUTABLE', () => {
  it('a backup with no active coverage is not an operator', () => {
    const result = resultFor(baseInput())
    expect(result.activeOperators).toEqual([])
    expect(result.backups.map((backup) => backup.repId)).toContain(DAWOOD)
  })

  it('the read authority never treats a BACKUP row as execution', () => {
    const source = read('src/lib/coverage/access.ts')
    expect(source).not.toMatch(/role\s*===?\s*'BACKUP'/)
  })
})

describe('EXPIRED_COVER_NOT_EXECUTABLE', () => {
  it('the window helper is exclusive of the day after until', () => {
    const row = { effectiveFrom: '2026-01-01', effectiveUntil: '2026-01-05' }
    expect(isCoverageActiveOn(row, '2026-01-05')).toBe(true)
    expect(isCoverageActiveOn(row, '2026-01-06')).toBe(false)
    expect(isCoverageActiveOn({ effectiveFrom: '2026-01-01', effectiveUntil: null }, '2026-01-05')).toBe(true)
  })

  it('a revoked or non-active row is never executable', () => {
    expect(isCoverageActiveOn(
      { effectiveFrom: '2026-01-01', effectiveUntil: null, status: 'REVOKED' },
      '2026-01-05',
    )).toBe(false)
    expect(isCoverageActiveOn(
      { effectiveFrom: '2026-01-01', effectiveUntil: null, revokedAt: '2026-01-02T00:00:00.000Z' },
      '2026-01-05',
    )).toBe(false)
  })

  it('an expired coverage row is reported as a live problem, not silently dropped', () => {
    const result = resultFor(baseInput({
      activeCoverage: [activeRow({ mode: 'REPLACE', expired: true })],
    }))
    expect(result.status).toBe('AT_RISK')
    expect(result.ineligibleReason).toBe('COVERAGE_EXPIRED')
  })
})

describe('COVERAGE_MODE_CONFLICT_REJECTED', () => {
  it('activation rejects a mode that conflicts with an active row', () => {
    const source = read('src/lib/coverage/actions.ts')
    expect(source).toMatch(/Conflicting coverage mode/)
    expect(source).toMatch(/coverage_mode !== mode/)
  })
})

describe('NEW_RESPONSIBILITY_REQUIRES_ACK', () => {
  it('activation seeds an acknowledgement for the covering rep', () => {
    const source = read('src/lib/coverage/actions.ts')
    expect(source).toMatch(/ensureCoverageAcknowledgement/)
  })

  it('a new primary ownership episode seeds an acknowledgement', () => {
    const source = read('src/lib/coverage/actions.ts')
    expect(source).toMatch(/ensurePrimaryAcknowledgement/)
    const assignment = read('src/lib/profiles/assignment.ts')
    expect(assignment).toMatch(/ensurePrimaryAcknowledgement/)
  })

  it('the migration creates the acknowledgement authority', () => {
    const migration = read('supabase/migrations/20261111120000_responsibility_foundation_v60.sql')
    expect(migration).toMatch(/create table if not exists responsibility_acknowledgements/)
    expect(migration).toMatch(/subject text not null check \(subject in \('PRIMARY', 'COVERAGE'\)\)/)
    expect(migration).toMatch(/acknowledged_at timestamptz/)
    expect(migration).toMatch(/access_issue text check/)
    expect(migration).toMatch(/enable row level security/)
  })
})

describe('ACK_DOES_NOT_EQUAL_READY', () => {
  it('readiness lives in its own table and is never overloaded', () => {
    const migration = read('supabase/migrations/20261111120000_responsibility_foundation_v60.sql')
    expect(migration).not.toMatch(/alter table profile_readiness/)
    const load = read('src/lib/responsibility/load.ts')
    expect(load).toMatch(/acknowledged_at/)
    expect(load).not.toMatch(/profile_readiness/)
  })
})

describe('UNACKNOWLEDGED_ESCALATES', () => {
  const assigned = '2026-01-01T00:00:00.000Z'

  it('derives NEW, REMIND, ADMIN_ATTENTION and URGENT from assigned_at', () => {
    expect(acknowledgementStage(assigned, '2026-01-01T00:30:00.000Z')).toBe('NEW')
    expect(acknowledgementStage(assigned, '2026-01-01T01:01:00.000Z')).toBe('REMIND')
    expect(acknowledgementStage(assigned, '2026-01-01T02:01:00.000Z')).toBe('ADMIN_ATTENTION')
    expect(acknowledgementStage(assigned, '2026-01-01T04:01:00.000Z')).toBe('URGENT')
  })

  it('durations live in one policy location', () => {
    expect(ACK_ESCALATION.reminderMinutes).toBe(60)
    expect(ACK_ESCALATION.adminAttentionMinutes).toBe(120)
    expect(ACK_ESCALATION.urgentMinutes).toBe(240)
  })

  it('the stage is derived, never stored', () => {
    const migration = read('supabase/migrations/20261111120000_responsibility_foundation_v60.sql')
    expect(migration).not.toMatch(/stage/)
  })
})

describe('ACK_STOPS_REMINDERS', () => {
  it('an acknowledged responsibility has no due stage', () => {
    expect(acknowledgementStage('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-01T00:05:00.000Z'))
      .toBe('ACKNOWLEDGED')
    expect(dueNotificationStage('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-01T00:05:00.000Z'))
      .toBeNull()
  })

  it('each stage has a stable dedupe key per recipient', () => {
    expect(acknowledgementDedupeKey('row-1', 'REMIND', 'rep-1')).toBe('responsibility_ack:row-1:REMIND:rep-1')
    expect(acknowledgementDedupeKey('row-1', 'REMIND', 'rep-1'))
      .toBe(acknowledgementDedupeKey('row-1', 'REMIND', 'rep-1'))
    expect(acknowledgementDedupeKey('row-1', 'REMIND', 'rep-1'))
      .not.toBe(acknowledgementDedupeKey('row-1', 'URGENT', 'rep-1'))
  })
})

describe('ACCESS_ISSUE_DOES_NOT_CHANGE_OWNERSHIP', () => {
  it('an access issue is stored on the acknowledgement, never on ownership', () => {
    const migration = read('supabase/migrations/20261111120000_responsibility_foundation_v60.sql')
    expect(migration).toMatch(/access_issue_reported_by uuid references reps/)
    expect(migration).toMatch(/resolved_at timestamptz/)
    const load = read('src/lib/responsibility/load.ts')
    expect(load).toMatch(/acknowledged_at: null/)
  })

  it('reporting an issue leaves acknowledgement pending', () => {
    const load = read('src/lib/responsibility/load.ts')
    const report = load.slice(load.indexOf('export async function reportAccessIssue'))
    const next = report.indexOf('\nexport async function ', 10)
    const body = report.slice(0, next === -1 ? report.length : next)
    expect(body).not.toMatch(/acknowledged_at/)
  })
})

describe('EXECUTION_PARITY', () => {
  it('rep/today reads the canonical authority, not identity_assignments', () => {
    const source = read('src/app/api/rep/today/route.ts')
    expect(source).toMatch(/listExecutableIdentitiesForRep/)
    expect(source).not.toMatch(/from\('identity_assignments'\)/)
  })

  it('the store workable set is a thin call-through to the canonical authority', () => {
    const source = read('src/lib/store/supabase-store.ts')
    const start = source.indexOf('async listMyWorkableIdentities')
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start, start + 1200)
    expect(body).toMatch(/listExecutableIdentitiesForRep/)
    expect(body).not.toMatch(/from\('profile_coverage'\)/)
  })

  it('leads and profiles derive from the same authority', () => {
    const source = read('src/lib/store/supabase-store.ts')
    expect(source).toMatch(/listWorkableProfiles/)
    const leads = source.slice(source.indexOf('async listMyWorkableLeads'), source.indexOf('async listMyWorkableLeads') + 900)
    expect(leads).toMatch(/listExecutableIdentitiesForRep/)
  })

  it('assigned profiles for another rep use the canonical authority', () => {
    const source = read('src/lib/profiles/assigned-profiles.ts')
    expect(source).toMatch(/listExecutableIdentitiesForRep/)
  })

  it('task execution honours the coverage mode', () => {
    const source = read('src/lib/tasks/load-unified-tasks.ts')
    expect(source).toMatch(/coverage_mode === 'SHARED'/)
  })
})

describe('MIGRATION_SAFETY', () => {
  const migration = read('supabase/migrations/20261111120000_responsibility_foundation_v60.sql')

  it('adds the mode without a default, so history stays unknown', () => {
    expect(migration).toMatch(/add column if not exists coverage_mode text/)
    expect(migration).not.toMatch(/coverage_mode text not null default/)
  })

  it('records the mode on coverage events', () => {
    expect(migration).toMatch(/alter table coverage_events[\s\S]{0,200}coverage_mode/)
  })

  it('enables RLS with org-scoped policies on the acknowledgement table', () => {
    expect(migration).toMatch(/ack_select/)
    expect(migration).toMatch(/ack_insert/)
    expect(migration).toMatch(/ack_update/)
    expect(migration).toMatch(/ack_delete/)
    expect(migration).toMatch(/rep_id = current_rep_id\(\) or is_org_admin\(\)/)
  })

  it('does not backfill or reclassify existing coverage', () => {
    expect(migration).not.toMatch(/update coverage_assignments set coverage_mode/)
  })
})
