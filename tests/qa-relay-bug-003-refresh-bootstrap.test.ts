/**
 * BUG-003 — lead refresh / deep-link idempotency (CREATE_LEAD_REFRESH_DURING_BOOTSTRAP).
 *
 * The one-shot `?next=generate-…` intent must be consumed before any async
 * work, so a refresh during generation cannot fire a second draft, and
 * generation must not start until the lead and its canonical decision exist.
 */

import { describe, expect, it } from 'vitest'
import {
  transitionLeadBootstrap,
  canStartBootstrap,
  bootstrapPreconditionsMet,
  stripOneShotIntent,
} from '@/lib/relay/lead-bootstrap-state'

describe('BUG-003 lead bootstrap state machine', () => {
  it('walks NOT_REQUESTED → PENDING → RUNNING → DONE', () => {
    let state = 'NOT_REQUESTED' as const
    state = transitionLeadBootstrap(state, 'REQUEST')
    expect(state).toBe('PENDING')
    state = transitionLeadBootstrap(state, 'START')
    expect(state).toBe('RUNNING')
    state = transitionLeadBootstrap(state, 'SUCCEED')
    expect(state).toBe('DONE')
  })

  it('fails closed from PENDING and RUNNING', () => {
    expect(transitionLeadBootstrap('PENDING', 'FAIL')).toBe('FAILED')
    expect(transitionLeadBootstrap('RUNNING', 'FAIL')).toBe('FAILED')
  })

  it('DONE and FAILED are terminal until a new REQUEST', () => {
    expect(transitionLeadBootstrap('DONE', 'START')).toBe('DONE')
    expect(transitionLeadBootstrap('FAILED', 'START')).toBe('FAILED')
    expect(transitionLeadBootstrap('FAILED', 'REQUEST')).toBe('PENDING')
  })

  it('only PENDING may start generation', () => {
    expect(canStartBootstrap('PENDING')).toBe(true)
    for (const state of ['NOT_REQUESTED', 'RUNNING', 'DONE', 'FAILED'] as const) {
      expect(canStartBootstrap(state)).toBe(false)
    }
  })
})

describe('BUG-003 one-shot intent consumption', () => {
  it('removes the intent from the URL', () => {
    expect(stripOneShotIntent('https://relay.test/leads/abc?next=generate-connection'))
      .toBe('https://relay.test/leads/abc')
  })

  it('returns null when there is no intent to consume', () => {
    expect(stripOneShotIntent('https://relay.test/leads/abc')).toBeNull()
  })

  it('preserves unrelated params', () => {
    expect(stripOneShotIntent('https://relay.test/leads/abc?tab=conversation&next=generate-reply'))
      .toBe('https://relay.test/leads/abc?tab=conversation')
  })
})

describe('BUG-003 bootstrap preconditions', () => {
  it('requires the lead, a valid id and the canonical decision', () => {
    expect(bootstrapPreconditionsMet({
      leadLoaded: true, leadIdValid: true, decisionAvailable: true,
    })).toBe(true)
  })

  it('refuses when the decision is not available yet', () => {
    expect(bootstrapPreconditionsMet({
      leadLoaded: true, leadIdValid: true, decisionAvailable: false,
    })).toBe(false)
  })

  it('refuses when the lead id is not valid', () => {
    expect(bootstrapPreconditionsMet({
      leadLoaded: true, leadIdValid: false, decisionAvailable: true,
    })).toBe(false)
  })

  it('refuses when the lead has not loaded', () => {
    expect(bootstrapPreconditionsMet({
      leadLoaded: false, leadIdValid: true, decisionAvailable: true,
    })).toBe(false)
  })
})
