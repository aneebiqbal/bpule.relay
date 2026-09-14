import { describe, it, expect } from 'vitest'
import { checkBannedPhrases, checkBadHook } from '@/lib/ai/content'
import { AI_TELL_PHRASES } from '@/lib/writing/engine'

describe('Content Pipeline: Banned Phrase Detection', () => {
  it('detects "here\'s the thing"', () => {
    const hits = checkBannedPhrases("Here's the thing about React...")
    expect(hits).toContain("here's the thing")
  })

  it('detects "let that sink in"', () => {
    const hits = checkBannedPhrases('And let that sink in.')
    expect(hits).toContain('let that sink in')
  })

  it('detects thread emoji', () => {
    const hits = checkBannedPhrases('Thread 🧵')
    expect(hits).toContain('thread 🧵')
  })

  it('detects "stop scrolling"', () => {
    const hits = checkBannedPhrases('Stop scrolling and read this.')
    expect(hits).toContain('stop scrolling')
  })

  it('returns empty for clean text', () => {
    const hits = checkBannedPhrases('The deployment looked healthy but production behavior was wrong.')
    expect(hits).toEqual([])
  })

  it('is case insensitive', () => {
    const hits = checkBannedPhrases("HERE'S THE THING about this")
    expect(hits).toContain("here's the thing")
  })
})

describe('Content Pipeline: Bad Hook Detection', () => {
  it('rejects rhetorical question hooks', () => {
    expect(checkBadHook('Have you ever wondered why deployments fail?')).toBe(true)
    expect(checkBadHook('Do you know the secret?')).toBe(true)
    expect(checkBadHook('Is this the future?')).toBe(true)
  })

  it('rejects "unpopular opinion" hooks', () => {
    expect(checkBadHook('Unpopular opinion: TypeScript is overrated.')).toBe(true)
  })

  it('accepts "I think" hooks (not banned at hook level)', () => {
    // "I think" is not a banned hook pattern at the structural level,
    // but it is flagged by the AI tell phrase checker
    expect(checkBadHook('I think React is great.')).toBe(false)
  })

  it('accepts specific statement hooks', () => {
    expect(checkBadHook('The deployment looked healthy.')).toBe(false)
    expect(checkBadHook('One environment value was stale.')).toBe(false)
    expect(checkBadHook('I lost three hours to a config mismatch.')).toBe(false)
  })

  it('accepts observation hooks', () => {
    expect(checkBadHook('The timing of the failure misled the investigation.')).toBe(false)
  })
})

describe('Content Pipeline: AI Tell Detection', () => {
  const AI_TELLS = [
    'delve into',
    'leverage the power',
    'synergy',
    'pain point',
    'moving the needle',
    'in today\'s fast-paced',
  ]

  AI_TELLS.forEach(tell => {
    it(`includes "${tell}" in AI tell list`, () => {
      expect(AI_TELL_PHRASES).toContain(tell)
    })
  })
})
