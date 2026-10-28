/**
 * BUG-002 — explicit buyer semantics (MICHAEL_EXPLICIT_BUYER_FUTURE_START).
 *
 * A verified buying request is CURRENT even when the project starts in the
 * future. HIGH buyer intent, MEDIUM fit and LOW decision confidence are
 * orthogonal dimensions and must not be forced into agreement.
 */

import { describe, expect, it } from 'vitest'
import { readBuyerSourceFacts, resolveVerifiedBuyerIntent } from '@/lib/intelligence-v3/buyer-intent'
import { readSourceFacts } from '@/lib/intelligence-v3/source-facts-model'
import { resolveTiming } from '@/lib/intelligence-v3/dimensions'
import { extractExplicitDates } from '@/lib/intelligence-v3/source-facts'
import { scoreSourceForTest } from './helpers/score-source'

const MICHAEL = [
  'Michael Anderson',
  'CTO at Northstar Logistics',
  'Northstar Logistics runs a fleet dispatch platform.',
  'We are looking for an external software team to rebuild our dispatch platform.',
  'Budget approved: $60,000.',
  'Project begins April 2027.',
].join('\n')

describe('BUG-002 MICHAEL_EXPLICIT_BUYER_FUTURE_START', () => {
  it('resolves a verified request with HIGH intent', () => {
    const intent = resolveVerifiedBuyerIntent(readBuyerSourceFacts(MICHAEL))
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
  })

  it('keeps the buying request CURRENT while the project start is in the future', () => {
    const facts = readSourceFacts(MICHAEL)
    const intent = resolveVerifiedBuyerIntent(facts.buyer)
    const timing = resolveTiming(facts, intent, null, null)

    expect(timing.buyerTiming).toBe('CURRENT')
    expect(timing.desiredStartDate).toBe('April 2027')
  })

  it('does not read a future delivery date as activity recency', () => {
    const facts = readSourceFacts(MICHAEL)
    const intent = resolveVerifiedBuyerIntent(facts.buyer)
    const timing = resolveTiming(facts, intent, null, null)

    // The start date is a delivery fact. With no dated post, activity is unknown.
    expect(timing.activityRecency).not.toBe('FRESH')
    expect(facts.explicitDates.activityDate).toBeNull()
    expect(facts.explicitDates.buyerStartDate).toBe('April 2027')
  })

  it('separates the start date from the activity date', () => {
    const dates = extractExplicitDates('Project begins April 2027.')
    expect(dates.buyerStartDate).toBe('April 2027')
    expect(dates.activityDate).toBeNull()
  })

  it('keeps fit and confidence independent of buyer intent', () => {
    const facts = readSourceFacts(MICHAEL)
    const intent = resolveVerifiedBuyerIntent(facts.buyer)

    // HIGH intent with a deliberately weak everything-else still resolves: the
    // dimensions are orthogonal, so a strong request cannot lift a weak fit.
    const decision = scoreSourceForTest(MICHAEL, {
      fit: 'POOR',
      access: 'NONE',
      timing: 'UNKNOWN',
      buyerRequestProbability: 0.2,
    })

    expect(intent.buyerIntentLevel).toBe('HIGH')
    // The fit dimension itself stays weak: a strong request cannot lift it.
    const fit = decision.dimensions.find((d) => d.key === 'fit')
    expect(fit?.raw).toBeLessThan(0.5)
    expect(decision.qualification).not.toBe('STRONG')
  })

  it('does not emit the UNKNOWN-intent warning for a HIGH verified request', () => {
    const facts = readSourceFacts(MICHAEL)
    // A model that scored the request low is the exact EMMA/MICHAEL case.
    const intent = resolveVerifiedBuyerIntent(facts.buyer, { modelBuyerProbability: 0.1 })
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
    expect(intent.contradictions.length).toBeGreaterThan(0)

    const decision = scoreSourceForTest(MICHAEL, {
      fit: 'MEDIUM',
      access: 'CONNECTION',
      timing: 'CURRENT',
      buyerRequestProbability: 0.1,
    })

    expect(decision.watchOut.join(' ')).not.toContain('intent treated as UNKNOWN')
    expect(decision.reasons.join(' ')).toContain('source-verified request is credited')
  })
})
