/**
 * Action Policy V3 — Safety Gate Tests
 *
 * KEY INVARIANT: Decision model can be uncertain. Action policy must remain safe.
 *
 * Tests that the HUMAN_REVIEW safety gate correctly routes uncertain
 * model outputs to human review instead of generating messages.
 */

import { describe, it, expect } from 'vitest'
import { determineAction, type V3ActionInput } from '@/lib/intelligence-v3/action/action-policy'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('V3 Action Policy — Safety Gate', () => {
  describe('HUMAN_REVIEW for uncertain buyer requests', () => {
    it('routes buyer_request=0.62 (uncertain zone, no explicit request) to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.62,
          explicitRequest: false,
        }),
      )
      expect(result.action).toBe('HUMAN_REVIEW')
      expect(result.messageEligible).toBe(false)
      expect(result.needsReview).toBe(true)
      expect(result.reviewReason).toContain('uncertain zone')
    })

    it('routes buyer_request=0.45 (uncertain zone, CONNECTION access) to OBSERVE', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.45,
          explicitRequest: false,
          access: 'CONNECTION',
        }),
      )
      // CONNECTION + low_intent = OBSERVE (safe, no contact)
      expect(result.action).toBe('OBSERVE')
      expect(result.messageEligible).toBe(false)
    })

    it('routes buyer_request=0.45 (uncertain zone, DIRECT access) to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.45,
          explicitRequest: false,
          access: 'DIRECT',
        }),
      )
      // DIRECT + low_intent = CONNECT_WITHOUT_NOTE → HUMAN_REVIEW (uncertain)
      expect(result.action).toBe('HUMAN_REVIEW')
      expect(result.messageEligible).toBe(false)
    })

    it('does NOT route explicit buyer_request=0.62 to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.62,
          explicitRequest: true,
        }),
      )
      // Explicit request in uncertain zone → downgrade one level, not HUMAN_REVIEW
      expect(result.action).not.toBe('HUMAN_REVIEW')
      expect(result.action).not.toBe('SKIP')
    })

    it('does NOT route buyer_request=0.85 (confident) to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.85,
          explicitRequest: true,
        }),
      )
      expect(result.action).not.toBe('HUMAN_REVIEW')
    })

    it('does NOT route buyer_request=0.15 (clear non-buyer) to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.15,
          score: 15,
        }),
      )
      expect(result.action).toBe('SKIP')
      expect(result.needsReview).toBe(false)
    })
  })

  describe('HUMAN_REVIEW for low confidence', () => {
    it('routes low-confidence CONTACT_NOW to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.85,
          explicitRequest: true,
          confidence: 0.3,
        }),
      )
      expect(result.action).toBe('HUMAN_REVIEW')
      expect(result.needsReview).toBe(true)
      expect(result.reviewReason).toContain('Low confidence')
    })

    it('does NOT route high-confidence CONTACT_NOW to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.85,
          explicitRequest: true,
          confidence: 0.9,
        }),
      )
      expect(result.action).not.toBe('HUMAN_REVIEW')
    })
  })

  describe('HUMAN_REVIEW for stale timing', () => {
    it('routes explicit request with stale timing to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.8,
          explicitRequest: true,
          timing: 'STALE',
        }),
      )
      expect(result.action).toBe('HUMAN_REVIEW')
      expect(result.needsReview).toBe(true)
      expect(result.reviewReason).toContain('stale')
    })
  })

  describe('HUMAN_REVIEW for non-buyer relationship + contact', () => {
    it('routes CONTACT_NOW for service_provider to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.8,
          explicitRequest: true,
          relationship: 'SERVICE_PROVIDER',
        }),
      )
      expect(result.action).toBe('HUMAN_REVIEW')
      expect(result.reviewReason).toContain('SERVICE_PROVIDER')
    })

    it('routes CONNECT_WITH_NOTE for UNKNOWN relationship to HUMAN_REVIEW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.8,
          explicitRequest: true,
          relationship: 'UNKNOWN',
        }),
      )
      // UNKNOWN + CONNECTION + high_intent = CONNECT_WITH_NOTE → HUMAN_REVIEW
      expect(result.action).toBe('HUMAN_REVIEW')
    })
  })

  describe('Service provider without buyer → OBSERVE not CONTACT', () => {
    it('routes service provider CONNECT_WITH_NOTE to OBSERVE', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.4,
          relationship: 'SERVICE_PROVIDER',
          explicitRequest: false,
        }),
      )
      expect(result.action).toBe('OBSERVE')
      expect(result.messageEligible).toBe(false)
    })
  })

  describe('Poor fit downgrade', () => {
    it('downgrades CONTACT_NOW with POOR fit to CONNECT_WITH_NOTE', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.85,
          explicitRequest: true,
          fit: 'POOR',
        }),
      )
      // Poor fit → downgrade, not HUMAN_REVIEW (explicit request is clear)
      expect(result.action).toBe('CONNECT_WITH_NOTE')
    })
  })

  describe('Hard disqualifiers', () => {
    it('closed episode always SKIP', () => {
      const result = determineAction(makeInput({ status: 'CLOSED' }))
      expect(result.action).toBe('SKIP')
      expect(result.needsReview).toBe(false)
    })

    it('low score always SKIP', () => {
      const result = determineAction(makeInput({ score: 10 }))
      expect(result.action).toBe('SKIP')
      expect(result.needsReview).toBe(false)
    })
  })

  describe('Message eligibility safety', () => {
    it('HUMAN_REVIEW never has messageEligible=true', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.55,
          explicitRequest: false,
          messageEligible: 0.8,
        }),
      )
      expect(result.action).toBe('HUMAN_REVIEW')
      expect(result.messageEligible).toBe(false)
    })

    it('uncertain buyer zone never has messageEligible=true', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.5,
          explicitRequest: false,
          score: 60,
        }),
      )
      expect(result.messageEligible).toBe(false)
    })
  })

  describe('Clear signals pass through', () => {
    it('strong explicit buyer + direct access → CONTACT_NOW', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.9,
          explicitRequest: true,
          access: 'DIRECT',
          fit: 'EXCELLENT',
          confidence: 0.9,
          evidenceQuality: 0.8,
        }),
      )
      expect(result.action).toBe('CONTACT_NOW')
      expect(result.messageEligible).toBe(true)
    })

    it('clear non-buyer → SKIP', () => {
      const result = determineAction(
        makeInput({
          buyerRequestProbability: 0.05,
          score: 5,
          relationship: 'SERVICE_PROVIDER',
        }),
      )
      expect(result.action).toBe('SKIP')
    })
  })
})
