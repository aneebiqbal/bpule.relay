/**
 * Canonical external-input normalization boundary (BUG-005 / BUG-006 / BUG-007 /
 * BUG-010 root cause).
 *
 * Every external text surface must pass through `normalizeExternalInput`
 * before any surface-specific extraction. These cases prove the boundary
 * handles the label formats the QA batch found, and that it never invents a
 * field the source does not state.
 */

import { describe, expect, it } from 'vitest'
import {
  normalizeExternalInput,
  normalizeExternalWhitespace,
  countryFromLocation,
} from '@/lib/intelligence-v3/normalize-external-input'

describe('normalizeExternalInput — same-line labels', () => {
  it('strips the label from the value (BUG-005)', () => {
    const out = normalizeExternalInput(
      [
        'Full Name: Emily Carter',
        'Company: QA Northstar Logistics',
        'Job Title: Operations Director',
        'Country: United States',
      ].join('\n'),
    )

    expect(out.structuredFields.name).toBe('Emily Carter')
    expect(out.structuredFields.company).toBe('QA Northstar Logistics')
    expect(out.structuredFields.title).toBe('Operations Director')
    expect(out.structuredFields.jobTitle).toBe('Operations Director')
    expect(out.structuredFields.country).toBe('United States')
  })

  it('never lets a label survive inside a value', () => {
    const out = normalizeExternalInput('Name: Name: Michael Anderson')
    expect(out.structuredFields.name).toBe('Michael Anderson')
    expect(out.structuredFields.name).not.toContain('Name:')
  })

  it('accepts = - | and unicode separators', () => {
    expect(normalizeExternalInput('Name = Ada Lovelace').structuredFields.name).toBe('Ada Lovelace')
    expect(normalizeExternalInput('Company - Northstar Labs').structuredFields.company).toBe('Northstar Labs')
    expect(normalizeExternalInput('Location | Austin, Texas, United States').structuredFields.location).toBe(
      'Austin, Texas, United States',
    )
    expect(normalizeExternalInput('Job Title · Full-Stack Developer').structuredFields.jobTitle).toBe(
      'Full-Stack Developer',
    )
  })

  it('does not split a hyphenated value on its own hyphen', () => {
    expect(normalizeExternalInput('Company: Full-Stack.io').structuredFields.company).toBe('Full-Stack.io')
    expect(normalizeExternalInput('Job Title: Full-Stack Developer for AI SaaS').structuredFields.jobTitle).toBe(
      'Full-Stack Developer for AI SaaS',
    )
  })
})

describe('normalizeExternalInput — next-line labels', () => {
  it('reads a value on the following line', () => {
    const out = normalizeExternalInput(
      ['Full Name:', 'Emily Carter', 'Job Title:', 'Full-Stack Developer for AI SaaS'].join('\n'),
    )
    expect(out.structuredFields.name).toBe('Emily Carter')
    expect(out.structuredFields.jobTitle).toBe('Full-Stack Developer for AI SaaS')
  })

  it('skips blank lines between the label and its value', () => {
    const out = normalizeExternalInput('Company:\n\n\nNorthstar Logistics')
    expect(out.structuredFields.company).toBe('Northstar Logistics')
  })

  it('never returns the label as the value', () => {
    const out = normalizeExternalInput('Job Title:\nFull-Stack Developer for AI-Powered Logistics SaaS')
    expect(out.structuredFields.jobTitle).not.toBe('Job Title:')
    expect(out.structuredFields.jobTitle).not.toMatch(/^Job Title/i)
  })
})

describe('normalizeExternalInput — prose identity (BUG-010)', () => {
  const PROSE = [
    'Hello,',
    "My name is Mazhar khan,",
    "and I'm the Chief Technology Officer",
    'at Bpulse.',
  ].join('\n')

  it('reads name, title and company from multiline prose', () => {
    const out = normalizeExternalInput(PROSE)
    expect(out.structuredFields.name).toBe('Mazhar khan')
    expect(out.structuredFields.title).toBe('Chief Technology Officer')
    expect(out.structuredFields.company).toBe('Bpulse')
  })

  it('accepts a lowercase surname (no uppercase requirement on every token)', () => {
    const out = normalizeExternalInput('My name is Mazhar khan')
    expect(out.structuredFields.name).toBe('Mazhar khan')
  })

  it('accepts particles, apostrophes and hyphenated given names', () => {
    expect(normalizeExternalInput('My name is Lars van der Meer').structuredFields.name).toBe('Lars van der Meer')
    expect(normalizeExternalInput("My name is Maria de la Cruz").structuredFields.name).toBe('Maria de la Cruz')
    expect(normalizeExternalInput("My name is Sean O'Connor").structuredFields.name).toBe("Sean O'Connor")
    expect(normalizeExternalInput('My name is Anna-Lise Berg').structuredFields.name).toBe('Anna-Lise Berg')
  })

  it('does not read a role as a name', () => {
    const out = normalizeExternalInput("I'm the Chief Technology Officer at Bpulse.")
    expect(out.structuredFields.name).toBeNull()
    expect(out.structuredFields.title).toBe('Chief Technology Officer')
  })
})

describe('normalizeExternalInput — location and country (BUG-006)', () => {
  it('splits a city/state/country location into location and country', () => {
    const out = normalizeExternalInput('Location: Austin, Texas, United States')
    expect(out.structuredFields.location).toBe('Austin, Texas, United States')
    expect(out.structuredFields.country).toBe('United States')
  })

  it('derives the country from a prose location', () => {
    const out = normalizeExternalInput('We are based in Berlin, Germany.')
    expect(out.structuredFields.location).toBe('Berlin, Germany')
    expect(out.structuredFields.country).toBe('Germany')
  })

  it('leaves the country null when the location names none', () => {
    const out = normalizeExternalInput('Location: Remote')
    expect(out.structuredFields.location).toBe('Remote')
    expect(out.structuredFields.country).toBeNull()
  })

  it('countryFromLocation reads the last country-like token', () => {
    expect(countryFromLocation('Austin, Texas, United States')).toBe('United States')
    expect(countryFromLocation('London, Ontario, Canada')).toBe('Canada')
    expect(countryFromLocation('Berlin')).toBeNull()
  })
})

describe('normalizeExternalInput — whitespace and encoding', () => {
  it('normalizes CRLF and CR to LF', () => {
    const out = normalizeExternalInput('Full Name: Emily Carter\r\nCompany: Northstar\r\n')
    expect(out.normalizedText).toBe('Full Name: Emily Carter\nCompany: Northstar')
    expect(out.structuredFields.name).toBe('Emily Carter')
    expect(out.structuredFields.company).toBe('Northstar')
  })

  it('collapses blank-line runs but keeps line structure', () => {
    expect(normalizeExternalWhitespace('a\n\n\n\nb')).toBe('a\n\nb')
  })

  it('handles unicode names and labels', () => {
    const out = normalizeExternalInput('Full Name: José Muñoz\nCompany: Müncher Häuser')
    expect(out.structuredFields.name).toBe('José Muñoz')
    expect(out.structuredFields.company).toBe('Müncher Häuser')
  })
})

describe('normalizeExternalInput — malformed and ambiguous input', () => {
  it('leaves a missing field null instead of inventing one', () => {
    const out = normalizeExternalInput('Full Name: Emily Carter')
    expect(out.structuredFields.name).toBe('Emily Carter')
    expect(out.structuredFields.company).toBeNull()
    expect(out.structuredFields.title).toBeNull()
    expect(out.structuredFields.country).toBeNull()
    expect(out.structuredFields.budget).toBeNull()
  })

  it('keeps the first value for a duplicated label', () => {
    const out = normalizeExternalInput('Company: Northstar\nCompany: Other Co')
    expect(out.structuredFields.company).toBe('Northstar')
  })

  it('ignores a malformed label line', () => {
    const out = normalizeExternalInput('::: not a label :::\nName: Emily Carter')
    expect(out.structuredFields.name).toBe('Emily Carter')
  })

  it('treats a lone label with no value as absent', () => {
    const out = normalizeExternalInput('Company:\nFull Name: Emily Carter')
    expect(out.structuredFields.company).toBeNull()
    expect(out.structuredFields.name).toBe('Emily Carter')
  })

  it('keeps a comma inside a company name', () => {
    expect(normalizeExternalInput('Company: Smith, Jones & Partners').structuredFields.company).toBe(
      'Smith, Jones & Partners',
    )
  })

  it('returns empty fields for empty input', () => {
    const out = normalizeExternalInput('')
    expect(out.normalizedText).toBe('')
    expect(out.structuredFields.name).toBeNull()
    expect(out.provenance).toEqual([])
  })

  it('records provenance for every field it fills', () => {
    const out = normalizeExternalInput('Full Name: Emily Carter\nCompany: Northstar')
    expect(out.provenance).toEqual(
      expect.arrayContaining([
        { field: 'name', rule: 'labeled', line: 'Full Name: Emily Carter' },
        { field: 'company', rule: 'labeled', line: 'Company: Northstar' },
      ]),
    )
  })
})
