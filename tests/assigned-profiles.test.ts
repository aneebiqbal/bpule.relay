import { describe, expect, it } from 'vitest'
import { normalizeAssignedProfiles } from '@/lib/relay/assigned-profiles'

describe('normalizeAssignedProfiles', () => {
  it('reads the live /api/rep/today shape without calling flatMap on a missing list', () => {
    const model = normalizeAssignedProfiles({
      isWorkingDay: true,
      totalTarget: 10,
      totalCompleted: 2,
      totalRemaining: 8,
      overallStatus: 'at_risk',
      identities: [
        {
          assignmentId: 'a1',
          identity: {
            identity_name: 'Hassan',
            title: 'Engineer',
            channel: 'linkedin',
            profile_url: 'https://linkedin.com/in/hassan',
          },
          targets: [
            {
              targetId: 't1',
              activityType: 'dm',
              targetCount: 10,
              completedCount: 2,
              remaining: 8,
              status: 'at_risk',
              accountabilityId: null,
            },
          ],
        },
      ],
    })

    expect(model.assignedIdentities).toHaveLength(1)
    expect(model.assignedIdentities[0]?.identity.identityName).toBe('Hassan')
    expect(model.assignedIdentities[0]?.identity.profileUrl).toBe('https://linkedin.com/in/hassan')
    expect(model.assignedIdentities[0]?.targets[0]?.status).toBe('at_risk')
    expect(model.notifications).toEqual([])
  })

  it('treats an empty or partial payload as no assignments', () => {
    expect(normalizeAssignedProfiles({ identities: [] }).assignedIdentities).toEqual([])
    expect(normalizeAssignedProfiles({}).assignedIdentities).toEqual([])
    expect(normalizeAssignedProfiles(null).repName).toBe('You')
  })
})
