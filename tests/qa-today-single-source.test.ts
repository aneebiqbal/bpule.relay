/**
 * TODAY_SINGLE_SOURCE
 *
 * One loader, one contract. `/dashboard`, `/api/rep/day`, `/api/rep/today` and
 * the scheduler must read the same rep-day object; a page may not compute its
 * own status. This is an architecture guard, because the bug it prevents is
 * exactly the audit's finding: four surfaces answering "what do I do now"
 * with four different calculations.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCommitments } from '@/lib/rep-day/commitments'
import { normalizePolicy } from '@/lib/org-clock'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('TODAY_SINGLE_SOURCE — one loader', () => {
  it('the Today page renders the canonical rep day', () => {
    expect(read('src/app/(app)/dashboard/page.tsx')).toContain('loadRepDay')
    expect(read('src/components/rep/rep-workspace.tsx')).toContain('RepDayPanel')
  })

  it('both rep-day APIs read the same loader', () => {
    expect(read('src/app/api/rep/day/route.ts')).toContain('loadRepDay')
    expect(read('src/app/api/rep/day/close/route.ts')).toContain('loadRepDay')
    expect(read('src/app/api/rep/today/route.ts')).toContain('loadRepDay')
  })

  it('the loader derives its commitments from the workspace, not a second query', () => {
    const loader = read('src/lib/rep-day/load.ts')
    expect(loader).toContain('getDailyWorkspace')
    expect(loader).toContain('buildCommitments')
    expect(loader).toContain('deriveRepDayState')
  })

  it('no page computes its own state machine', () => {
    const panel = read('src/components/rep/rep-day-panel.tsx')
    // The UI renders a state; it never decides one.
    expect(panel).not.toContain('deriveRepDayState')
    expect(panel).not.toContain('computePace')
  })

  it('the scheduler reads the same state machine', () => {
    expect(read('src/lib/scheduler/run.ts')).toContain('deriveRepDayState')
  })
})

describe('TODAY_SINGLE_SOURCE — the commitment contract', () => {
  const policy = normalizePolicy({
    organizationId: 'org-1',
    targetPack: [
      { key: 'profiles_supplied', label: 'Profiles', target: 25, unit: 'count' },
      { key: 'replies_handled', label: 'Replies', target: 100, unit: 'percent' },
    ],
  })

  it('is deterministic for the same input', () => {
    const input = {
      targets: [
        { activityType: 'prospect_extracted', targetCount: 25, completedCount: 10 },
        { activityType: 'dm', targetCount: 15, completedCount: 3 },
      ],
      repliesWaiting: 2,
      targetPack: policy.targetPack,
    }

    expect(buildCommitments(input)).toEqual(buildCommitments(input))
  })

  it('sums a commitment from its declared sources', () => {
    const summary = buildCommitments({
      targets: [
        { activityType: 'dm', targetCount: 10, completedCount: 4 },
        { activityType: 'connection_request', targetCount: 5, completedCount: 1 },
      ],
      repliesWaiting: 0,
      targetPack: policy.targetPack,
    })

    const outbound = summary.rows.find((row) => row.key === 'outbound_actions')!
    expect(outbound.target).toBe(15)
    expect(outbound.completed).toBe(5)
    expect(outbound.remaining).toBe(10)
  })

  it('shows the seven canonical commitments in a stable order', () => {
    const summary = buildCommitments({ targets: [], repliesWaiting: 0, targetPack: policy.targetPack })
    expect(summary.rows.map((row) => row.key)).toEqual([
      'profiles_supplied',
      'emails_supplied',
      'jobs_reviewed',
      'qualified_opportunities',
      'outbound_actions',
      'followups_completed',
      'replies_handled',
    ])
  })

  it('excludes an unmeasured commitment from the pace denominator', () => {
    const summary = buildCommitments({
      targets: [{ activityType: 'prospect_extracted', targetCount: 25, completedCount: 25 }],
      repliesWaiting: 0,
      targetPack: [],
    })

    const qualified = summary.rows.find((row) => row.key === 'qualified_opportunities')!
    expect(qualified.measured).toBe(false)
    expect(summary.totalTarget).toBe(25)
  })

  it('treats waiting replies as mandatory work', () => {
    const summary = buildCommitments({ targets: [], repliesWaiting: 3, targetPack: policy.targetPack })
    expect(summary.mandatoryRemaining).toBe(3)
    expect(summary.requiredRemaining).toBeGreaterThanOrEqual(3)
  })
})
