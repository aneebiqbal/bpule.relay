import { describe, expect, it } from 'vitest'
import { assembleTeamLive, assignmentIdentityId, filterTeamLive } from '@/lib/admin/team-live'

const now = new Date('2026-09-24T10:00:00.000Z')

describe('assembleTeamLive', () => {
  it('joins assignments on revenue_identity_id and attaches the open leads that person owns', () => {
    const payload = assembleTeamLive({
      now,
      reps: [
        { id: 'rep-1', name: 'Madiha', role: 'rep' },
        { id: 'rep-2', name: 'Hassan', role: 'rep' },
      ],
      identities: [
        { id: 'id-1', identity_name: 'North Desk', channel: 'linkedin', title: 'Founder' },
      ],
      assignments: [
        { revenue_identity_id: 'id-1', rep_id: 'rep-1' },
        { identity_id: 'id-1', rep_id: 'rep-2' },
      ],
      targets: [
        { rep_id: 'rep-1', revenue_identity_id: 'id-1', activity_type: 'prospect_extracted', target_count: 10 },
        { rep_id: 'rep-1', revenue_identity_id: 'id-1', activity_type: 'dm', target_count: 8 },
      ],
      accountability: [
        { rep_id: 'rep-1', revenue_identity_id: 'id-1', activity_type: 'prospect_extracted', completed_count: 4 },
        { rep_id: 'rep-1', revenue_identity_id: 'id-1', activity_type: 'dm', completed_count: 1 },
        { rep_id: 'rep-1', revenue_identity_id: 'id-1', activity_type: 'other', completed_count: 99 },
      ],
      messages: [
        { rep_id: 'rep-1', type: 'dm', sent_at: '2026-09-24T09:00:00.000Z' },
        { rep_id: 'rep-1', type: 'reply', sent_at: '2026-09-24T09:30:00.000Z' },
      ],
      leadsToday: [{ owner_rep_id: 'rep-1', created_at: '2026-09-24T08:00:00.000Z' }],
      extractions: [{ rep_id: 'rep-1', success: true, created_at: '2026-09-24T08:10:00.000Z' }],
      openLeads: [
        { id: 'lead-1', owner_rep_id: 'rep-1', company: '101domain.com', contact_name: 'Ana', status: 'contacted', canonical_score: 8, score: 4 },
        { id: 'lead-2', owner_rep_id: 'rep-1', company: '  ', contact_name: null, status: 'new', canonical_score: null, score: 6 },
        { id: 'lead-3', owner_rep_id: 'rep-2', company: 'Other Co', contact_name: 'Sam', status: 'replied', canonical_score: 9, score: null },
      ],
    })

    const madiha = payload.people.find((person) => person.repId === 'rep-1')
    const hassan = payload.people.find((person) => person.repId === 'rep-2')
    expect(madiha?.identities.map((identity) => identity.name)).toEqual(['North Desk'])
    expect(hassan?.identities).toEqual([])
    expect(madiha?.goals.map((goal) => goal.label)).toEqual(['prospects', 'DMs'])
    expect(madiha?.totalCompleted).toBe(5)
    expect(madiha?.totalTarget).toBe(18)
    expect(madiha?.totalRemaining).toBe(13)
    expect(madiha?.leadsSaved).toBe(1)
    expect(madiha?.outreachSent).toBe(1)
    expect(madiha?.repliesHandled).toBe(1)
    expect(madiha?.lastActivityAt).toBe('2026-09-24T09:30:00.000Z')
    expect(madiha?.openLeadCount).toBe(2)
    expect(madiha?.openLeads[0]).toMatchObject({ company: '101domain.com', statusLabel: 'Contacted', score: 8 })
    expect(madiha?.openLeads[1]).toMatchObject({ company: 'Untitled company', score: 6 })
    expect(payload.people[0]?.repId).toBe('rep-1')
  })

  it('ignores an assignment that only has the old identity_id column', () => {
    expect(assignmentIdentityId({ identity_id: 'id-1' })).toBeNull()
    expect(assignmentIdentityId({ revenue_identity_id: 'id-1' })).toBe('id-1')
  })

  it('limits a person without team analytics to their own row', () => {
    const payload = assembleTeamLive({
      now,
      reps: [
        { id: 'rep-1', name: 'Madiha', role: 'rep' },
        { id: 'rep-2', name: 'Hassan', role: 'rep' },
      ],
      identities: [],
      assignments: [],
      targets: [],
      accountability: [],
      messages: [],
      leadsToday: [],
      extractions: [],
      openLeads: [],
    })
    const own = filterTeamLive(payload, { repId: 'rep-2', canSeeTeam: false })
    expect(own.people.map((person) => person.repId)).toEqual(['rep-2'])
    expect(filterTeamLive(payload, { repId: 'rep-2', canSeeTeam: true }).people).toHaveLength(2)
  })
})
