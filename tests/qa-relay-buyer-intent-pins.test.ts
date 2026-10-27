/**
 * Buyer-intent pins for the historical QA fixtures (Phase 4 follow-up).
 *
 * These are the EXACT sources. The deterministic source reader decides, not the
 * model. A future agent cannot reinterpret a fixture without failing here.
 *
 * ABDULHAKIM is the important one: his source contains an explicit external
 * request AND a budget, so INTENT HIGH is correct. He is not an observe-only
 * builder.
 */
import { describe, expect, it } from 'vitest'
import { readBuyerSourceFacts, resolveBuyerIntentFromSource } from '@/lib/intelligence-v3/buyer-intent'

const ABDULHAKIM = `Abdulhakim Sheik
Founder at Tayo360
Tayo360 is a logistics platform for West African freight.
We are building a freight marketplace and fleet management tool.
We are looking for an external engineering team to help build our mobile apps.
Budget approved: $120,000.`

const NADIA = `Nadia Rahman
CTO at Meridian Logistics
Meridian runs a fleet of 400 vehicles.
We need an external software team to rebuild our dispatch platform in React and Node.
Budget approved: $90,000. Start within 4 weeks.`

const HANNAH = `Hannah Cole
VP Operations at Northwind Retail
Northwind operates 60 stores.
We are looking for an external agency to build a new inventory system.
Budget approved: $75,000.`

const EMMA = `Emma Lindqvist
Head of Digital at Fjord Bank
Fjord Bank is modernizing its customer portal.
We want to engage an external partner to rebuild our portal.
Budget approved: €85,000.`

const DANIEL = `Daniel Protopopov
CEO at Pipeform
Pipeform is a recruiting platform for technical talent.
We help companies hire engineers.
Previously built a billing product at Northgate.
Request services at pipeform.example.`

const JURICA = `Jurica Novak
Freelance Consultant
Independent consultant advising startups on go-to-market.
We help early-stage companies with positioning and pricing.
Open to collaborations.`

describe('buyer-intent pins', () => {
  it('ABDULHAKIM: an explicit external request with a budget is a verified BUYER', () => {
    const facts = readBuyerSourceFacts(ABDULHAKIM)
    expect(facts.externalServiceRequest?.line).toMatch(/looking for an external engineering team/i)
    expect(facts.statedBudget?.amount).toBe('$120,000')
    const r = resolveBuyerIntentFromSource(ABDULHAKIM)
    expect(r.verifiedBuyerRequest).toBe(true)
    expect(r.buyerIntentLevel).toBe('HIGH')
    expect(r.verifiedBudget).toBe(true)
    expect(r.relationshipRole).toBe('BUYER')
  })

  it('ABDULHAKIM: a low model score cannot erase the verified request', () => {
    const r = resolveBuyerIntentFromSource(ABDULHAKIM, { modelBuyerProbability: 0.05 })
    expect(r.buyerIntentLevel).toBe('HIGH')
    expect(r.verifiedBuyerRequest).toBe(true)
  })

  it('NADIA: explicit request + budget is HIGH / BUYER', () => {
    const r = resolveBuyerIntentFromSource(NADIA)
    expect(r.verifiedBuyerRequest).toBe(true)
    expect(r.buyerIntentLevel).toBe('HIGH')
    expect(r.verifiedBudget).toBe(true)
  })

  it('HANNAH: "looking for an external agency" is a verified request', () => {
    const r = resolveBuyerIntentFromSource(HANNAH)
    expect(r.verifiedBuyerRequest).toBe(true)
    expect(r.buyerIntentLevel).toBe('HIGH')
  })

  it('EMMA: "engage an external partner" is a verified request', () => {
    const r = resolveBuyerIntentFromSource(EMMA)
    expect(r.verifiedBuyerRequest).toBe(true)
    expect(r.buyerIntentLevel).toBe('HIGH')
  })

  it('DANIEL: seller grammar is not a buyer request', () => {
    const r = resolveBuyerIntentFromSource(DANIEL)
    expect(r.verifiedBuyerRequest).toBe(false)
    expect(r.buyerIntentLevel).toBe('UNKNOWN')
  })

  it('JURICA: a services consultant with no request is not a buyer', () => {
    const r = resolveBuyerIntentFromSource(JURICA)
    expect(r.verifiedBuyerRequest).toBe(false)
    expect(r.buyerIntentLevel).toBe('UNKNOWN')
  })
})
