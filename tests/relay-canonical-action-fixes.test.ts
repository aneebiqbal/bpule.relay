/**
 * Regression guards for the seven canonical-action / trust fixes.
 */
import { describe, expect, it } from 'vitest'
import { deriveNextLeadAction, LEAD_ACTION_META } from '@/lib/relay/lead-state-machine'
import { derivePipelineStage } from '@/components/leads/pipeline-utils'
import { deriveThreadStatus } from '@/lib/relay/thread-status'
import { describeVerdictForDisplay } from '@/lib/relay/revenue-strategy'
import { buildDecisionTrace } from '@/lib/relay/decision-trace'
import type { LeadDetail } from '@/lib/store/types'

function lead(partial: Record<string, unknown>): LeadDetail {
  return { id: 'l1', company: 'A', status: 'new', messages: [], outcomes: [], createdAt: '2026-01-01T00:00:00Z', ...partial } as unknown as LeadDetail
}

describe('1 — canonical action drives the label/reason', () => {
  it('exposes a canonical label for every action', () => {
    for (const action of Object.keys(LEAD_ACTION_META) as Array<keyof typeof LEAD_ACTION_META>) {
      expect(LEAD_ACTION_META[action].primaryLabel).toBeTruthy()
    }
  })
  it('no action renders "Reach out to connect"', () => {
    for (const meta of Object.values(LEAD_ACTION_META)) {
      expect(meta.primaryLabel).not.toMatch(/reach out to connect/i)
      expect(meta.reason).not.toMatch(/reach out to connect/i)
    }
  })
})

describe('2 & 3 — OBSERVE / SKIP never offers outreach or "To Contact"', () => {
  it('a skip lead is not a fit and needs no action', () => {
    const r = deriveNextLeadAction(lead({ verdict: 'skip' }), Date.now())
    expect(r.action).toBe('REVIEW')
    expect(r.requiresAction).toBe(false)
    expect(r.primaryLabel).toMatch(/not a fit/i)
  })
  it('a research_more lead with no inbound is watched, not contacted', () => {
    const r = deriveNextLeadAction(lead({ verdict: 'research_more' }), Date.now())
    expect(r.action).toBe('REVIEW')
    expect(r.requiresAction).toBe(false)
  })
  it('skip leads are never in the To Contact pipeline stage', () => {
    expect(derivePipelineStage(lead({ verdict: 'skip' }))).toBe('observe')
    expect(derivePipelineStage(lead({ verdict: 'research_more' }))).toBe('observe')
  })
  it('an actionable lead still reaches To Contact', () => {
    expect(derivePipelineStage(lead({ verdict: 'send', status: 'new' }))).toBe('to_contact')
  })
})

describe('4 — no inbound message never says "They replied"', () => {
  it('an outbound reply-type message is not an inbound reply', () => {
    const withOnlyOutbound = lead({
      status: 'replied',
      messages: [{ id: 'm1', direction: 'outbound', type: 'reply', sentText: 'Thanks!', sentAt: '2026-01-02T00:00:00Z' }],
    })
    // The queue must not emit a reply task for this lead; buildRelayQueue drops it.
    // Assert the state machine agrees there is nothing to reply to.
    const r = deriveNextLeadAction(withOnlyOutbound, Date.now())
    expect(r.action).not.toBe('SEND_REPLY')
  })
})

describe('5 — thread state', () => {
  it('no messages is NO_THREAD, not VERIFIED', () => {
    expect(deriveThreadStatus([])).toBe('NO_THREAD')
  })
  it('messages with no unverified inbound are VERIFIED', () => {
    expect(deriveThreadStatus([{ direction: 'outbound', thread_status: 'UNVERIFIED' }])).toBe('VERIFIED')
  })
  it('an unverified inbound is UNVERIFIED', () => {
    expect(deriveThreadStatus([{ direction: 'inbound', thread_status: 'UNVERIFIED' }])).toBe('UNVERIFIED')
  })
  it('a dismissed message is DISMISSED', () => {
    expect(deriveThreadStatus([{ direction: 'inbound', thread_status: 'DISMISSED' }])).toBe('DISMISSED')
  })
})

describe('6 — priority is never labelled "fit"', () => {
  it('the low qualification headline is not "Weak fit"', () => {
    const { headline } = describeVerdictForDisplay('low', 'RESEARCH_MORE', null)
    expect(headline.toLowerCase()).not.toMatch(/fit/)
  })
})

describe('7 — evidence snippets are dimension-relevant', () => {
  it('evidence nodes carry a dimension tag', () => {
    const trace = buildDecisionTrace('l1', 'Acme', {
      evidenceLedger: [{ text: 'we need a checkout migration', verified: true, source: 'post' }],
      v3DecisionPacket: { score: 60, dimensions: [{ key: 'fit', label: 'Fit', contribution: 20, note: 'x' }], reasons: ['strong fit'], confidence: 0.7, version: 'v', provider: 'p', action: 'RESEARCH_MORE' },
    } as unknown as Record<string, unknown>)
    const evidenceNodes = trace.trace.filter((n) => n.evidence.length > 0)
    expect(evidenceNodes.length).toBeGreaterThan(0)
    // The dimension-bearing nodes must be tagged; guardrail/action evidence is
    // not dimension evidence and is labelled as supporting evidence in the UI.
    const dimensionNodes = evidenceNodes.filter((n) => ['EVIDENCE_VERIFIED', 'EPISODES_BUILT', 'SCORE'].includes(n.step))
    expect(dimensionNodes.length).toBeGreaterThan(0)
    for (const n of dimensionNodes) expect(n.dimension).toBeTruthy()
    expect(evidenceNodes.find((n) => n.step === 'SCORE')?.dimension).toBe('composite')
    expect(evidenceNodes.find((n) => n.step === 'EVIDENCE_VERIFIED')?.dimension).toBe('evidenceQuality')
  })
})
