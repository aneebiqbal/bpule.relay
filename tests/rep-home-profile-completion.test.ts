/**
 * Rep Home per-profile completion contracts.
 *
 * The profile cards must be a projection of the same canonical targets and
 * accountability rows the rep-day OS reads — no second count, no invented
 * score. Status comes from the canonical pacing function.
 */
import { describe, expect, it } from 'vitest'
import {
  buildProfileWarnings,
  buildProfilesToday,
  profileCompletionStatus,
} from '@/lib/rep-home/profile-completion'
import { DEFAULT_WARNING_THRESHOLDS } from '@/lib/org-clock/policy'
import type { AuthorizedIdentity } from '@/lib/auth/workspace'
import { buildRepV3Actions } from '@/lib/rep-home/v3-present'
import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'

const THRESHOLDS = DEFAULT_WARNING_THRESHOLDS

function identity(over: Partial<AuthorizedIdentity> = {}): AuthorizedIdentity {
  return {
    assignmentId: 'a1',
    revenueIdentityId: 'ri-1',
    identityName: 'Hassan',
    title: null,
    channel: 'linkedin',
    profileId: 'p1',
    profileUrl: null,
    status: 'active',
    ...over,
  }
}

function identityRow(over: Partial<{
  revenueIdentityId: string
  identityName: string
  title: string | null
  channel: string
  targets: Array<{ activityType: string; targetCount: number; completedCount: number; remaining: number }>
}> = {}) {
  return {
    revenueIdentityId: 'ri-1',
    identityName: 'Hassan',
    title: null,
    channel: 'linkedin',
    targets: [],
    ...over,
  }
}

describe('profileCompletionStatus', () => {
  it('is COMPLETE when the target is met', () => {
    expect(profileCompletionStatus(10, 10, 0.5, THRESHOLDS)).toBe('COMPLETE')
    expect(profileCompletionStatus(10, 12, 0.5, THRESHOLDS)).toBe('COMPLETE')
  })

  it('is null when there is no target — unknown is not zero', () => {
    expect(profileCompletionStatus(0, 0, 0.5, THRESHOLDS)).toBeNull()
  })

  it('is NOT_STARTED before the workday begins', () => {
    expect(profileCompletionStatus(10, 0, 0, THRESHOLDS)).toBe('NOT_STARTED')
  })

  it('is ON_TRACK when pace holds', () => {
    expect(profileCompletionStatus(10, 5, 0.5, THRESHOLDS)).toBe('ON_TRACK')
  })

  it('is BEHIND when the pace ratio slips after the risk threshold', () => {
    expect(profileCompletionStatus(10, 1, 0.5, THRESHOLDS)).toBe('BEHIND')
  })

  it('is AT_RISK when the miss is material late in the day', () => {
    expect(profileCompletionStatus(10, 1, 0.8, THRESHOLDS)).toBe('AT_RISK')
  })
})

describe('buildProfilesToday', () => {
  it('REP_PROFILE_COMPLETION_PARITY: per-profile sums equal the rep totals', () => {
    const profiles = buildProfilesToday(
      [
        identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', channel: 'linkedin' }),
        identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p2', channel: 'upwork' }),
      ],
      [
        identityRow({
          revenueIdentityId: 'ri-1',
          targets: [
            { activityType: 'connection_request', targetCount: 10, completedCount: 4, remaining: 6 },
            { activityType: 'dm', targetCount: 8, completedCount: 2, remaining: 6 },
          ],
        }),
        identityRow({
          revenueIdentityId: 'ri-2',
          identityName: 'Aneeb',
          channel: 'upwork',
          targets: [{ activityType: 'application', targetCount: 10, completedCount: 4, remaining: 6 }],
        }),
      ],
      0.5,
      THRESHOLDS,
    )

    const totalTarget = profiles.reduce((sum, p) => sum + p.targetCount, 0)
    const totalCompleted = profiles.reduce((sum, p) => sum + p.completedCount, 0)
    expect(totalTarget).toBe(28)
    expect(totalCompleted).toBe(10)
  })

  it('groups two channel identities under one profile and unions their channels', () => {
    const profiles = buildProfilesToday(
      [
        identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', channel: 'linkedin' }),
        identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p1', channel: 'upwork' }),
      ],
      [
        identityRow({
          revenueIdentityId: 'ri-1',
          targets: [{ activityType: 'dm', targetCount: 8, completedCount: 2, remaining: 6 }],
        }),
        identityRow({
          revenueIdentityId: 'ri-2',
          identityName: 'Aneeb',
          channel: 'upwork',
          targets: [{ activityType: 'application', targetCount: 10, completedCount: 4, remaining: 6 }],
        }),
      ],
      0.5,
      THRESHOLDS,
    )

    expect(profiles).toHaveLength(1)
    expect(profiles[0].channels).toEqual(['linkedin', 'upwork'])
    expect(profiles[0].targetCount).toBe(18)
    expect(profiles[0].completedCount).toBe(6)
    expect(profiles[0].remaining).toBe(12)
  })

  it('warns only from canonical facts: replies, follow-ups, not-started and behind profiles', () => {
    const profiles = [
      { profileId: 'p1', name: 'Hassan', title: null, channels: ['linkedin'], targetCount: 10, completedCount: 0, remaining: 10, status: 'NOT_STARTED' as const, targets: [] },
      { profileId: 'p2', name: 'Aneeb', title: null, channels: ['upwork'], targetCount: 10, completedCount: 4, remaining: 6, status: 'BEHIND' as const, targets: [] },
      { profileId: 'p3', name: 'Madiha', title: null, channels: ['linkedin'], targetCount: 10, completedCount: 10, remaining: 0, status: 'COMPLETE' as const, targets: [] },
    ]

    const warnings = buildProfileWarnings(profiles, { repliesWaiting: 2, followUpsDue: 1, isComplete: false })
    const messages = warnings.map((w) => w.message)

    expect(messages).toContain('2 replies have waited for an answer today.')
    expect(messages).toContain('1 follow-up due.')
    expect(messages).toContain('Hassan has not been started today.')
    expect(messages).toContain('Aneeb has 6 remaining.')
    expect(messages.some((m) => m.includes('Madiha'))).toBe(false)
  })

  it('reports a complete day as a positive state, not a warning', () => {
    const warnings = buildProfileWarnings([], { repliesWaiting: 0, followUpsDue: 0, isComplete: true })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ tone: 'info', message: "Today's work is complete." })
  })

  it('every ranked action carries its sender profile and channel', () => {
    const action: RelayTodayAction = {
      id: 'reply-1',
      kind: 'reply_needed',
      priority: 'high',
      title: 'Reply to Sarah Chen',
      subtitle: 'Acme',
      href: '/chats',
      whatHappened: 'Sarah replied',
      whyItMatters: 'Awaiting your answer',
      whyLines: [],
      prepared: null,
      humanAction: 'REPLY_NOW',
      createdAt: new Date().toISOString(),
      fitScore: null,
      identity: { id: 'ri-1', name: 'Hassan', title: null, channel: 'linkedin' },
      proof: null,
      inbound: true,
    }

    const [row] = buildRepV3Actions([], [action])
    expect(row.context).toContain('Hassan')
    expect(row.context).toContain('linkedin')
  })

  it('keeps an identity with no linked profile as its own profile key', () => {
    const profiles = buildProfilesToday(
      [identity({ assignmentId: 'a1', revenueIdentityId: 'ri-orphan', profileId: null })],
      [
        identityRow({
          revenueIdentityId: 'ri-orphan',
          targets: [{ activityType: 'dm', targetCount: 5, completedCount: 1, remaining: 4 }],
        }),
      ],
      0.5,
      THRESHOLDS,
    )

    expect(profiles).toHaveLength(1)
    expect(profiles[0].profileId).toBe('ri-orphan')
  })
})
