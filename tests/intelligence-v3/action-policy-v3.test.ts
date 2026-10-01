import { describe, it, expect } from 'vitest'
import { determineAction, type V3ActionInput } from '@/lib/intelligence-v3/action/action-policy'

function makeInput(overrides: Partial<V3ActionInput> = {}): V3ActionInput {
  return {
    score: 50,
    buyerRequestProbability: 0.5,
    externalNeedProbability: 0.5,
    access: 'CONNECTION',
    timing: 'CURRENT',
    relationship: 'BUYER',
    fit: 'MEDIUM',
    messageEligible: 0.5,
    explicitRequest: false,
    status: 'CURRENT',
    confidence: 0.6,
    evidenceQuality: 0.5,
    ...overrides,
  }
}

describe('V3 Action Policy', () => {
  describe('uncertain buyer zone (no explicit request) → HUMAN_REVIEW', () => {
    it('routes buyer_request=0.45 without explicit request to HUMAN_REVIEW', () => {
      const result = determineAction(makeInput({ buyerRequestProbability: 0.45, explicitRequest: false }))
      expect(result.action).toBe('HUMAN_REVIEW')
      expect(result.needsReview).toBe(true)
    })

    it('routes buyer_request=0.55 without explicit request to HUMAN_REVIEW', () => {
      const result = determineAction(makeInput({ buyerRequestProbability: 0.55, explicitRequest: false }))
      expect(result.action).toBe('HUMAN_REVIEW')
    })

    it('does NOT route explicit buyer_request=0.45 to HUMAN_REVIEW', () => {
      const result = determineAction(makeInput({ buyerRequestProbability: 0.45, explicitRequest: true }))
      expect(result.action).not.toBe('HUMAN_REVIEW')
    })
  })

  describe('explicit requests bypass most gates', () => {
    it('allows CONNECT_WITH_NOTE for explicit high-confidence buyer (CONNECTION access)', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.85,
        explicitRequest: true,
        access: 'CONNECTION',
        confidence: 0.9,
      }))
      // CONNECTION + high_intent = CONNECT_WITH_NOTE
      expect(result.action).toBe('CONNECT_WITH_NOTE')
    })

    it('allows CONTACT_NOW for explicit buyer with DIRECT access', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.85,
        explicitRequest: true,
        access: 'DIRECT',
        confidence: 0.9,
      }))
      expect(result.action).toBe('CONTACT_NOW')
    })

    it('allows action for explicit buyer even with low confidence', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.85,
        explicitRequest: true,
        confidence: 0.3,
        access: 'CONNECTION',
      }))
      expect(result.action).not.toBe('HUMAN_REVIEW')
      expect(result.action).not.toBe('SKIP')
    })
  })

  describe('high buyer probability → CONTACT action', () => {
    it('routes buyer_request=0.95 + explicit + CONNECTION → CONNECT_WITH_NOTE', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.95,
        explicitRequest: true,
        access: 'CONNECTION',
      }))
      expect(result.action).toBe('CONNECT_WITH_NOTE')
    })

    it('routes buyer_request=0.95 + explicit + DIRECT → CONTACT_NOW', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.95,
        explicitRequest: true,
        access: 'DIRECT',
      }))
      expect(result.action).toBe('CONTACT_NOW')
    })
  })

  describe('non-buyer relationship + explicit request → allowed', () => {
    it('allows CONNECT_WITH_NOTE for service_provider with explicit request', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.9,
        explicitRequest: true,
        relationship: 'SERVICE_PROVIDER',
      }))
      expect(result.action).toBe('CONNECT_WITH_NOTE')
    })

    it('allows CONNECT_WITH_NOTE for UNKNOWN with explicit request', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.8,
        explicitRequest: true,
        relationship: 'UNKNOWN',
      }))
      expect(result.action).toBe('CONNECT_WITH_NOTE')
    })
  })

  describe('low buyer probability → no contact', () => {
    it('routes buyer_request=0.10 → SKIP', () => {
      const result = determineAction(makeInput({ buyerRequestProbability: 0.10, score: 5 }))
      expect(result.action).toBe('SKIP')
    })

    it('routes buyer_request=0.20 → OBSERVE', () => {
      const result = determineAction(makeInput({ buyerRequestProbability: 0.20, score: 30 }))
      expect(result.action).toBe('OBSERVE')
    })
  })

  describe('message eligibility', () => {
    it('explicit buyer request → message eligible', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.8,
        explicitRequest: true,
      }))
      expect(result.messageEligible).toBe(true)
    })

    it('low buyer probability → not message eligible', () => {
      const result = determineAction(makeInput({ buyerRequestProbability: 0.1 }))
      expect(result.messageEligible).toBe(false)
    })

    it('HUMAN_REVIEW → not message eligible', () => {
      const result = determineAction(makeInput({ buyerRequestProbability: 0.45, explicitRequest: false }))
      expect(result.messageEligible).toBe(false)
    })
  })

  describe('hard disqualifiers', () => {
    it('closed episode → SKIP', () => {
      const result = determineAction(makeInput({ status: 'CLOSED' }))
      expect(result.action).toBe('SKIP')
      expect(result.needsReview).toBe(false)
    })

    it('very low score → SKIP', () => {
      const result = determineAction(makeInput({ score: 5 }))
      expect(result.action).toBe('SKIP')
    })
  })

  describe('clear signals pass through', () => {
    it('strong explicit buyer + DIRECT access → CONTACT_NOW', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.95,
        explicitRequest: true,
        access: 'DIRECT',
        fit: 'STRONG',
        confidence: 0.9,
      }))
      expect(result.action).toBe('CONTACT_NOW')
      expect(result.messageEligible).toBe(true)
    })

    it('strong explicit buyer + CONNECTION → CONNECT_WITH_NOTE', () => {
      const result = determineAction(makeInput({
        buyerRequestProbability: 0.95,
        explicitRequest: true,
        access: 'CONNECTION',
        fit: 'STRONG',
        confidence: 0.9,
      }))
      expect(result.action).toBe('CONNECT_WITH_NOTE')
      expect(result.messageEligible).toBe(true)
    })
  })
})
