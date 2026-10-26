/**
 * Explainability regression set (Phase 17).
 *
 * Extraction can be correct while evidence selection is bad: a dimension shows a
 * plausible-looking reason that does not support its conclusion. These fixtures
 * pin evidence selection on the Access dimension, which reads only SourceFacts.
 *
 * Goal: an explanation must be truthful AND useful — the evidence under a
 * dimension must be about that dimension.
 */
import { describe, expect, it } from 'vitest'
import { resolveAccess } from '@/lib/intelligence-v3/dimensions'
import type { AccessFacts, SourceFacts } from '@/lib/intelligence-v3/source-facts-model'

function facts(access: Partial<AccessFacts>): SourceFacts {
  const base: AccessFacts = {
    connectionDegree: 'unknown',
    canMessage: false,
    canConnect: false,
    mutualConnections: 0,
    directContactAvailable: false,
    contactLine: null,
    profileUrl: null,
    hasEmail: false,
  }
  return { access: { ...base, ...access } } as unknown as SourceFacts
}

describe('Phase 17 — Access evidence selection', () => {
  it('a 1st-degree connection cites the connection, not an unrelated quote', () => {
    const result = resolveAccess(facts({ connectionDegree: '1st' }), null)
    expect(result.level).toBe('DIRECT')
    expect(result.evidence.length).toBeGreaterThan(0)
    expect(result.evidence.every((e) => /connection/i.test(e.text))).toBe(true)
    // The evidence must be a signal, not a fabricated verbatim quote.
    expect(result.evidence.some((e) => e.kind === 'quote')).toBe(false)
  })

  it('a stated contact route is quoted verbatim, not paraphrased', () => {
    const result = resolveAccess(
      facts({ directContactAvailable: true, contactLine: 'Email me at sam@acme.com' }),
      null,
    )
    expect(result.level).toBe('DIRECT')
    expect(result.evidence).toContainEqual({ text: 'Email me at sam@acme.com', kind: 'quote' })
  })

  it('a model claim of DIRECT with no route in the source is overridden and explained', () => {
    const result = resolveAccess(facts({}), 'DIRECT')
    expect(result.level).toBe('CONNECTION')
    expect(result.overrode).toBe(true)
    expect(result.reasons.join(' ')).toMatch(/treated as CONNECTION/i)
    // The evidence must explain the override, not just assert DIRECT.
    expect(result.evidence.some((e) => e.kind === 'inference')).toBe(true)
  })

  it('a 3rd-degree connection is INDIRECT and says so', () => {
    const result = resolveAccess(facts({ connectionDegree: '3rd' }), null)
    expect(result.level).toBe('INDIRECT')
    expect(result.reasons.join(' ')).toMatch(/cold connection request/i)
  })

  it('no access facts and no model leaves INDIRECT, never an invented route', () => {
    const result = resolveAccess(facts({}), null)
    expect(result.level).toBe('INDIRECT')
    expect(result.reasons.join(' ')).toMatch(/no access facts/i)
  })
})
