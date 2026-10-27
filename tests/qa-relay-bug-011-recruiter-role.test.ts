/**
 * BUG-011 — recruiter role semantics.
 *
 * A recruiter is not a candidate, and a recruiter hiring an employee is not a
 * buyer request for our services. Buyer intent, channel value, referral
 * potential and sender match are separate dimensions: a recruiter can be
 * high-value as a channel while having no buying intent at all.
 */

import { describe, expect, it } from 'vitest'
import { readSourceFacts } from '@/lib/intelligence-v3/source-facts-model'
import { resolveVerifiedBuyerIntent, isBuyerRelationship } from '@/lib/intelligence-v3/buyer-intent'
import { classifyBusinessModel } from '@/lib/intelligence-v2/subject-attribution'

const RECRUITER_HIRING = [
  'Sofia Marchetti',
  'Technical Recruiter at Northstar Talent',
  'We help companies hire React developers. Open to a chat?',
  "We're hiring a Full Stack Engineer for a fintech client. Submit your CV.",
].join('\n')

const RECRUITER_SEEKING_PARTNER = [
  'Sofia Marchetti',
  'Technical Recruiter at Northstar Talent',
  'Company: Northstar Talent',
  'Role: Technical Recruiter',
  'We are looking for an external software development agency to partner with on a retained build.',
  'Budget approved: $50,000.',
].join('\n')

const CANDIDATE = [
  'Daniel Reyes',
  'Senior React Developer',
  'I am open to new contract roles.',
  'Looking for my next position as a front-end lead.',
].join('\n')

const AGENCY_SELLER = [
  'Priya Nair',
  'Founder at Code Graphers',
  'We are a software development agency. We build and deliver projects for our clients.',
  'If you are hiring a development team for your next project, our team has capacity.',
].join('\n')

function intentFor(source: string) {
  const facts = readSourceFacts(source)
  return { facts, intent: resolveVerifiedBuyerIntent(facts.buyer) }
}

describe('BUG-011 recruiter role fixtures', () => {
  it('a recruiter hiring an employee is RECRUITER with UNKNOWN buyer intent', () => {
    const { facts, intent } = intentFor(RECRUITER_HIRING)
    expect(intent.relationshipRole).toBe('RECRUITER')
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.buyerIntentLevel).toBe('UNKNOWN')
    expect(isBuyerRelationship(intent.relationshipRole)).toBe(false)
    // The hiring line is a hiring fact, never a request to buy services.
    expect(facts.currentHiringActivity).not.toBeNull()
  })

  it('a recruiter seeking an external agency partner is credited as a BUYER', () => {
    // The golden fixture buyer-outsourced-team-not-employees settles this:
    // "Recruiter title does not block a real external request." The recruiter
    // FLAG is still recorded, so surfaces know who they are.
    const { facts, intent } = intentFor(RECRUITER_SEEKING_PARTNER)
    expect(facts.buyer.recruiter).toBe(true)
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
    expect(intent.relationshipRole).toBe('BUYER')
  })

  it('a candidate seeking employment is CANDIDATE, never a buyer', () => {
    const { intent } = intentFor(CANDIDATE)
    expect(intent.relationshipRole).toBe('CANDIDATE')
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.buyerIntentLevel).toBe('UNKNOWN')
  })

  it('an agency seller recruiting clients is SELLER', () => {
    const { facts, intent } = intentFor(AGENCY_SELLER)
    expect(intent.relationshipRole).toBe('SELLER')
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(facts.sellerActivity).toBe(true)
  })

  it('a recruiter hiring post is never read as a request to buy a dev agency', () => {
    const { intent } = intentFor(RECRUITER_HIRING)
    const evidence = intent.evidence.map((e) => e.text).join(' ')
    expect(evidence).not.toContain('external software development agency')
    expect(intent.contradictions.join(' ')).not.toContain('verified request')
  })

  it('the business model classifies a recruiter separately from a candidate', () => {
    expect(classifyBusinessModel(RECRUITER_HIRING)).toBe('RECRUITER')
    expect(classifyBusinessModel(CANDIDATE)).not.toBe('RECRUITER')
  })
})
