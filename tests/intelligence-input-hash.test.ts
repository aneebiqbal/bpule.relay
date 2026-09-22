import { describe, expect, it } from 'vitest'
import { buildIntelligenceInputHash, normalizeForHash, INTELLIGENCE_PIPELINE_VERSION } from '@/lib/intelligence-v2/input-hash'
import { SCORE_VERSION } from '@/lib/intelligence-v2/scoring-engine'

describe('normalizeForHash — conservative whitespace-only normalization', () => {
  it('collapses leading/trailing whitespace and horizontal whitespace runs', () => {
    expect(normalizeForHash('  Hello   world  ')).toBe('Hello world')
  })

  it('collapses runs of blank lines to a single blank line', () => {
    expect(normalizeForHash('A\n\n\n\n\nB')).toBe('A\n\nB')
  })

  it('normalizes CRLF and CR line endings to LF', () => {
    expect(normalizeForHash('A\r\nB\rC')).toBe('A\nB\nC')
  })

  it('trims each line individually', () => {
    expect(normalizeForHash('  Line one  \n  Line two  ')).toBe('Line one\nLine two')
  })

  it('does NOT change case, punctuation, or word order (not semantic canonicalization)', () => {
    expect(normalizeForHash('Hiring Rails Engineers')).toBe('Hiring Rails Engineers')
    expect(normalizeForHash('HIRING RAILS ENGINEERS')).not.toBe(normalizeForHash('Hiring Rails Engineers'))
  })
})

describe('buildIntelligenceInputHash — determinism and reuse boundary', () => {
  it('is deterministic: identical input produces identical hash across many calls', () => {
    const text = 'Senior Engineer at Acme Corp, hiring for our platform team.'
    const hashes = new Set(Array.from({ length: 50 }, () => buildIntelligenceInputHash({ rawText: text })))
    expect(hashes.size).toBe(1)
  })

  it('treats cosmetic whitespace variance as the SAME input (metamorphic stability)', () => {
    const a = buildIntelligenceInputHash({ rawText: 'Hiring Rails Engineers\n\nApply now.' })
    const b = buildIntelligenceInputHash({ rawText: '  Hiring Rails Engineers  \n\n\n\nApply now.  ' })
    expect(a).toBe(b)
  })

  it('treats a meaningful content change as a DIFFERENT input', () => {
    const a = buildIntelligenceInputHash({ rawText: 'Remote worldwide, no restrictions.' })
    const b = buildIntelligenceInputHash({ rawText: 'US residents only.' })
    expect(a).not.toBe(b)
  })

  it('treats different pipeline versions as different inputs even for identical text', () => {
    const text = 'Founding Engineer, remote, worldwide.'
    const v1 = buildIntelligenceInputHash({ rawText: text, pipelineVersion: 'intelligence_pipeline_v1' })
    const v2 = buildIntelligenceInputHash({ rawText: text, pipelineVersion: 'intelligence_pipeline_v2' })
    expect(v1).not.toBe(v2)
  })

  it('treats different score versions as different inputs even for identical text', () => {
    const text = 'Founding Engineer, remote, worldwide.'
    const v1 = buildIntelligenceInputHash({ rawText: text, scoreVersion: 'relay_qualification_v1' })
    const v2 = buildIntelligenceInputHash({ rawText: text, scoreVersion: 'relay_qualification_v2' })
    expect(v1).not.toBe(v2)
  })

  it('defaults to the current pipeline and score version constants', () => {
    const text = 'Founding Engineer, remote, worldwide.'
    const withDefaults = buildIntelligenceInputHash({ rawText: text })
    const withExplicit = buildIntelligenceInputHash({
      rawText: text,
      pipelineVersion: INTELLIGENCE_PIPELINE_VERSION,
      scoreVersion: SCORE_VERSION,
    })
    expect(withDefaults).toBe(withExplicit)
  })

  it('does not collide between a short raw text and a version-field-like suffix (preimage field separation)', () => {
    // Regression guard for a naive `text + version` string concatenation,
    // which could theoretically collide two different (text, version) pairs
    // that concatenate to the same string.
    const a = buildIntelligenceInputHash({ rawText: 'x', pipelineVersion: 'intelligence_pipeline_v1' })
    const b = buildIntelligenceInputHash({ rawText: 'xintelligence_pipeline_v1', pipelineVersion: '' })
    expect(a).not.toBe(b)
  })

  it('produces a 64-char lowercase hex sha256 digest', () => {
    const hash = buildIntelligenceInputHash({ rawText: 'anything' })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('empty string input still produces a stable, valid hash (no crash on edge input)', () => {
    expect(() => buildIntelligenceInputHash({ rawText: '' })).not.toThrow()
    const a = buildIntelligenceInputHash({ rawText: '' })
    const b = buildIntelligenceInputHash({ rawText: '   \n\n  ' })
    expect(a).toBe(b) // both normalize to empty string
  })
})
