/**
 * BUG-013 — opportunity score and sender match are different numbers.
 *
 * The canonical opportunity score is sender-independent. Selecting a different
 * sender may change the sender match and the routing recommendation, never the
 * opportunity score. This pins the routing side of that contract.
 */
import { describe, expect, it } from 'vitest'
import {
  rankSendersForLead,
  type RoutingLeadContext,
  type SenderProfile,
} from '@/lib/relay/sender-routing-engine'

const lead: RoutingLeadContext = {
  capabilities: ['react', 'node.js', 'typescript'],
  industries: ['saas'],
  buyerRequestProbability: 0.7,
  fitLevel: 'STRONG',
  rawTerms: ['Acme Corp', 'CTO'],
  platform: 'linkedin',
}

function sender(overrides: Partial<SenderProfile>): SenderProfile {
  return {
    id: 's-default',
    name: 'Default',
    role: 'Engineer',
    platform: 'linkedin',
    skills: ['react'],
    industries: ['saas'],
    proof: [],
    holders: [{ repId: 'rep-1', name: 'Rep One' }],
    accessibleToRep: true,
    ...overrides,
  }
}

const strong = sender({ id: 's-strong', name: 'Strong', skills: ['react', 'node.js', 'typescript'] })
const weak = sender({ id: 's-weak', name: 'Weak', skills: ['cobol', 'fortran'] })

describe('BUG013_SENDER_SCORE_SEPARATION', () => {
  it('changing the selected sender never changes the ranking or the best match', () => {
    const a = rankSendersForLead(lead, [strong, weak], strong.id)
    const b = rankSendersForLead(lead, [strong, weak], weak.id)

    expect(a.rankings.map((r) => r.senderId)).toEqual(b.rankings.map((r) => r.senderId))
    expect(a.bestSenderId).toBe(b.bestSenderId)
    expect(a.bestSenderMatch).toBe(b.bestSenderMatch)
    // Only the "selected sender" numbers move.
    expect(a.currentSenderMatch).not.toBe(b.currentSenderMatch)
    expect(a.currentSenderRank).not.toBe(b.currentSenderRank)
  })

  it('the routing result carries no opportunity score at all', () => {
    const result = rankSendersForLead(lead, [strong, weak], strong.id)
    expect(Object.keys(result)).not.toContain('canonicalScore')
    expect(Object.keys(result)).not.toContain('score')
  })

  it('does not mutate the lead context', () => {
    const snapshot = JSON.stringify(lead)
    rankSendersForLead(lead, [strong, weak], strong.id)
    expect(JSON.stringify(lead)).toBe(snapshot)
  })
})
