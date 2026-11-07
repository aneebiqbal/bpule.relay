/**
 * Profile truth + assignment + daily execution parity contracts.
 *
 * The surfaces disagreed because they read different sources: coverage used
 * the empty `profile_coverage` table, the Admin summary used every target on
 * the rep (including unassigned identities), and the profile rows used assigned
 * identities. These tests pin the ONE canonical source and the arithmetic
 * invariants.
 */
import { describe, expect, it } from 'vitest'
import { assembleTeamLive, type TeamLiveRows } from '@/lib/admin/team-live'
import { buildTeamProfiles } from '@/lib/team/profiles'
import {
  derivePrimary,
  getBackupEligibleProfilesForRep,
  getExecutableProfilesForRep,
  getPrimaryProfilesForRep,
  getProfilesForRep,
  getProfilesForRepByChannel,
  loadCanonicalProfileAssignments,
  type CanonicalAssignmentSet,
  type CanonicalAssignedRep,
  type CanonicalProfileAssignment,
} from '@/lib/profiles/canonical'
import { normalizeExternalUrl, profileNeedsReview, remainingOf } from '@/lib/profiles/display'
import { resolveAvailability, type AvailabilityState } from '@/lib/coverage/engine'
import { neonServiceDbClient } from '@/lib/db/neon'

const ORG = '11111111-1111-1111-1111-111111111111'

function assignedRep(over: Partial<CanonicalAssignedRep> = {}): CanonicalAssignedRep {
  return { repId: 'rep-1', repName: 'Rep One', channels: ['linkedin'], assignedAt: '2026-09-16T16:50:00Z', ...over }
}

function canonicalProfile(over: Partial<CanonicalProfileAssignment> = {}): CanonicalProfileAssignment {
  return {
    profileId: 'p-1',
    profileName: 'Hassan',
    channels: ['linkedin'],
    identityIds: ['i-1'],
    assignedReps: [assignedRep()],
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

describe('PROFILE_ASSIGNMENT_GLOBAL_PARITY', () => {
  it('derives the primary from the explicit coverage row first', () => {
    const result = derivePrimary({
      profileId: 'p-1',
      profileName: 'Hassan',
      assignedReps: [assignedRep(), assignedRep({ repId: 'rep-2', repName: 'Rep Two' })],
      coveragePrimaryRepId: 'rep-2',
      legacyOwnerRepId: 'rep-1',
      legacyAssignmentTimes: [],
      profileOwnerRepId: 'rep-1',
    })
    expect(result).toEqual({ repId: 'rep-2', source: 'coverage', reason: 'Explicit primary coverage' })
  })

  it('falls back to the legacy profile_assignments owner', () => {
    const result = derivePrimary({
      profileId: 'p-1',
      profileName: 'Hassan',
      assignedReps: [assignedRep(), assignedRep({ repId: 'rep-2', repName: 'Rep Two' })],
      coveragePrimaryRepId: null,
      legacyOwnerRepId: 'rep-1',
      legacyAssignmentTimes: [{ repId: 'rep-1', createdAt: '2026-09-21T17:13:39Z' }],
      profileOwnerRepId: null,
    })
    expect(result.source).toBe('legacy_assignment')
    expect(result.repId).toBe('rep-1')
  })

  it('uses the profile owner only when that rep is actually assigned', () => {
    const result = derivePrimary({
      profileId: 'p-1',
      profileName: 'Hassan',
      assignedReps: [assignedRep({ repId: 'rep-2', repName: 'Rep Two' })],
      coveragePrimaryRepId: null,
      legacyOwnerRepId: null,
      legacyAssignmentTimes: [],
      profileOwnerRepId: 'rep-1',
    })
    // rep-1 owns the profile row but is not assigned → the single assignment wins.
    expect(result.source).toBe('single_assignment')
    expect(result.repId).toBe('rep-2')
  })

  it('never guesses when several reps are assigned with no owner of record', () => {
    const result = derivePrimary({
      profileId: 'p-1',
      profileName: 'Hassan',
      assignedReps: [assignedRep(), assignedRep({ repId: 'rep-2', repName: 'Rep Two' })],
      coveragePrimaryRepId: null,
      legacyOwnerRepId: null,
      legacyAssignmentTimes: [],
      profileOwnerRepId: null,
    })
    expect(result.source).toBe('ambiguous')
    expect(result.repId).toBeNull()
  })

  it('getProfilesForRep returns only primary ownership — never backup eligibility', () => {
    const set: CanonicalAssignmentSet = {
      businessDate: '2026-11-06',
      profiles: [
        canonicalProfile({ profileId: 'p-1', primaryRepId: 'rep-1', backups: [] }),
        canonicalProfile({
          profileId: 'p-2',
          primaryRepId: 'rep-2',
          primaryRepName: 'Rep Two',
          backups: [{ repId: 'rep-1', repName: 'Rep One', priority: 2, source: 'coverage' }],
        }),
      ],
      ambiguous: [],
      unassigned: [],
    }
    expect(getProfilesForRep(set, 'rep-1').map((profile) => profile.profileId)).toEqual(['p-1'])
    expect(getPrimaryProfilesForRep(set, 'rep-1').map((profile) => profile.profileId)).toEqual(['p-1'])
    expect(getProfilesForRep(set, 'rep-3')).toEqual([])
  })

  it('backup eligibility is a separate read from ownership', () => {
    const set: CanonicalAssignmentSet = {
      businessDate: '2026-11-06',
      profiles: [
        canonicalProfile({ profileId: 'p-1', primaryRepId: 'rep-1', backups: [] }),
        canonicalProfile({
          profileId: 'p-2',
          primaryRepId: 'rep-2',
          primaryRepName: 'Rep Two',
          backups: [{ repId: 'rep-1', repName: 'Rep One', priority: 2, source: 'coverage' }],
        }),
      ],
      ambiguous: [],
      unassigned: [],
    }
    expect(getBackupEligibleProfilesForRep(set, 'rep-1').map((profile) => profile.profileId)).toEqual(['p-2'])
  })

  it('getExecutableProfilesForRep is primary plus active coverage only', () => {
    const set: CanonicalAssignmentSet = {
      businessDate: '2026-11-06',
      profiles: [
        canonicalProfile({ profileId: 'p-1', primaryRepId: 'rep-1', backups: [] }),
        canonicalProfile({
          profileId: 'p-2',
          primaryRepId: 'rep-2',
          primaryRepName: 'Rep Two',
          backups: [{ repId: 'rep-1', repName: 'Rep One', priority: 2, source: 'coverage' }],
        }),
        canonicalProfile({ profileId: 'p-3', primaryRepId: 'rep-3', primaryRepName: 'Rep Three', backups: [] }),
      ],
      ambiguous: [],
      unassigned: [],
    }
    // p-2 is backup-only for rep-1 and must not appear; p-3 is active coverage.
    const executable = getExecutableProfilesForRep(set, 'rep-1', new Set(['p-3']))
    expect(executable.map((profile) => profile.profileId).sort()).toEqual(['p-1', 'p-3'])
  })

  it('filters the workable set by channel capability', () => {
    const set: CanonicalAssignmentSet = {
      businessDate: '2026-11-06',
      profiles: [
        canonicalProfile({ profileId: 'p-1', channels: ['linkedin'] }),
        canonicalProfile({ profileId: 'p-2', channels: ['upwork'] }),
      ],
      ambiguous: [],
      unassigned: [],
    }
    expect(getProfilesForRepByChannel(set, 'rep-1', 'upwork').map((p) => p.profileId)).toEqual(['p-2'])
  })

  it('production data resolves a primary for every assigned profile', async () => {
    const set = await loadCanonicalProfileAssignments(ORG, { client: neonServiceDbClient() })
    const assigned = set.profiles.filter((profile) => profile.assignedReps.length > 0)
    expect(assigned.length).toBeGreaterThan(0)
    // The backfill plus the Admin's explicit assignment covered every profile;
    // a profile with no derivable owner would still be flagged, not guessed.
    const unresolved = assigned.filter((profile) => profile.primaryRepId === null)
    expect(unresolved).toEqual([])
    // Every resolved primary is one of the assigned reps.
    for (const profile of assigned) {
      expect(profile.assignedReps.map((rep) => rep.repId)).toContain(profile.primaryRepId)
    }
  }, 120_000)
})

describe('DAILY_COMPLETION_ARITHMETIC_PARITY', () => {
  it('remaining is max(expected - completed, 0)', () => {
    expect(remainingOf(136, 0)).toBe(136)
    expect(remainingOf(10, 3)).toBe(7)
    expect(remainingOf(10, 30)).toBe(0)
    expect(remainingOf(0, 0)).toBe(0)
    expect(remainingOf(0, 5)).toBe(0)
  })

  it('an impossible 0 / 136 with 0 remaining cannot be produced', () => {
    // The contradiction the Admin surface showed: expected 136, completed 0,
    // but "0 remaining". The invariant makes that state unrepresentable.
    const expected = 136
    const completed = 0
    expect(remainingOf(expected, completed)).toBe(expected - completed)
  })
})

describe('ADMIN_PROFILE_SUMMARY_ROW_PARITY', () => {
  it('the rep summary equals the sum of the profile rows rendered below it', () => {
    const rows: TeamLiveRows = {
      now: new Date('2026-11-06T12:00:00Z'),
      businessDate: '2026-11-06',
      timezone: 'Asia/Karachi',
      reps: [{ id: 'rep-1', name: 'Rep One', role: 'rep' }],
      identities: [
        { id: 'i-1', identity_name: 'Hassan', channel: 'linkedin', title: null, profile_id: 'p-1' },
        { id: 'i-2', identity_name: 'Unassigned', channel: 'linkedin', title: null, profile_id: 'p-2' },
      ],
      assignments: [{ rep_id: 'rep-1', revenue_identity_id: 'i-1' }],
      // The second target belongs to an identity the rep is NOT assigned to.
      targets: [
        { rep_id: 'rep-1', revenue_identity_id: 'i-1', activity_type: 'dm', target_count: 10 },
        { rep_id: 'rep-1', revenue_identity_id: 'i-2', activity_type: 'dm', target_count: 99 },
      ],
      accountability: [
        { rep_id: 'rep-1', revenue_identity_id: 'i-1', activity_type: 'dm', completed_count: 3 },
      ],
      messages: [],
      leadsToday: [],
      extractions: [],
      openLeads: [],
      profiles: [
        { id: 'p-1', display_name: 'Hassan' },
        { id: 'p-2', display_name: 'Unassigned' },
      ],
    }

    const payload = assembleTeamLive(rows)
    const profileRows = buildTeamProfiles(payload)

    const sumTarget = profileRows.reduce((sum, row) => sum + row.targetCount, 0)
    const sumCompleted = profileRows.reduce((sum, row) => sum + row.completedCount, 0)

    expect(payload.people).toHaveLength(1)
    expect(payload.people[0].totalTarget).toBe(sumTarget)
    expect(payload.people[0].totalCompleted).toBe(sumCompleted)
    // The unassigned target never inflates the summary.
    expect(payload.people[0].totalTarget).toBe(10)
    expect(profileRows.map((row) => row.profileId)).toEqual(['p-1'])
  })
})

describe('PROFILE_EXTERNAL_URL_NORMALIZATION', () => {
  it('adds a scheme without prefixing the app origin', () => {
    expect(normalizeExternalUrl('www.linkedin.com/in/hassan-saulat-5747353b6')).toBe(
      'https://www.linkedin.com/in/hassan-saulat-5747353b6',
    )
    expect(normalizeExternalUrl('linkedin.com/in/x')).toBe('https://linkedin.com/in/x')
    expect(normalizeExternalUrl('https://www.linkedin.com/in/x')).toBe('https://www.linkedin.com/in/x')
    expect(normalizeExternalUrl(null)).toBeNull()
    expect(normalizeExternalUrl('')).toBeNull()
  })

  it('flags placeholder profile names for review instead of renaming them', () => {
    expect(profileNeedsReview('Unnamed profile')).toBe(true)
    expect(profileNeedsReview('testing')).toBe(true)
    expect(profileNeedsReview('')).toBe(true)
    expect(profileNeedsReview('Hassan Saulat')).toBe(false)
  })
})

describe('REP_AVAILABILITY_ADMIN_PARITY', () => {
  const workingDay = true

  it('a strong explicit state overrides the clock', () => {
    expect(resolveAvailability({ explicit: 'ON_LEAVE', checkInAt: '2026-11-06T09:00:00Z', closedAt: null, isWorkingDay: workingDay })).toBe('ON_LEAVE')
    expect(resolveAvailability({ explicit: 'UNAVAILABLE', checkInAt: null, closedAt: null, isWorkingDay: workingDay })).toBe('UNAVAILABLE')
  })

  it('the canonical rep_day check-in wins over a weak explicit AVAILABLE', () => {
    expect(resolveAvailability({ explicit: 'AVAILABLE', checkInAt: '2026-11-06T09:00:00Z', closedAt: null, isWorkingDay: workingDay })).toBe('WORKING')
  })

  it('an explicit AVAILABLE applies only when the rep has not checked in', () => {
    expect(resolveAvailability({ explicit: 'AVAILABLE', checkInAt: null, closedAt: null, isWorkingDay: workingDay })).toBe('AVAILABLE')
  })

  it('a close is final', () => {
    expect(resolveAvailability({ explicit: null, checkInAt: '2026-11-06T09:00:00Z', closedAt: '2026-11-06T18:00:00Z', isWorkingDay: workingDay })).toBe('CHECKED_OUT')
  })

  it('falls back to the clock-derived default', () => {
    expect(resolveAvailability({ explicit: null, checkInAt: null, closedAt: null, isWorkingDay: true })).toBe<AvailabilityState>('AVAILABLE')
    expect(resolveAvailability({ explicit: null, checkInAt: null, closedAt: null, isWorkingDay: false })).toBe('OFFLINE')
  })
})
