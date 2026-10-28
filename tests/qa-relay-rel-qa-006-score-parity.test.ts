/**
 * REL-QA-006 — score presentation parity (production QA, 26 Oct 2026).
 *
 * Reported: the same lead's score read differently on Today and on My Numbers.
 *
 * Root cause: My Numbers (accountability) rendered the raw legacy `leads.score`
 * (a 0-12 rubric number) as "score N", while every other surface renders the
 * canonical display value ("8/10") from `getLeadDisplayScore`.
 *
 * Fix: My Numbers reads the same canonical display policy. A legacy-only lead
 * shows "/12" so the scale is always named; a raw number is never shown alone.
 */
import { describe, expect, it } from 'vitest'
import { leadScoreText } from '@/lib/accountability/metrics'

describe('REL-QA-006 — score presentation', () => {
  it('a canonical lead shows the /10 display value, not a raw number', () => {
    expect(leadScoreText({ canonicalScore: 80, score: 11 })).toBe('8/10')
  })

  it('canonical wins over the legacy rubric score', () => {
    expect(leadScoreText({ canonicalScore: 60, score: 12 })).toBe('6/10')
  })

  it('a legacy-only lead names its scale (/12) instead of a bare number', () => {
    expect(leadScoreText({ canonicalScore: null, score: 8 })).toBe('8/12')
  })

  it('an unscored lead shows an em dash, never 0', () => {
    expect(leadScoreText({ canonicalScore: null, score: null })).toBe('—')
  })

  it('no input ever renders as a bare integer', () => {
    for (const input of [{ canonicalScore: 92 }, { canonicalScore: 30 }, { score: 7 }, {}]) {
      expect(leadScoreText(input)).toMatch(/\/|—/)
    }
  })
})
