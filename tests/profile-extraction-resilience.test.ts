import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }))
vi.mock('@/lib/ai/runtime', () => ({ generate: generateMock }))

import { extractForSinglePerson, runExtractionPipeline } from '@/lib/profile-intelligence/pipeline'

const ok = (data: unknown) => Promise.resolve({ data })
function route(handlers: Record<string, () => Promise<unknown>>) {
  generateMock.mockImplementation((opts: { callSite: string }) => {
    const key = opts.callSite.split(':')[1]
    return handlers[key] ? handlers[key]() : ok({})
  })
}

beforeEach(() => {
  generateMock.mockReset()
})

describe('profile extraction budgets', () => {
  it('gives long-document extraction calls enough tokens and time', async () => {
    route({
      extractFacts: () => ok({ fullName: 'Mehak', primarySkills: ['Node.js'] }),
      extractProjects: () => ok({ projects: [] }),
      buildProofs: () => ok({ proofs: [] }),
      extractReviews: () => ok({ reviews: [] }),
    })
    await extractForSinglePerson('Mehak — Node.js engineer', 'org')
    for (const call of generateMock.mock.calls.map((c) => c[0])) {
      expect(call.maxTokens, call.callSite).toBeGreaterThanOrEqual(3072)
      expect(call.timeoutMs, call.callSite).toBeGreaterThanOrEqual(45_000)
    }
  })
})

describe('partial extraction instead of total failure', () => {
  it('keeps facts when project extraction fails, and reports it', async () => {
    route({
      extractFacts: () => ok({ fullName: 'Mehak', primarySkills: ['Node.js'] }),
      extractProjects: () => Promise.reject(new Error('All providers failed: aborted')),
      buildProofs: () => ok({ proofs: [] }),
      extractReviews: () => ok({ reviews: [] }),
    })
    const r = await extractForSinglePerson('Mehak — Node.js engineer', 'org')
    expect(r.facts.fullName).toBe('Mehak')
    expect(r.projects).toEqual([])
    expect(r.warnings.join(' ')).toMatch(/Projects unavailable/)
  })

  it('fails only when nothing at all could be extracted', async () => {
    route({
      extractFacts: () => Promise.reject(new Error('aborted')),
      extractProjects: () => Promise.reject(new Error('aborted')),
    })
    await expect(extractForSinglePerson('text', 'org')).rejects.toThrow(/Extraction failed/)
  })

  it('a quality-gate failure does not discard a good multi-person extraction', async () => {
    route({
      classifyDocument: () => ok({ documentType: 'cv', sourceQuality: 'high', detectedPeople: [
        { name: 'Fizza', confidence: 0.9, sectionStart: 0, sectionEnd: 10, role: null, company: null, aliases: [], clues: [] },
        { name: 'Mehak', confidence: 0.9, sectionStart: 10, sectionEnd: 20, role: null, company: null, aliases: [], clues: [] },
      ] }),
      extractFacts: () => ok({ primarySkills: ['React'] }),
      extractProjects: () => ok({ projects: [] }),
      buildProofs: () => ok({ proofs: [] }),
      extractReviews: () => ok({ reviews: [] }),
      qualityGate: () => Promise.reject(new Error('aborted')),
    })
    const text = 'Fizza ....Mehak .....'
    const r = await runExtractionPipeline({ content: text, pages: [text], pageCount: 1, needsOcr: false, warnings: [] }, text, 'org')
    expect([...r.factsByPerson.keys()].sort()).toEqual(['Fizza', 'Mehak'])
    expect(r.qualityGate.passed).toBe(true)
    expect(r.qualityGate.issues.join(' ')).toMatch(/Quality gate unavailable/)
  })
})
