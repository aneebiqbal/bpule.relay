/**
 * BUG-012 — SKIP draft state.
 *
 * A SKIP lead must never generate outreach, and the refusal must be visible:
 * a silent empty result reads as a broken generator, not a policy decision.
 */

import { describe, expect, it } from 'vitest'
import {
  resolveDraftGenerationState,
  canGenerateDraft,
  draftStateMessage,
  SKIP_POLICY_MESSAGE,
} from '@/lib/relay/draft-generation-state'

describe('BUG-012 draft generation state', () => {
  it('resolves NOT_REQUESTED when nothing was asked for', () => {
    expect(resolveDraftGenerationState({
      verdict: 'send', generating: false, draftText: '', needsRescoring: false, failed: false,
    })).toBe('NOT_REQUESTED')
  })

  it('resolves GENERATING while a draft is streaming', () => {
    expect(resolveDraftGenerationState({
      verdict: 'send', generating: true, draftText: '', needsRescoring: false, failed: false,
    })).toBe('GENERATING')
  })

  it('resolves GENERATED when a draft exists', () => {
    expect(resolveDraftGenerationState({
      verdict: 'send', generating: false, draftText: 'Hi —', needsRescoring: false, failed: false,
    })).toBe('GENERATED')
  })

  it('resolves NEEDS_RESCORING when the server could not derive a strategy', () => {
    expect(resolveDraftGenerationState({
      verdict: 'send', generating: false, draftText: '', needsRescoring: true, failed: false,
    })).toBe('NEEDS_RESCORING')
  })

  it('resolves FAILED when generation produced nothing', () => {
    expect(resolveDraftGenerationState({
      verdict: 'send', generating: false, draftText: '', needsRescoring: false, failed: true,
    })).toBe('FAILED')
  })

  it('resolves SKIPPED_BY_POLICY for a skip verdict before any outcome', () => {
    // Policy wins over the outcome: a skip lead is never a generator failure.
    expect(resolveDraftGenerationState({
      verdict: 'skip', generating: true, draftText: '', needsRescoring: false, failed: true,
    })).toBe('SKIPPED_BY_POLICY')
  })

  it('disables Generate for a policy skip only', () => {
    expect(canGenerateDraft('SKIPPED_BY_POLICY')).toBe(false)
    for (const state of ['NOT_REQUESTED', 'GENERATING', 'GENERATED', 'NEEDS_RESCORING', 'FAILED'] as const) {
      expect(canGenerateDraft(state)).toBe(true)
    }
  })

  it('surfaces an explicit message for every non-quiet state', () => {
    expect(draftStateMessage('SKIPPED_BY_POLICY')).toBe(SKIP_POLICY_MESSAGE)
    expect(draftStateMessage('NEEDS_RESCORING')).toContain('needs rescoring')
    expect(draftStateMessage('FAILED')).toContain('failed')
    expect(draftStateMessage('NOT_REQUESTED')).toBeNull()
    expect(draftStateMessage('GENERATING')).toBeNull()
    expect(draftStateMessage('GENERATED')).toBeNull()
  })

  it('never reports a SKIP lead as a failure', () => {
    const state = resolveDraftGenerationState({
      verdict: 'skip', generating: false, draftText: '', needsRescoring: false, failed: true,
    })
    expect(state).toBe('SKIPPED_BY_POLICY')
    expect(draftStateMessage(state)).not.toContain('failed')
  })
})
