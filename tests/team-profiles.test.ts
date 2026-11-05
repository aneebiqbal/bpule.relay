/**
 * Team → Profiles contracts.
 *
 * The profile-first view must be a projection of the canonical team-live
 * payload: one row per profile, channel identities aggregated, targets and
 * completion summed from the same goals the rep-first view reads.
 */
import { describe, expect, it } from 'vitest'
import { buildTeamProfiles } from '@/lib/team/profiles'
import type { TeamLivePayload } from '@/lib/admin/team-live'

function payload(people: TeamLivePayload['people']): TeamLivePayload {
  return { date: '2026-11-05', people }
}

describe('buildTeamProfiles', () => {
  it('ADMIN_PROFILE_REP_INVERSE_PARITY: one row per profile with its assigned rep', () => {
    const rows = buildTeamProfiles(payload([
      {
        repId: 'rep-1',
        repName: 'Dawood',
        role: 'rep',
        identities: [
          { id: 'ri-1', name: 'Hassan', title: null, channel: 'linkedin', profileId: 'p1', profileName: 'Hassan' },
          { id: 'ri-2', name: 'Aneeb', title: null, channel: 'upwork', profileId: 'p2', profileName: 'Aneeb' },
        ],
        goals: [],
        openLeads: [],
        openLeadCount: 0,
        outreachSent: 0,
        repliesHandled: 0,
        leadsSaved: 0,
        extractionsCount: 0,
        extractionFailures: 0,
        totalTarget: 0,
        totalCompleted: 0,
        totalRemaining: 0,
        lastActivityAt: null,
        identityCount: 2,
      },
    ]))

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.profileName)).toEqual(['Aneeb', 'Hassan'])
    expect(rows.every((row) => row.assignedReps.includes('Dawood'))).toBe(true)
  })

  it('aggregates two channel identities under one profile and sums their targets', () => {
    const rows = buildTeamProfiles(payload([
      {
        repId: 'rep-1',
        repName: 'Dawood',
        role: 'rep',
        identities: [
          { id: 'ri-1', name: 'Hassan', title: null, channel: 'linkedin', profileId: 'p1', profileName: 'Hassan' },
          { id: 'ri-2', name: 'Hassan', title: null, channel: 'upwork', profileId: 'p1', profileName: 'Hassan' },
        ],
        goals: [
          { activityType: 'dm', label: 'DMs', target: 8, completed: 2, remaining: 6, identityId: 'ri-1', status: 'on_track' },
          { activityType: 'application', label: 'Proposals', target: 10, completed: 4, remaining: 6, identityId: 'ri-2', status: 'at_risk' },
          { activityType: 'followup', label: 'Follow-ups', target: 3, completed: 1, remaining: 2, identityId: 'ri-1', status: 'on_track' },
        ],
        openLeads: [],
        openLeadCount: 0,
        outreachSent: 0,
        repliesHandled: 0,
        leadsSaved: 0,
        extractionsCount: 0,
        extractionFailures: 0,
        totalTarget: 21,
        totalCompleted: 7,
        totalRemaining: 14,
        lastActivityAt: null,
        identityCount: 2,
      },
    ]))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      profileName: 'Hassan',
      channels: ['linkedin', 'upwork'],
      targetCount: 21,
      completedCount: 7,
      remaining: 14,
      followUps: 1,
      proposals: 4,
      status: 'at_risk',
    })
  })

  it('keeps an identity with no linked profile as its own row', () => {
    const rows = buildTeamProfiles(payload([
      {
        repId: 'rep-1',
        repName: 'Dawood',
        role: 'rep',
        identities: [
          { id: 'ri-orphan', name: 'Orphan', title: null, channel: 'linkedin', profileId: null, profileName: null },
        ],
        goals: [],
        openLeads: [],
        openLeadCount: 0,
        outreachSent: 0,
        repliesHandled: 0,
        leadsSaved: 0,
        extractionsCount: 0,
        extractionFailures: 0,
        totalTarget: 0,
        totalCompleted: 0,
        totalRemaining: 0,
        lastActivityAt: null,
        identityCount: 1,
      },
    ]))

    expect(rows).toHaveLength(1)
    expect(rows[0].profileName).toBe('Orphan')
  })
})
