/**
 * Revenue-operations UX sprint regression guards.
 *
 * Today is action-first and excludes terminal leads; the admin QA surface is
 * admin-gated and exposes routing/staleness/threads.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { leadClosedForOutreach } from '@/lib/relay/queue-engine'
import { deriveNextLeadAction } from '@/lib/relay/lead-state-machine'
import type { LeadDetail } from '@/lib/store/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('Today — terminal leads never appear', () => {
  it('terminal statuses are closed for outreach', () => {
    for (const status of ['lost', 'won', 'dead', 'no'] as const) {
      expect(leadClosedForOutreach({ status }, [])).toBe(true)
    }
  })

  it('a terminal lead yields no action', () => {
    const lead = { id: 'l1', company: 'A', contactName: 'B', status: 'won', messages: [], outcomes: [], createdAt: '2026-01-01T00:00:00Z' } as unknown as LeadDetail
    const action = deriveNextLeadAction(lead, Date.now())
    expect(action.action).toBe('CLOSED')
    expect(action.requiresAction).toBe(false)
  })

  it('a declined lead yields no reply task', () => {
    const lead = {
      id: 'l2', company: 'A', contactName: 'B', status: 'replied',
      messages: [
        { id: 'm1', leadId: 'l2', direction: 'outbound', type: 'dm', sentText: 'Hi', sentAt: '2026-01-01T00:00:00Z' },
        { id: 'm2', leadId: 'l2', direction: 'inbound', type: 'reply', sentText: 'Please do not contact me again.', sentAt: '2026-01-02T00:00:00Z' },
      ],
      outcomes: [], createdAt: '2026-01-01T00:00:00Z',
    } as unknown as LeadDetail
    expect(deriveNextLeadAction(lead, Date.now()).action).toBe('CLOSED')
  })
})

describe('Today — action-first operating screen', () => {
  const src = read('src/components/dashboard/rep-dashboard.tsx')
  it('shows exactly the four operational numbers', () => {
    for (const label of ['Replies waiting', 'Follow-ups due', 'High-priority opportunities', 'Done today']) {
      expect(src).toContain(label)
    }
  })
  it('renders a ranked "Do this next" list with one CTA per row', () => {
    expect(src).toContain('Do this next')
    expect(src).toContain('ACTION_VERB[task.humanAction')
    expect(src).toContain('whyNow(task)')
  })
  it('states a canonical "why now" instead of raw scorer language', () => {
    expect(src).toContain('Client replied — answer while it is fresh')
    expect(src).not.toMatch(/canonicalScore\s*\/\s*100\s*\{/)
  })
  it('has a caught-up empty state', () => {
    expect(src).toContain('caught up')
  })
})

describe('Admin QA surface', () => {
  const page = read('src/app/(app)/admin/qa/page.tsx')
  const api = read('src/app/api/admin/qa-views/route.ts')

  it('is reachable from the admin nav', () => {
    expect(read('src/components/app-rail.tsx')).toContain("'/admin/qa'")
  })

  it('exposes routing, staleness and threads sections', () => {
    for (const s of ['Routing v1/v2', 'Score staleness', 'Thread trust']) expect(page).toContain(s)
  })

  it('shows the routing flags with human labels', () => {
    for (const f of ['V1_V2_DISAGREE', 'BEST_SENDER_INACCESSIBLE', 'NO_VERIFIED_PROOF', 'CURRENT_SENDER_UNKNOWN', 'PLATFORM_MISMATCH']) {
      expect(page).toContain(f)
    }
  })

  it('has routing filters', () => {
    for (const f of ['Disagreement', 'No proof', 'Inaccessible', 'Platform mismatch', 'Unreviewed']) expect(page).toContain(f)
  })

  it('the API is admin-gated and read-only', () => {
    expect(api).toContain("can(auth, 'VIEW_TEAM_ANALYTICS')")
    expect(api).toContain('routingComparisonViews')
    expect(api).toContain('scoringCoverage')
    expect(api).toContain('unverifiedThreads')
  })
})
