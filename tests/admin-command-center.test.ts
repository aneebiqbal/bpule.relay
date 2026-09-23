import { describe, expect, it } from 'vitest'
import { buildCommandCenterFromActivity } from '@/lib/relay/dashboard-loader'

/**
 * Regression coverage for the admin Command Center all-zero-stats bug:
 * the view used to be driven entirely by day_closes / revenue_identity_contracts,
 * which can be completely unprovisioned for a real org (zero contracts ever
 * created) while daily_targets/daily_accountability — a separate, simpler
 * per-activity target system — is genuinely populated with real completed
 * counts from reps actively working. That showed "No active operators
 * today" for a team that was demonstrably working.
 */

const REP = { id: 'rep-1', name: 'Dana Wu' }
const IDENTITY = { id: 'identity-1', identity_name: 'Acme Outreach' }

describe('buildCommandCenterFromActivity', () => {
  it('shows a rep as working from daily_targets/daily_accountability alone, with zero day_closes and zero contracts', () => {
    const result = buildCommandCenterFromActivity({
      reps: [REP],
      assignments: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id }],
      identities: [IDENTITY],
      targets: [
        { revenue_identity_id: IDENTITY.id, activity_type: 'dm', target_count: 30 },
        { revenue_identity_id: IDENTITY.id, activity_type: 'connection_request', target_count: 20 },
      ],
      accountability: [
        { rep_id: REP.id, revenue_identity_id: IDENTITY.id, activity_type: 'dm', completed_count: 15 },
      ],
      dayCloses: [], // no day_closes rows at all — must not blank out the view
      dayElapsedPct: 0.3,
    })

    expect(result.teamHealth.working).toBe(1)
    expect(result.teamHealth.onTrack).toBe(1)
    expect(result.team).toHaveLength(1)
    expect(result.team[0]).toMatchObject({
      personId: REP.id,
      personName: REP.name,
      progress: '15/50',
      dayCloseStatus: null,
    })
  })

  it('does not count a rep with an identity assignment but zero target rows as "working" (never logged activity is distinct from on-track)', () => {
    const result = buildCommandCenterFromActivity({
      reps: [REP],
      assignments: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id }],
      identities: [IDENTITY],
      targets: [],
      accountability: [],
      dayCloses: [],
      dayElapsedPct: 0.3,
    })

    expect(result.teamHealth.working).toBe(0)
    expect(result.team).toHaveLength(0)
  })

  it('excludes reps with no identity assignment at all', () => {
    const result = buildCommandCenterFromActivity({
      reps: [REP, { id: 'rep-2', name: 'No Assignments' }],
      assignments: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id }],
      identities: [IDENTITY],
      targets: [{ revenue_identity_id: IDENTITY.id, activity_type: 'dm', target_count: 10 }],
      accountability: [],
      dayCloses: [],
      dayElapsedPct: 0.3,
    })

    expect(result.team.map((t) => t.personId)).toEqual([REP.id])
  })

  it('flags a rep as behind only once the day is at least half elapsed and completion is under 60% of target', () => {
    const early = buildCommandCenterFromActivity({
      reps: [REP],
      assignments: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id }],
      identities: [IDENTITY],
      targets: [{ revenue_identity_id: IDENTITY.id, activity_type: 'dm', target_count: 30 }],
      accountability: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id, activity_type: 'dm', completed_count: 0 }],
      dayCloses: [],
      dayElapsedPct: 0.2, // early in the day — not behind yet
    })
    expect(early.teamHealth.behind).toBe(0)
    expect(early.team[0]?.status).toBe('on_track')

    const late = buildCommandCenterFromActivity({
      reps: [REP],
      assignments: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id }],
      identities: [IDENTITY],
      targets: [{ revenue_identity_id: IDENTITY.id, activity_type: 'dm', target_count: 30 }],
      accountability: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id, activity_type: 'dm', completed_count: 0 }],
      dayCloses: [],
      dayElapsedPct: 0.6, // past halfway, 0% complete
    })
    expect(late.teamHealth.behind).toBe(1)
    expect(late.team[0]?.status).toBe('behind')
    expect(late.attentionItems).toHaveLength(1)
    expect(late.attentionItems[0]?.repId).toBe(REP.id)
  })

  it('marks a rep completed once completed_count meets target across all their activity types', () => {
    const result = buildCommandCenterFromActivity({
      reps: [REP],
      assignments: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id }],
      identities: [IDENTITY],
      targets: [{ revenue_identity_id: IDENTITY.id, activity_type: 'dm', target_count: 10 }],
      accountability: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id, activity_type: 'dm', completed_count: 10 }],
      dayCloses: [],
      dayElapsedPct: 0.9,
    })

    expect(result.teamHealth.closed).toBe(1)
    expect(result.team[0]?.status).toBe('completed')
  })

  it('enriches dayCloseStatus from day_closes when present, without requiring it', () => {
    const result = buildCommandCenterFromActivity({
      reps: [REP],
      assignments: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id }],
      identities: [IDENTITY],
      targets: [{ revenue_identity_id: IDENTITY.id, activity_type: 'dm', target_count: 10 }],
      accountability: [{ rep_id: REP.id, revenue_identity_id: IDENTITY.id, activity_type: 'dm', completed_count: 5 }],
      dayCloses: [{ person_id: REP.id, status: 'ready_to_close' }],
      dayElapsedPct: 0.3,
    })

    expect(result.team[0]?.dayCloseStatus).toBe('ready_to_close')
  })
})
