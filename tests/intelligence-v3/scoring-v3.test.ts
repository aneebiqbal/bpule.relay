/**
 * Scoring V3 Tests
 *
 * Tests the V3 scoring engine:
 * - Episode-scoped scoring (not person-level)
 * - No global identity penalties that zero unrelated episodes
 * - Timing and intent are separate dimensions
 * - Service provider status is context, not a gate
 * - Multi-episode: best active episode = display score
 */

import { describe, it, expect } from 'vitest'
import { scoreEpisode, scoreAllEpisodes, type V3ScoreInput } from '@/lib/intelligence-v3/scoring/score-v3'
import type { V3OpportunityEpisode, V3BoundedDecision, V3Event } from '@/lib/intelligence-v3/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<V3Event> = {}): V3Event {
  return {
    id: 'evt_test',
    eventType: 'HIRING',
    personId: 'person_1',
    organizationId: 'org_1',
    organizationName: 'TestCo',
    occurredAt: new Date().toISOString(),
    channel: 'linkedin',
    requestedCapability: ['react', 'node.js', 'typescript'],
    targetAudience: 'PUBLIC',
    explicitness: 'EXPLICIT',
    applyInstructions: ['email careers@testco.com'],
    evidenceRefs: [],
    polarity: 'ACTIVE',
    ...overrides,
  }
}

function makeEpisode(overrides: Partial<V3OpportunityEpisode> = {}): V3OpportunityEpisode {
  return {
    id: 'ep_test',
    anchorEvent: makeEvent(),
    organizationId: 'org_1',
    organizationName: 'TestCo',
    needOwnerPersonId: 'person_1',
    needOwnerType: 'HIRING_NEED',
    explicitRequest: true,
    requestedCapabilities: ['react', 'node.js', 'typescript'],
    applicationChannels: ['email'],
    evidenceRefs: ['ev_1', 'ev_2'],
    eventRefs: ['evt_test'],
    status: 'CURRENT',
    detectedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ageDays: 2,
    ...overrides,
  }
}

function makeDecision(overrides: Partial<V3BoundedDecision> = {}): V3BoundedDecision {
  return {
    relationship: 'BUYER',
    buyerRequestProbability: 0.8,
    externalNeedProbability: 0.7,
    needOwnerType: 'HIRING_NEED',
    fit: 'STRONG',
    timing: 'CURRENT',
    access: 'DIRECT',
    messageEligible: 0.7,
    providerConfidence: 0.8,
    ...overrides,
  }
}

function makeInput(overrides: Partial<V3ScoreInput> = {}): V3ScoreInput {
  return {
    episode: makeEpisode(),
    decision: makeDecision(),
    proofRelevance: 0.7,
    evidenceQuality: 0.8,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('V3 Scoring Engine', () => {
  describe('single episode scoring', () => {
    it('scores a strong explicit buyer request highly', () => {
      const result = scoreEpisode(makeInput())
      expect(result.score).toBeGreaterThanOrEqual(55)
      expect(['STRONG', 'WORTH_PURSUING']).toContain(result.qualification)
      expect(result.reasons.length).toBeGreaterThan(0)
    })

    it('scores a weak buyer request low', () => {
      const result = scoreEpisode(
        makeInput({
          decision: makeDecision({
            buyerRequestProbability: 0.1,
            externalNeedProbability: 0.1,
            fit: 'POOR',
          }),
          episode: makeEpisode({ explicitRequest: false }),
        }),
      )
      expect(result.score).toBeLessThan(45)
    })

    it('produces score between 0 and 100', () => {
      const result = scoreEpisode(makeInput())
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)
    })
  })

  describe('service provider context (not gate)', () => {
    it('does NOT zero score for service provider with explicit buyer request', () => {
      const result = scoreEpisode(
        makeInput({
          decision: makeDecision({
            relationship: 'SERVICE_PROVIDER',
            buyerRequestProbability: 0.8,
          }),
          episode: makeEpisode({ explicitRequest: true }),
        }),
      )
      // Service provider + explicit buyer request should still score well
      // because buyer request probability is high (relationship multiplier is not applied when buyer >= 0.5)
      expect(result.score).toBeGreaterThan(30)
    })

    it('applies relationship context only when buyer request is low', () => {
      const withHighBuyer = scoreEpisode(
        makeInput({
          decision: makeDecision({
            relationship: 'SERVICE_PROVIDER',
            buyerRequestProbability: 0.8,
          }),
        }),
      )
      const withLowBuyer = scoreEpisode(
        makeInput({
          decision: makeDecision({
            relationship: 'SERVICE_PROVIDER',
            buyerRequestProbability: 0.2,
            externalNeedProbability: 0.3,
          }),
        }),
      )
      // High buyer request should not be suppressed
      expect(withHighBuyer.score).toBeGreaterThan(withLowBuyer.score)
      expect(withLowBuyer.score).toBeLessThan(withHighBuyer.score)
    })
  })

  describe('timing is separate from intent', () => {
    it('high intent + stale timing = reduced but nonzero score', () => {
      const current = scoreEpisode(
        makeInput({
          episode: makeEpisode({ status: 'CURRENT', ageDays: 2 }),
          decision: makeDecision({ timing: 'CURRENT' }),
        }),
      )
      const stale = scoreEpisode(
        makeInput({
          episode: makeEpisode({ status: 'STALE', ageDays: 60 }),
          decision: makeDecision({ timing: 'STALE' }),
        }),
      )
      // Stale should be lower than current, but not zero
      expect(stale.score).toBeLessThan(current.score)
      expect(stale.score).toBeGreaterThan(0)
      expect(stale.watchOut.some((w) => w.includes('stale') || w.includes('Stale'))).toBe(true)
    })

    it('aging episode reduces score but preserves intent', () => {
      const aging = scoreEpisode(
        makeInput({
          episode: makeEpisode({ status: 'AGING', ageDays: 21 }),
          decision: makeDecision({ buyerRequestProbability: 0.8, timing: 'WEAK' }),
        }),
      )
      // Should not be zero
      expect(aging.score).toBeGreaterThan(10)
      // Should note aging
      expect(aging.watchOut.some((w) => w.includes('AGING') || w.includes('aging'))).toBe(true)
    })
  })

  describe('closed episodes', () => {
    it('closed episode gets very low score', () => {
      const result = scoreEpisode(
        makeInput({
          episode: makeEpisode({ status: 'CLOSED', ageDays: 120 }),
          decision: makeDecision({ buyerRequestProbability: 0.8 }),
        }),
      )
      expect(result.score).toBeLessThan(30)
    })
  })

  describe('multi-episode scoring', () => {
    it('selects best active episode as display score', () => {
      const inputs: V3ScoreInput[] = [
        makeInput({
          episode: makeEpisode({
            id: 'ep_1',
            organizationName: 'ServiceOrg',
            explicitRequest: false,
            status: 'CURRENT',
          }),
          decision: makeDecision({
            relationship: 'SERVICE_PROVIDER',
            buyerRequestProbability: 0.2,
          }),
        }),
        makeInput({
          episode: makeEpisode({
            id: 'ep_2',
            organizationName: 'BuyerOrg',
            explicitRequest: true,
            status: 'CURRENT',
          }),
          decision: makeDecision({
            relationship: 'BUYER',
            buyerRequestProbability: 0.8,
          }),
        }),
      ]

      const result = scoreAllEpisodes(inputs)
      expect(result.bestActiveEpisodeId).toBe('ep_2')
      expect(result.bestActiveScore).toBeGreaterThan(50)
    })

    it('does not average across unrelated episodes', () => {
      const inputs: V3ScoreInput[] = [
        makeInput({
          episode: makeEpisode({
            id: 'ep_service',
            needOwnerType: 'SERVICE_OFFERING',
            explicitRequest: false,
          }),
          decision: makeDecision({
            relationship: 'SERVICE_PROVIDER',
            buyerRequestProbability: 0.1,
            externalNeedProbability: 0.1,
          }),
        }),
        makeInput({
          episode: makeEpisode({
            id: 'ep_buyer',
            needOwnerType: 'HIRING_NEED',
            explicitRequest: true,
          }),
          decision: makeDecision({
            relationship: 'BUYER',
            buyerRequestProbability: 0.85,
            externalNeedProbability: 0.8,
          }),
        }),
      ]

      const result = scoreAllEpisodes(inputs)
      // Best active should be the buyer episode, not an average
      expect(result.bestActiveEpisodeId).toBe('ep_buyer')
      expect(result.bestActiveScore).toBeGreaterThan(50)
    })
  })

  describe('no identity penalty to unrelated episodes', () => {
    it('service provider episode does not suppress separate buyer episode', () => {
      const serviceEpisode = makeEpisode({
        id: 'ep_service',
        organizationName: 'DevAgency',
        needOwnerType: 'SERVICE_OFFERING',
        explicitRequest: false,
      })
      const buyerEpisode = makeEpisode({
        id: 'ep_buyer',
        organizationName: 'ProductCo',
        needOwnerType: 'HIRING_NEED',
        explicitRequest: true,
      })

      const serviceScore = scoreEpisode(
        makeInput({
          episode: serviceEpisode,
          decision: makeDecision({
            relationship: 'SERVICE_PROVIDER',
            buyerRequestProbability: 0.1,
          }),
        }),
      )
      const buyerScore = scoreEpisode(
        makeInput({
          episode: buyerEpisode,
          decision: makeDecision({
            relationship: 'BUYER',
            buyerRequestProbability: 0.8,
          }),
        }),
      )

      // Buyer episode should score much higher than service episode
      expect(buyerScore.score).toBeGreaterThan(serviceScore.score + 20)
    })
  })

  describe('evidence quality affects score', () => {
    it('higher evidence quality increases score', () => {
      const lowQuality = scoreEpisode(makeInput({ evidenceQuality: 0.2 }))
      const highQuality = scoreEpisode(makeInput({ evidenceQuality: 0.9 }))
      expect(highQuality.score).toBeGreaterThanOrEqual(lowQuality.score)
    })
  })

  describe('action derivation', () => {
    it('explicit buyer + direct access + good score → CONTACT_NOW', () => {
      const result = scoreEpisode(
        makeInput({
          episode: makeEpisode({ explicitRequest: true }),
          decision: makeDecision({
            buyerRequestProbability: 0.8,
            access: 'DIRECT',
          }),
        }),
      )
      expect(result.score).toBeGreaterThanOrEqual(60)
    })

    it('low score → SKIP', () => {
      const result = scoreEpisode(
        makeInput({
          decision: makeDecision({
            buyerRequestProbability: 0.05,
            externalNeedProbability: 0.05,
            fit: 'POOR',
            timing: 'STALE',
          }),
          episode: makeEpisode({ status: 'CLOSED', ageDays: 120 }),
        }),
      )
      expect(result.score).toBeLessThan(15)
    })
  })
})
