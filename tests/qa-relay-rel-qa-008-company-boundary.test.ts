/**
 * REL-QA-008 — company extraction boundaries (production QA, 26 Oct 2026).
 *
 * Reported: "Meridian Logistics Labs. Our company…" was stored as the company
 * name, sentence fragment included.
 *
 * Root cause: `sanitizeCompanyName` only stripped punctuation at the edges, so
 * a period that marks a sentence boundary inside the value survived and the
 * extractor's bleed into the next sentence was kept.
 *
 * Fix: cut at the sentence boundary. Legitimate names with internal punctuation
 * (domain-style names, abbreviations) are not trimmed.
 */
import { describe, expect, it } from 'vitest'
import { sanitizeCompanyName } from '@/lib/intelligence-v2/extraction-pipeline'

describe('REL-QA-008 — company name sentence boundary', () => {
  it('COMPANY_SENTENCE_FRAGMENT: cuts a trailing sentence fragment', () => {
    expect(sanitizeCompanyName('Meridian Logistics Labs. Our company builds warehouse software.')).toBe('Meridian Logistics Labs')
  })

  it('cuts at "Company, where …"', () => {
    expect(sanitizeCompanyName('Meridian Logistics Labs, where we ship freight software.')).toBe('Meridian Logistics Labs')
  })

  it('cuts at "Company — we …"', () => {
    expect(sanitizeCompanyName('Meridian Logistics Labs — we build warehouse software.')).toBe('Meridian Logistics Labs')
  })

  it('cuts at "Company. We …" (capitalised sentence starter)', () => {
    expect(sanitizeCompanyName('Meridian Logistics Labs. We are hiring a development partner.')).toBe('Meridian Logistics Labs')
  })

  it('does not trim a legitimate name with no boundary', () => {
    expect(sanitizeCompanyName('Meridian Logistics Labs')).toBe('Meridian Logistics Labs')
  })

  it('does not trim a domain-style name (internal period, no space)', () => {
    expect(sanitizeCompanyName('Bio-marker.ai')).toBe('Bio-marker.ai')
  })

  it('does not trim a name whose next word is not a sentence starter', () => {
    // "Labs Building" is a name, not two sentences — no capitalised starter.
    expect(sanitizeCompanyName('Meridian Labs Building')).toBe('Meridian Labs Building')
  })

  it('returns null for a value that is only a fragment', () => {
    expect(sanitizeCompanyName('Our company builds software.')).toBeNull()
  })
})
