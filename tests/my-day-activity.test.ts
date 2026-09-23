import { describe, expect, it } from 'vitest'
import { buildMyDayFromActivity } from '@/lib/relay/dashboard-loader'

/**
 * Regression coverage for the "My Day" false "No revenue identity assigned"
 * bug: this section only ever read totals/categories from
 * revenue_identity_contracts, the same formal-contract table whose absence
 * was already fixed for the admin Command Center (see
 * tests/admin-command-center.test.ts). A rep with a real identity_assignments
 * row and real daily_targets/daily_accountability data, but no formal
 * contract ever created for their identity, saw an all-zero My Day view and
 * a warning telling them no identity was assigned at all — even though one
 * was, and they had real targets and completed activity.
 */

const REP_ID = 'rep-1'
const IDENTITY_ID = 'identity-1'

describe('buildMyDayFromActivity', () => {
  it('shows real progress from daily_targets/daily_accountability alone, with zero contracts', () => {
    const result = buildMyDayFromActivity({
      identityIds: [IDENTITY_ID],
      repId: REP_ID,
      contracts: [],
      allocations: [],
      dayCloses: [],
      targets: [
        { revenue_identity_id: IDENTITY_ID, activity_type: 'connection_request', target_count: 30 },
        { revenue_identity_id: IDENTITY_ID, activity_type: 'dm', target_count: 30 },
      ],
      accountability: [
        { revenue_identity_id: IDENTITY_ID, activity_type: 'connection_request', completed_count: 2 },
      ],
      isWorkingDay: true,
      dayElapsedPct: 0.3,
    })

    expect(result.totalTarget).toBe(60)
    expect(result.totalCompleted).toBe(2)
    expect(result.hasIdentity).toBe(true)
    expect(result.hasContract).toBe(false)
  })

  it('does not show "No revenue identity assigned" when an identity is assigned, even with zero contracts', () => {
    const result = buildMyDayFromActivity({
      identityIds: [IDENTITY_ID],
      repId: REP_ID,
      contracts: [],
      allocations: [],
      dayCloses: [],
      targets: [
        { revenue_identity_id: IDENTITY_ID, activity_type: 'connection_request', target_count: 30 },
      ],
      accountability: [],
      isWorkingDay: true,
      dayElapsedPct: 0.1,
    })

    expect(result.warning?.message).not.toMatch(/no revenue identity assigned/i)
  })

  it('shows "No revenue identity assigned" only when there is truly no identity assignment', () => {
    const result = buildMyDayFromActivity({
      identityIds: [],
      repId: REP_ID,
      contracts: [],
      allocations: [],
      dayCloses: [],
      targets: [],
      accountability: [],
      isWorkingDay: true,
      dayElapsedPct: 0.3,
    })

    expect(result.hasIdentity).toBe(false)
    expect(result.warning?.message).toMatch(/no revenue identity assigned/i)
  })

  it('merges contract-based and daily_targets-based totals for a rep provisioned through both systems', () => {
    const result = buildMyDayFromActivity({
      identityIds: [IDENTITY_ID],
      repId: REP_ID,
      contracts: [{ id: 'contract-1', revenue_identity_id: IDENTITY_ID, connections: 10, first_dms: 0, emails: 0, followups: 0 }],
      allocations: [],
      dayCloses: [{ revenue_identity_id: IDENTITY_ID, status: 'ready_to_close', completion_snapshot: { connections: 4 } }],
      targets: [{ revenue_identity_id: IDENTITY_ID, activity_type: 'email', target_count: 5 }],
      accountability: [{ revenue_identity_id: IDENTITY_ID, activity_type: 'email', completed_count: 1 }],
      isWorkingDay: true,
      dayElapsedPct: 0.3,
    })

    expect(result.totalTarget).toBe(15) // 10 (contract connections) + 5 (daily_targets email)
    expect(result.totalCompleted).toBe(5) // 4 (contract) + 1 (daily_targets)
    expect(result.hasContract).toBe(true)
    expect(result.hasIdentity).toBe(true)
  })

  it('routes application/proposal/other activity types into their own category rows, not lost or miscategorized', () => {
    const result = buildMyDayFromActivity({
      identityIds: [IDENTITY_ID],
      repId: REP_ID,
      contracts: [],
      allocations: [],
      dayCloses: [],
      targets: [
        { revenue_identity_id: IDENTITY_ID, activity_type: 'application', target_count: 10 },
        { revenue_identity_id: IDENTITY_ID, activity_type: 'proposal', target_count: 5 },
      ],
      accountability: [
        { revenue_identity_id: IDENTITY_ID, activity_type: 'application', completed_count: 3 },
      ],
      isWorkingDay: true,
      dayElapsedPct: 0.3,
    })

    const applications = result.categories.find((c) => c.key === 'applications')
    const proposals = result.categories.find((c) => c.key === 'proposals')
    expect(applications).toMatchObject({ completed: 3, target: 10, remaining: 7 })
    expect(proposals).toMatchObject({ completed: 0, target: 5, remaining: 5 })
    expect(result.totalTarget).toBe(15)
    expect(result.totalCompleted).toBe(3)
  })

  it('hasContract only reflects formal revenue_identity_contracts rows, independent of hasIdentity', () => {
    const withContract = buildMyDayFromActivity({
      identityIds: [IDENTITY_ID],
      repId: REP_ID,
      contracts: [{ id: 'contract-1', revenue_identity_id: IDENTITY_ID, connections: 10, first_dms: 0, emails: 0, followups: 0 }],
      allocations: [],
      dayCloses: [],
      targets: [],
      accountability: [],
      isWorkingDay: true,
      dayElapsedPct: 0.3,
    })
    expect(withContract.hasContract).toBe(true)
    expect(withContract.hasIdentity).toBe(true)

    const withoutContract = buildMyDayFromActivity({
      identityIds: [IDENTITY_ID],
      repId: REP_ID,
      contracts: [],
      allocations: [],
      dayCloses: [],
      targets: [{ revenue_identity_id: IDENTITY_ID, activity_type: 'dm', target_count: 10 }],
      accountability: [],
      isWorkingDay: true,
      dayElapsedPct: 0.3,
    })
    expect(withoutContract.hasContract).toBe(false)
    expect(withoutContract.hasIdentity).toBe(true)
  })
})
