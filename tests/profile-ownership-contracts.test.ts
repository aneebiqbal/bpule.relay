/**
 * Profile ownership contracts.
 *
 * Exactly three states: PRIMARY (permanent, Admin-controlled), BACKUP
 * (eligibility, never ownership) and ACTIVE COVERAGE (temporary). Autopilot may
 * recommend and activate coverage; it may never change primary ownership, and a
 * rep's daily working set is primary + active coverage only.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getBackupEligibleProfilesForRep,
  getExecutableProfilesForRep,
  getPrimaryProfilesForRep,
  type CanonicalAssignmentSet,
  type CanonicalProfileAssignment,
} from '@/lib/profiles/canonical'
import { neonServiceDbClient } from '@/lib/db/neon'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const ORG = '11111111-1111-1111-1111-111111111111'

function profile(over: Partial<CanonicalProfileAssignment> = {}): CanonicalProfileAssignment {
  return {
    profileId: 'p-1',
    profileName: 'Hassan',
    channels: ['linkedin'],
    identityIds: ['i-1'],
    assignedReps: [],
    primaryRepId: 'rep-1',
    primaryRepName: 'Rep One',
    primarySource: 'coverage',
    primaryReason: 'Explicit primary coverage',
    backups: [],
    coverageState: 'EXPLICIT',
    needsReview: false,
    reviewReasons: [],
    ...over,
  }
}

const SET: CanonicalAssignmentSet = {
  businessDate: '2026-11-07',
  profiles: [
    profile({ profileId: 'p-1', primaryRepId: 'rep-1', primaryRepName: 'Rep One' }),
    profile({
      profileId: 'p-2',
      primaryRepId: 'rep-2',
      primaryRepName: 'Rep Two',
      backups: [{ repId: 'rep-1', repName: 'Rep One', priority: 2, source: 'coverage' }],
    }),
    profile({ profileId: 'p-3', primaryRepId: 'rep-3', primaryRepName: 'Rep Three' }),
  ],
  ambiguous: [],
  unassigned: [],
}

describe('AUTOPILOT_NEVER_CHANGES_PRIMARY_OWNERSHIP', () => {
  it('the coverage mutation module never writes identity_assignments', () => {
    const source = read('src/lib/coverage/actions.ts')
    expect(source).toMatch(/coverage_assignments/)
    expect(source).toMatch(/profile_coverage/)
    expect(source).not.toMatch(/identity_assignments\s*\)?\s*\.(insert|upsert|delete|update)/)
  })

  it('the coverage engine never writes at all', () => {
    const source = read('src/lib/coverage/engine.ts')
    expect(source).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(|\.update\(/)
  })

  it('primary ownership is only written by the Admin coverage configuration', () => {
    expect(read('src/app/api/team/profiles/[profileId]/coverage/route.ts')).toMatch(/configureCoverage/)
  })
})

describe('REP_PROFILE_RESPONSIBILITY_UNIQUE', () => {
  it('the executable set never repeats a profile', () => {
    // rep-1 is primary on p-1 and actively covering p-3 — p-3 appears once.
    const executable = getExecutableProfilesForRep(SET, 'rep-1', new Set(['p-3']))
    const ids = executable.map((row) => row.profileId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('backup eligibility alone never enters the executable set', () => {
    const executable = getExecutableProfilesForRep(SET, 'rep-1')
    expect(executable.map((row) => row.profileId)).toEqual(['p-1'])
  })

  it('primary, backup and executable are three distinct reads', () => {
    expect(getPrimaryProfilesForRep(SET, 'rep-1').map((row) => row.profileId)).toEqual(['p-1'])
    expect(getBackupEligibleProfilesForRep(SET, 'rep-1').map((row) => row.profileId)).toEqual(['p-2'])
    expect(getExecutableProfilesForRep(SET, 'rep-1').map((row) => row.profileId)).toEqual(['p-1'])
  })
})

describe('PROFILE_EXECUTION_GLOBAL_PARITY', () => {
  it('Rep Home own is the canonical primary, not the raw assignment table', () => {
    const load = read('src/lib/coverage/load.ts')
    expect(load).toMatch(/plan\.profiles\.filter\(\(profile\) => profile\.primaryRepId === repId\)/)
  })

  it('the switcher and channel selectors read primary plus active coverage', () => {
    const store = read('src/lib/store/supabase-store.ts')
    expect(store).toMatch(/role', 'PRIMARY'/)
    expect(store).toMatch(/listActiveCoveredIdentities/)
  })

  it('Team Profiles reads the canonical directory and renders ownership, backups and review state', () => {
    const loader = read('src/lib/team/profiles.ts')
    expect(loader).toMatch(/loadCanonicalProfileAssignments/)
    const table = read('src/components/team/team-profiles-table.tsx')
    expect(table).toMatch(/primaryRepName/)
    expect(table).toMatch(/backups/)
    expect(table).toMatch(/needsReview/)
  })

  it('the profile detail is the operating center: channels, assignment, readiness, today', () => {
    const detail = read('src/components/team/team-profile-detail.tsx')
    expect(detail).toMatch(/CoverageConfigPanel/)
    expect(detail).toMatch(/Access/)
    expect(detail).toMatch(/Today/)
    expect(detail).toMatch(/Channels/)
    expect(detail).toMatch(/Execution/)
  })

  it('production: every active primary holds eligibility (execution requires assignment)', async () => {
    const client = neonServiceDbClient()
    const [{ data: assignments }, { data: coverage }, { data: identities }] = await Promise.all([
      client.from('identity_assignments').select('rep_id, revenue_identity_id').eq('organization_id', ORG).limit(500),
      client
        .from('profile_coverage')
        .select('profile_id, rep_id, role')
        .eq('organization_id', ORG)
        .eq('active', true)
        .limit(500),
      client.from('revenue_identities').select('id, profile_id').eq('organization_id', ORG).limit(500),
    ])
    const profileByIdentity = new Map((identities ?? []).map((row) => [row.id as string, row.profile_id as string]))
    const eligibility = new Set(
      (assignments ?? []).map((row) => `${profileByIdentity.get(row.revenue_identity_id as string)}:${row.rep_id as string}`),
    )
    // Execution (PRIMARY) must always have a matching eligibility row. The
    // reverse is deliberately not required: an assignment is eligibility and
    // coverage writes must never remove it.
    for (const row of (coverage ?? []).filter((entry) => entry.role === 'PRIMARY')) {
      expect(
        eligibility.has(`${row.profile_id as string}:${row.rep_id as string}`),
        `primary ${row.profile_id} (${row.rep_id}) has no assignment`,
      ).toBe(true)
    }
  }, 120_000)
})
