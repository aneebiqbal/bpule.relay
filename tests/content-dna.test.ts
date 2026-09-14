import { describe, it, expect } from 'vitest'
import {
  buildContentDnaPromptBlock,
  calculateProfileConfidence,
  extractDnaCandidatesFromAnswer,
  buildInitialDnaFromPersona,
} from '@/lib/content/content-dna'
import type { ContentProfile, ContentProfileOpinion } from '@/lib/domain/types'

function makeProfile(overrides: Partial<ContentProfile> = {}): ContentProfile {
  return {
    id: 'profile-1',
    organizationId: 'org-test',
    personaId: 'persona-1',
    role: '',
    seniority: '',
    industries: [],
    audience: '',
    expertise: [],
    technologies: [],
    goals: [],
    topicsCared: [],
    topicsAvoided: [],
    opinions: [],
    projects: [],
    experiences: [],
    writingCharacteristics: {},
    storytellingTendencies: [],
    confidence: 0,
    lastLearnedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Content DNA: prompt block assembly', () => {
  it('returns empty string for null profile', () => {
    expect(buildContentDnaPromptBlock(null)).toBe('')
  })

  it('returns empty string for a profile with no meaningful data', () => {
    const profile = makeProfile()
    expect(buildContentDnaPromptBlock(profile)).toBe('')
  })

  it('includes role and seniority when present', () => {
    const profile = makeProfile({ role: 'Engineer', seniority: 'Senior' })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('Senior Engineer')
  })

  it('includes industries when present', () => {
    const profile = makeProfile({ role: 'Engineer', industries: ['fintech', 'developer tools'] })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('fintech')
    expect(block).toContain('developer tools')
  })

  it('includes audience when present', () => {
    const profile = makeProfile({ audience: 'engineering managers' })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('engineering managers')
  })

  it('includes expertise areas', () => {
    const profile = makeProfile({
      expertise: [
        { area: 'distributed systems', level: 'expert', evidence: 'built 3', updatedAt: '2024-01-01' },
        { area: 'React', level: 'advanced', evidence: 'daily use', updatedAt: '2024-01-01' },
        { area: 'Rust', level: 'intermediate', evidence: 'learning', updatedAt: '2024-01-01' },
      ],
    })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('distributed systems')
    expect(block).toContain('React')
    // Intermediate level should not appear in "deep expertise"
    expect(block).not.toContain('Rust')
  })

  it('includes strong opinions', () => {
    const profile = makeProfile({
      opinions: [
        { belief: 'Monoliths are underrated', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-01-01' },
        { belief: 'Tests should be fast', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-01-01' },
      ],
    })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('Monoliths are underrated')
    expect(block).toContain('Tests should be fast')
  })

  it('includes projects', () => {
    const profile = makeProfile({
      projects: [
        { name: 'Payment Gateway', description: 'Built a new payment system', role: 'Lead', outcome: 'Live', lessons: [], updatedAt: '2024-01-01' },
      ],
    })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('Payment Gateway')
    expect(block).toContain('Built a new payment system')
  })

  it('includes lessons from experiences', () => {
    const profile = makeProfile({
      experiences: [
        { type: 'mistake', description: 'Deployed on Friday', lesson: 'Never deploy on Friday', date: null, updatedAt: '2024-01-01' },
      ],
    })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('Never deploy on Friday')
  })

  it('includes writing characteristics', () => {
    const profile = makeProfile({
      writingCharacteristics: { sentenceRhythm: 'short, punchy', preferredLength: 'medium' },
    })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('short, punchy')
    expect(block).toContain('medium')
  })

  it('includes topics to avoid', () => {
    const profile = makeProfile({
      topicsAvoided: [{ topic: 'crypto bro takes', intensity: 'casual', source: 'onboarding' }],
    })
    const block = buildContentDnaPromptBlock(profile)
    expect(block).toContain('crypto bro takes')
  })
})

describe('Content DNA: confidence calculation', () => {
  it('returns 0 for empty profile', () => {
    const profile = makeProfile()
    expect(calculateProfileConfidence(profile)).toBe(0)
  })

  it('increases with more filled fields', () => {
    const empty = makeProfile()
    const partial = makeProfile({ role: 'Engineer', seniority: 'Senior' })
    const full = makeProfile({
      role: 'Engineer',
      seniority: 'Senior',
      industries: ['fintech'],
      audience: 'engineers',
      expertise: [
        { area: 'A', level: 'expert', evidence: '', updatedAt: '' },
        { area: 'B', level: 'expert', evidence: '', updatedAt: '' },
        { area: 'C', level: 'expert', evidence: '', updatedAt: '' },
      ],
      opinions: [
        { belief: 'X', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '' },
        { belief: 'Y', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '' },
      ],
      projects: [{ name: 'P', description: '', role: '', outcome: '', lessons: [], updatedAt: '' }],
      experiences: [{ type: 'lesson', description: '', lesson: 'L', date: null, updatedAt: '' }],
      topicsCared: [{ topic: 'T', intensity: 'passionate', source: 'onboarding' }],
      writingCharacteristics: { sentenceRhythm: 'varied' },
      goals: [{ description: 'Grow audience', type: 'audience', updatedAt: '' }],
    })

    const emptyConf = calculateProfileConfidence(empty)
    const partialConf = calculateProfileConfidence(partial)
    const fullConf = calculateProfileConfidence(full)

    expect(emptyConf).toBe(0)
    expect(partialConf).toBeGreaterThan(emptyConf)
    expect(fullConf).toBeGreaterThan(partialConf)
    expect(fullConf).toBeLessThanOrEqual(1)
  })
})

describe('Content DNA: candidate extraction from answers', () => {
  it('extracts experience candidates from action statements', () => {
    const candidates = extractDnaCandidatesFromAnswer(
      'I spent all morning debugging a race condition in our CI pipeline',
      null,
    )
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].type).toBe('experience')
    expect(candidates[0].confidence).toBeGreaterThan(0)
  })

  it('extracts opinion candidates from belief statements', () => {
    const candidates = extractDnaCandidatesFromAnswer(
      'I think microservices are overhyped for small teams',
      null,
    )
    const opinionCandidates = candidates.filter((c) => c.type === 'opinion')
    expect(opinionCandidates.length).toBeGreaterThan(0)
    expect((opinionCandidates[0].value as ContentProfileOpinion).belief).toContain('microservices')
  })

  it('does not extract from generic statements', () => {
    const candidates = extractDnaCandidatesFromAnswer(
      'The weather is nice today',
      null,
    )
    expect(candidates.length).toBe(0)
  })

  it('does not duplicate existing experiences', () => {
    const existing = makeProfile({
      experiences: [
        {
          type: 'project',
          description: 'I spent all morning debugging a race condition',
          lesson: '',
          date: null,
          updatedAt: '2024-01-01',
        },
      ],
    })
    const candidates = extractDnaCandidatesFromAnswer(
      'I spent all morning debugging a race condition in our CI pipeline',
      existing,
    )
    // Should not extract a duplicate
    expect(candidates.filter((c) => c.type === 'experience').length).toBe(0)
  })
})

describe('Content DNA: initial profile from persona', () => {
  it('builds opinions from values_and_opinions', () => {
    const result = buildInitialDnaFromPersona({
      valuesAndOpinions: ['I believe in small teams', 'Documentation matters'],
    })
    expect(result.opinions.length).toBe(2)
    expect(result.opinions[0].belief).toBe('I believe in small teams')
    expect(result.opinions[0].strength).toBe('moderate')
    expect(result.opinions[0].source).toBe('onboarding')
  })

  it('builds topics from topic list', () => {
    const result = buildInitialDnaFromPersona({
      topics: [
        { name: 'System Design', description: 'Distributed systems' },
        { name: 'Career Growth', description: 'Engineering leadership' },
      ],
    })
    expect(result.topicsCared.length).toBe(2)
    expect(result.topicsCared[0].topic).toBe('System Design')
    expect(result.topicsCared[0].intensity).toBe('interested')
  })

  it('sets writing characteristics from humor style', () => {
    const result = buildInitialDnaFromPersona({
      humorStyle: 'Dry / deadpan',
    })
    expect(result.writingCharacteristics.sentenceRhythm).toBe('measured, understated')
  })

  it('handles empty input gracefully', () => {
    const result = buildInitialDnaFromPersona({})
    expect(result.opinions.length).toBe(0)
    expect(result.topicsCared.length).toBe(0)
    expect(Object.keys(result.writingCharacteristics).length).toBe(0)
  })
})
