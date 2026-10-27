/**
 * Contract violation telemetry (Phase 36).
 *
 * Each forbidden state is recorded, never silently corrected. These cases pin
 * the emitters to the exact kind and contract so a future change cannot report
 * the wrong thing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  recordAnalysisScoreDrift,
  recordCandidateRecruiterConflict,
  recordDuplicateOpeningMessage,
} from '@/lib/relay/contract-violations'
import { logClientViolation } from '@/lib/relay/violation-kinds'
import { findDuplicateOpeningTurns } from '@/lib/conversation/canonical-message'

function lastViolation() {
  const call = vi.mocked(console.warn).mock.calls.at(-1)?.[0] as string
  return call
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('contract violation telemetry', () => {
  it('records an analysis/save score drift against Contract 10', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordAnalysisScoreDrift({ leadId: 'lead_1', reviewedScore: 18, persistedScore: 42, surface: 'prospect_save' })

    const out = lastViolation()
    expect(out).toContain('kind=ANALYSIS_SCORE_DRIFT')
    expect(out).toContain('contract=10')
    expect(out).toContain('lead=lead_1')
    expect(out).toContain('reviewed 18 but persisted 42')
  })

  it('records a duplicate opening message against Contract 11', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordDuplicateOpeningMessage('lead_1')

    const out = lastViolation()
    expect(out).toContain('kind=DUPLICATE_OPENING_MESSAGE')
    expect(out).toContain('contract=11')
    expect(out).toContain('surface=conversation')
  })

  it('records an unsupported auth capability against Contract 12', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    logClientViolation(
      'UNSUPPORTED_AUTH_CAPABILITY',
      'a Google sign-in was attempted on a deployment that cannot execute it',
      ['google'],
      'auth',
    )

    const out = lastViolation()
    expect(out).toContain('kind=UNSUPPORTED_AUTH_CAPABILITY')
    expect(out).toContain('surface=auth')
    expect(out).toContain('fields=google')
  })

  it('records a RAW-state score against Contract 9', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    logClientViolation('RAW_STATE_SHOWS_SCORE', 'a score of 7 was shown while the source was still RAW', ['analysisState'], 'upwork_new')

    const out = lastViolation()
    expect(out).toContain('kind=RAW_STATE_SHOWS_SCORE')
    expect(out).toContain('surface=upwork_new')
  })

  it('records a candidate/recruiter conflict against Contract 13', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordCandidateRecruiterConflict('lead_9')

    const out = lastViolation()
    expect(out).toContain('kind=CANDIDATE_WITH_RECRUITER_FLAG')
    expect(out).toContain('contract=13')
    expect(out).toContain('lead=lead_9')
  })
})

describe('duplicate opening turn detection', () => {
  it('finds the same client text rendered twice', () => {
    const duplicates = findDuplicateOpeningTurns([
      { id: 'inbound_first:lead_1', role: 'client', text: 'We need an external team to rebuild our booking platform.' },
      { id: 'msg_a', role: 'client', text: 'We need an external team to rebuild our booking platform.' },
      { id: 'msg_b', role: 'me', text: 'We need an external team to rebuild our booking platform.' },
    ])

    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].ids).toEqual(['inbound_first:lead_1', 'msg_a'])
  })

  it('does not flag two different messages that merely repeat a word', () => {
    expect(findDuplicateOpeningTurns([
      { id: 'a', role: 'client', text: 'Thanks for the quick reply.' },
      { id: 'b', role: 'client', text: 'Can you send the brief?' },
    ])).toEqual([])
  })

  it('ignores our own replies', () => {
    expect(findDuplicateOpeningTurns([
      { id: 'a', role: 'me', text: 'Same text from both sides.' },
      { id: 'b', role: 'me', text: 'Same text from both sides.' },
    ])).toEqual([])
  })

  it('ignores very short turns', () => {
    expect(findDuplicateOpeningTurns([
      { id: 'a', role: 'client', text: 'Hi' },
      { id: 'b', role: 'client', text: 'Hi' },
    ])).toEqual([])
  })
})
