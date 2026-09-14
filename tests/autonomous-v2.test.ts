import { describe, it, expect } from 'vitest'
import { inferContentUniverse, getUnderusedTerritories, type ContentTerritory } from '@/lib/content/intelligence/v2/territories'
import { createTasteProfile, applyTasteSignal, scoreTasteMatch } from '@/lib/content/intelligence/v2/taste'
import { generatePostSeeds } from '@/lib/content/intelligence/v2/idea-engine'
import { generateSurpriseSeed } from '@/lib/content/intelligence/v2/surprise'
import { generateOpinionChoices, getDirectionChoices } from '@/lib/content/intelligence/v2/opinions'
import type { ContentProfile, ContentMemory } from '@/lib/domain/types'

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeRichProfile(): ContentProfile {
  return {
    id: 'p1', organizationId: 'org1', personaId: 'persona1',
    role: 'Senior Full-Stack Engineer', seniority: 'Senior',
    industries: ['fintech', 'developer tools'],
    audience: 'senior engineers and engineering managers',
    expertise: [
      { area: 'distributed systems', level: 'expert', evidence: '', updatedAt: '2024-11-01' },
      { area: 'Rails architecture', level: 'expert', evidence: '', updatedAt: '2024-11-01' },
      { area: 'PostgreSQL performance', level: 'advanced', evidence: '', updatedAt: '2024-11-01' },
    ],
      technologies: [
        { name: 'Ruby on Rails', proficiency: 'expert' as const, context: 'backend' },
        { name: 'PostgreSQL', proficiency: 'expert' as const, context: 'database' },
        { name: 'React', proficiency: 'proficient' as const, context: 'frontend' },
      ],
    goals: [],
    topicsCared: [{ topic: 'Production Debugging', intensity: 'passionate', source: 'onboarding' }],
    topicsAvoided: [],
    opinions: [
      { belief: 'Most performance problems are N+1 queries', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Teams adopt Kubernetes too early', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
    ],
    projects: [{ name: 'Payment Gateway v2', description: 'Rebuilt payment processing', role: 'Tech Lead', outcome: 'Reduced failures', lessons: ['Design for retry'], updatedAt: '2024-11-01' }],
    experiences: [{ type: 'mistake', description: 'Deployed non-idempotent job', lesson: 'Always make jobs idempotent', date: '2024-09-15', updatedAt: '2024-11-01' }],
    writingCharacteristics: { sentenceRhythm: 'measured, varied', preferredLength: 'medium', questionFrequency: 'occasional', dataUsage: 'light' },
    storytellingTendencies: [],
    confidence: 0.6, lastLearnedAt: '2024-11-01', createdAt: '2024-01-01', updatedAt: '2024-11-01',
  }
}

function makeMemories(): ContentMemory[] {
  return [
    { id: 'm1', organizationId: 'org1', personaId: 'persona1', memoryType: 'topic_covered', content: 'Why we chose to stay on Postgres instead of adding Elasticsearch', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-11-01' },
    { id: 'm2', organizationId: 'org1', personaId: 'persona1', memoryType: 'opinion_expressed', content: 'Most performance problems are N+1 queries', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-10-15' },
  ]
}

// ── Test 1: Zero-input user ───────────────────────────────────────────────

describe('Autonomous V2: Zero-input user', () => {
  it('generates ideas for null profile (sparse mode)', () => {
    const result = generatePostSeeds(null, [], null)
    expect(result.selected.length).toBeGreaterThan(0)
    expect(result.selected.length).toBeLessThanOrEqual(5)
  })

  it('returns diverse content types for zero-input user', () => {
    const result = generatePostSeeds(null, [], null)
    const types = new Set(result.selected.map(s => s.contentType))
    expect(types.size).toBeGreaterThan(1)
  })
})

// ── Test 2: "I have no idea what to post" ────────────────────────────────

describe('Autonomous V2: No idea what to post', () => {
  it('returns immediate ideas without requiring any input', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    expect(result.selected.length).toBeGreaterThanOrEqual(3)
    expect(result.selected.length).toBeLessThanOrEqual(5)
  })

  it('each idea has required fields', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    for (const seed of result.selected) {
      expect(seed.idea.length).toBeGreaterThan(10)
      expect(seed.angle.length).toBeGreaterThan(10)
      expect(seed.contentType).toBeDefined()
      expect(seed.groundingType).toBeDefined()
      expect(seed.whyInteresting.length).toBeGreaterThan(5)
    }
  })
})

// ── Test 3: Sparse Rails/React persona ────────────────────────────────────

describe('Autonomous V2: Sparse persona', () => {
  it('generates credible options for minimal profile', () => {
    const sparseProfile: ContentProfile = {
      id: 'p2', organizationId: 'org1', personaId: 'persona2',
      role: 'Full-stack developer', seniority: '',
      industries: [], audience: '',
      expertise: [
        { area: 'Rails', level: 'expert', evidence: '', updatedAt: '2024-01-01' },
        { area: 'React', level: 'advanced', evidence: '', updatedAt: '2024-01-01' },
      ],
      technologies: [
        { name: 'Ruby on Rails', proficiency: 'expert', context: '' },
        { name: 'React', proficiency: 'proficient', context: '' },
      ],
      goals: [], topicsCared: [], topicsAvoided: [], opinions: [],
      projects: [], experiences: [],
      writingCharacteristics: {}, storytellingTendencies: [],
      confidence: 0.2, lastLearnedAt: null, createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }
    const result = generatePostSeeds(sparseProfile, [], null)
    expect(result.selected.length).toBeGreaterThan(0)
    // Should not invent personal experiences
    const personalSeeds = result.selected.filter(s => s.groundingType === 'personal_grounded')
    expect(personalSeeds.length).toBe(0) // No experiences in profile = no personal_grounded
  })
})

// ── Test 4: Rich persona ──────────────────────────────────────────────────

describe('Autonomous V2: Rich persona', () => {
  it('uses profile data to generate relevant ideas', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    expect(result.selected.length).toBeGreaterThan(0)
    // All selected ideas should have a persona relevance score assigned
    expect(result.selected.every(s => s.scores.personaRelevance >= 0)).toBe(true)
    // At least one idea should have meaningful relevance to the persona
    const maxRelevance = Math.max(...result.selected.map(s => s.scores.personaRelevance))
    expect(maxRelevance).toBeGreaterThan(0.3)
  })
})

// ── Test 5: One-tap opinion choices ───────────────────────────────────────

describe('Autonomous V2: Opinion choices', () => {
  it('returns choices for engineering_culture territory', () => {
    const set = generateOpinionChoices(makeRichProfile(), 'engineering_culture')
    expect(set.choices.length).toBeGreaterThanOrEqual(3)
    expect(set.choices.every(c => c.opinion.length > 5)).toBe(true)
  })

  it('returns choices for AI territory', () => {
    const set = generateOpinionChoices(makeRichProfile(), 'ai')
    expect(set.choices.length).toBeGreaterThanOrEqual(3)
  })

  it('returns direction choices', () => {
    const dirs = getDirectionChoices()
    expect(dirs.length).toBeGreaterThanOrEqual(3)
    expect(dirs[0].label).toBeDefined()
  })

  it('does not treat unselected options as user beliefs', () => {
    const set = generateOpinionChoices(null, 'ai')
    // All choices should be independent — selecting one doesn't imply others
    expect(set.multiSelect).toBe(false)
  })
})

// ── Test 6: Educational post without personal evidence ────────────────────

describe('Autonomous V2: Educational without personal evidence', () => {
  it('routes to general_educational when no personal evidence exists', () => {
    const noExpProfile: ContentProfile = {
      ...makeRichProfile(),
      experiences: [],
      projects: [],
    }
    const result = generatePostSeeds(noExpProfile, [], null)
    // Should still generate ideas, just not personal_grounded
    const hasNonPersonal = result.selected.some(s => s.groundingType !== 'personal_grounded')
    expect(hasNonPersonal).toBe(true)
  })
})

// ── Test 7: No-fabrication fallback ───────────────────────────────────────

describe('Autonomous V2: No fabrication', () => {
  it('never fabricates personal experiences', () => {
    const result = generatePostSeeds(null, [], null)
    const personalSeeds = result.selected.filter(s => s.groundingType === 'personal_grounded')
    expect(personalSeeds.length).toBe(0) // No profile = no personal claims
  })

  it('marks neverFabricate constraints on seeds', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    const allHaveConstraints = result.selected.every(s =>
      Array.isArray(s.neverFabricate) && s.neverFabricate.length >= 0
    )
    expect(allHaveConstraints).toBe(true)
  })
})

// ── Test 8: Surprise Me ───────────────────────────────────────────────────

describe('Autonomous V2: Surprise Me', () => {
  it('generates a cross-domain surprise seed', () => {
    const seed = generateSurpriseSeed(makeRichProfile(), makeMemories())
    expect(seed).not.toBeNull()
    expect(seed!.connectionType).toBeDefined()
    expect(seed!.connectionExplanation.length).toBeGreaterThan(10)
  })

  it('surprise seed is different from regular ideas', () => {
    const regular = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    const surprise = generateSurpriseSeed(makeRichProfile(), makeMemories())
    if (surprise) {
      const regularIdeas = regular.selected.map(s => s.idea)
      expect(regularIdeas).not.toContain(surprise.idea)
    }
  })

  it('works with null profile', () => {
    const seed = generateSurpriseSeed(null, [])
    // Should still generate something (underused territory fallback)
    expect(seed).not.toBeNull()
  })
})

// ── Test 9: Taste learning ────────────────────────────────────────────────

describe('Autonomous V2: Taste learning', () => {
  it('learns from write_this signals', () => {
    let profile = createTasteProfile('p1')
    profile = applyTasteSignal(profile, {
      type: 'write_this',
      territory: 'ai',
      metadata: { wasTechnical: true, wasOpinion: true },
    })
    expect(profile.totalInteractions).toBe(1)
    expect(profile.preferences.technicalVsHuman).toBeGreaterThan(0)
    expect(profile.preferences.opinionVsEducational).toBeGreaterThan(0)
  })

  it('learns from not_for_me signals', () => {
    let profile = createTasteProfile('p1')
    profile = applyTasteSignal(profile, {
      type: 'not_for_me',
      territory: 'ai',
      metadata: { wasTechnical: true },
    })
    expect(profile.preferences.technicalVsHuman).toBeLessThan(0)
  })

  it('does not overfit from one interaction', () => {
    let profile = createTasteProfile('p1')
    const before = profile.preferences.technicalVsHuman
    profile = applyTasteSignal(profile, {
      type: 'write_this',
      metadata: { wasTechnical: true },
    })
    // Should move but not jump to extreme
    const change = Math.abs(profile.preferences.technicalVsHuman - before)
    expect(change).toBeLessThan(0.5)
  })

  it('scores taste match correctly', () => {
    let profile = createTasteProfile('p1')
    for (let i = 0; i < 5; i++) {
      profile = applyTasteSignal(profile, {
        type: 'write_this',
        territory: 'ai',
        metadata: { wasTechnical: true, wasOpinion: true },
      })
    }
    const technicalScore = scoreTasteMatch(profile, { isTechnical: true, territory: 'ai' })
    const humanScore = scoreTasteMatch(profile, { isTechnical: false, territory: 'ai' })
    expect(technicalScore).toBeGreaterThan(humanScore)
  })
})

// ── Test 10: Duplicate avoidance ──────────────────────────────────────────

describe('Autonomous V2: Duplicate avoidance', () => {
  it('does not return duplicate ideas', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    const ideas = result.selected.map(s => s.idea.toLowerCase().slice(0, 30))
    const unique = new Set(ideas)
    expect(unique.size).toBe(ideas.length)
  })

  it('avoids topics in recent memory', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    // Should not repeat "N+1 queries" since it's in memory
    const hasNPlusOne = result.selected.some(s => s.idea.toLowerCase().includes('n+1'))
    // It's OK if it appears, but it should be scored lower
    if (hasNPlusOne) {
      const nPlusSeed = result.selected.find(s => s.idea.toLowerCase().includes('n+1'))
      expect(nPlusSeed!.scores.memoryDistance).toBeLessThan(0.5)
    }
  })
})

// ── Test 11: Idea diversity ───────────────────────────────────────────────

describe('Autonomous V2: Idea diversity', () => {
  it('returns mix of content types', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    const types = new Set(result.selected.map(s => s.contentType))
    expect(types.size).toBeGreaterThanOrEqual(2)
  })

  it('returns mix of territories', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    const territories = new Set(result.selected.map(s => s.territory))
    expect(territories.size).toBeGreaterThanOrEqual(2)
  })

  it('does not return 5 variations of the same idea', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    const firstWords = result.selected.map(s => s.idea.split(' ')[0])
    const uniqueFirstWords = new Set(firstWords)
    expect(uniqueFirstWords.size).toBeGreaterThanOrEqual(2)
  })
})

// ── Test 12: Territory inference ──────────────────────────────────────────

describe('Autonomous V2: Territory inference', () => {
  it('infers territories from profile', () => {
    const universe = inferContentUniverse(makeRichProfile(), makeMemories())
    expect(universe.territories.length).toBeGreaterThan(0)
    expect(universe.territories[0].weight).toBeGreaterThan(0)
  })

  it('returns default territories for null profile', () => {
    const universe = inferContentUniverse(null, [])
    expect(universe.territories.length).toBeGreaterThan(0)
  })

  it('identifies underused territories', () => {
    const universe = inferContentUniverse(makeRichProfile(), makeMemories())
    const underused = getUnderusedTerritories(universe, 3)
    expect(underused.length).toBeGreaterThan(0)
    expect(underused.length).toBeLessThanOrEqual(3)
  })

  it('gives higher freshness to uncovered territories', () => {
    const universe = inferContentUniverse(makeRichProfile(), makeMemories())
    const covered = universe.territories.find(t => t.territory === 'opinions')
    const uncovered = universe.territories.find(t => t.territory === 'timely_developments')
    if (covered && uncovered) {
      expect(uncovered.freshness).toBeGreaterThanOrEqual(covered.freshness)
    }
  })
})

// ── Test 13: Different personas get different ideas ────────────────────────

describe('Autonomous V2: Persona differentiation', () => {
  it('different personas receive structurally different ideas', () => {
    const railsProfile: ContentProfile = {
      ...makeRichProfile(),
      expertise: [{ area: 'Rails', level: 'expert', evidence: '', updatedAt: '2024-01-01' }],
      technologies: [{ name: 'Ruby on Rails', proficiency: 'expert', context: '' }],
      topicsCared: [],
      opinions: [],
      experiences: [],
    }
    const aiProfile: ContentProfile = {
      ...makeRichProfile(),
      expertise: [{ area: 'Machine Learning', level: 'expert', evidence: '', updatedAt: '2024-01-01' }],
      technologies: [{ name: 'Python', proficiency: 'expert', context: '' }, { name: 'OpenAI', proficiency: 'proficient', context: '' }],
      topicsCared: [{ topic: 'AI Agents', intensity: 'passionate', source: 'onboarding' }],
      opinions: [],
      experiences: [],
    }

    const railsResult = generatePostSeeds(railsProfile, [], null)
    const aiResult = generatePostSeeds(aiProfile, [], null)

    // Should have different territory focus
    const railsTerritories = new Set(railsResult.selected.map(s => s.territory))
    const aiTerritories = new Set(aiResult.selected.map(s => s.territory))
    // AI profile should have 'ai' territory
    expect(aiTerritories.has('ai' as ContentTerritory)).toBe(true)
    // At least some difference in territories
    const allSame = [...railsTerritories].every(t => aiTerritories.has(t)) && railsTerritories.size === aiTerritories.size
    expect(allSame).toBe(false)
  })
})

// ── Test 14: Repeated sessions without topic repetition ────────────────────

describe('Autonomous V2: No topic repetition', () => {
  it('tracks memory to avoid repetition', () => {
    const memories = makeMemories()
    const result1 = generatePostSeeds(makeRichProfile(), memories, null)

    // Simulate posting one of the ideas
    const newMemories: ContentMemory[] = [
      ...memories,
      { id: 'm3', organizationId: 'org1', personaId: 'persona1', memoryType: 'topic_covered', content: result1.selected[0].idea.slice(0, 50), sourceDraftId: null, sourceHistoryId: null, createdAt: new Date().toISOString() },
    ]

    const result2 = generatePostSeeds(makeRichProfile(), newMemories, null)
    // The posted idea should have lower memory distance in second run
    const sameIdea = result2.seeds.find(s => s.idea === result1.selected[0].idea)
    if (sameIdea) {
      expect(sameIdea.scores.memoryDistance).toBeLessThan(0.5)
    }
  })
})

// ── Test 15: Visual prompt integration ─────────────────────────────────────

describe('Autonomous V2: Visual concept integration', () => {
  it('seeds include territory info for visual concept generation', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    for (const seed of result.selected) {
      expect(seed.territory).toBeDefined()
      expect(seed.contentType).toBeDefined()
    }
  })
})

// ── Test 16: Premium Forge integration ─────────────────────────────────────

describe('Autonomous V2: Forge integration', () => {
  it('seeds contain all needed data for forge generation', () => {
    const result = generatePostSeeds(makeRichProfile(), makeMemories(), null)
    for (const seed of result.selected) {
      expect(seed.idea).toBeDefined()
      expect(seed.angle).toBeDefined()
      expect(seed.contentType).toBeDefined()
      expect(seed.groundingType).toBeDefined()
      expect(seed.evidenceSource).toBeDefined()
    }
  })
})

// ── Test: Dual-track taste ────────────────────────────────────────────────

describe('Autonomous V2: Dual-track taste', () => {
  it('long-term learning rate has a small floor (0.02)', () => {
    let tp = createTasteProfile('p1')
    // Apply 500 interactions
    for (let i = 0; i < 500; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    }
    // After 500 interactions, long-term LR should be at floor: 0.02
    // One more signal should move by at most ~0.02 * 0.5 * 0.6 = 0.006
    const before = tp.preferences.technicalVsHuman
    tp = applyTasteSignal(tp, { type: 'not_for_me', metadata: { wasTechnical: true } })
    const change = Math.abs(tp.preferences.technicalVsHuman - before)
    expect(change).toBeLessThan(0.01) // Small change at maturity
  })

  it('short-term can diverge from long-term after a burst of signals', () => {
    let tp = createTasteProfile('p1')
    // Build long-term preference for technical
    for (let i = 0; i < 20; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    }
    const longTermTech = tp.preferences.technicalVsHuman
    // Now burst of opinion signals — short-term should shift faster
    for (let i = 0; i < 3; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasOpinion: true, wasTechnical: false } })
    }
    // Short-term should have moved more than long-term from the burst
    const shortTermShift = Math.abs(tp.shortTerm.opinionVsEducational - 0)
    const longTermShift = Math.abs(tp.preferences.opinionVsEducational - 0)
    expect(shortTermShift).toBeGreaterThan(longTermShift)
  })

  it('short-term weight decays after signals stop', () => {
    let tp = createTasteProfile('p1')
    // Apply signal to bump short-term weight
    tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    const weightAfterSignal = tp.shortTermWeight
    // Apply neutral signal (ignored) to trigger decay
    tp = applyTasteSignal(tp, { type: 'ignored' })
    expect(tp.shortTermWeight).toBeLessThan(weightAfterSignal)
  })

  it('short-term dimensions drift toward long-term', () => {
    let tp = createTasteProfile('p1')
    // Build up short-term divergence
    for (let i = 0; i < 10; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    }
    const shortTermBefore = tp.shortTerm.technicalVsHuman
    const longTermBefore = tp.preferences.technicalVsHuman
    // Apply more signals to trigger drift
    for (let i = 0; i < 5; i++) {
      tp = applyTasteSignal(tp, { type: 'ignored' })
    }
    // Short-term should have moved closer to long-term
    const shortTermAfter = tp.shortTerm.technicalVsHuman
    const longTermAfter = tp.preferences.technicalVsHuman
    expect(Math.abs(shortTermAfter - longTermAfter)).toBeLessThan(Math.abs(shortTermBefore - longTermBefore))
  })

  it('scoreTasteMatch blends long-term and short-term', () => {
    let tp = createTasteProfile('p1')
    // Build long-term preference for technical
    for (let i = 0; i < 10; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    }
    // Short-term also technical
    const score = scoreTasteMatch(tp, { isTechnical: true })
    expect(score).toBeGreaterThan(0.5)
  })
})

// ── Test: Taste persistence ───────────────────────────────────────────────

describe('Autonomous V2: Taste persistence', () => {
  it('creates a fresh taste profile with defaults', () => {
    const tp = createTasteProfile('persona1')
    expect(tp.totalInteractions).toBe(0)
    expect(tp.preferences.technicalVsHuman).toBe(0)
    expect(tp.territoryAffinity).toEqual({})
  })

  it('persists signals across multiple apply calls', () => {
    let tp = createTasteProfile('persona1')
    tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true, wasOpinion: true } })
    tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true, wasOpinion: true } })
    tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true, wasOpinion: true } })
    expect(tp.totalInteractions).toBe(3)
    expect(tp.preferences.technicalVsHuman).toBeGreaterThan(0.3)
    expect(tp.preferences.opinionVsEducational).toBeGreaterThan(0.3)
  })

  it('negative signals reduce preference', () => {
    let tp = createTasteProfile('persona1')
    // First build up positive signal
    for (let i = 0; i < 5; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    }
    const positivePref = tp.preferences.technicalVsHuman
    // Now add negative signal
    tp = applyTasteSignal(tp, { type: 'not_for_me', metadata: { wasTechnical: true } })
    expect(tp.preferences.technicalVsHuman).toBeLessThan(positivePref)
  })

  it('territory affinity builds up over time', () => {
    let tp = createTasteProfile('persona1')
    for (let i = 0; i < 5; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai' })
    }
    expect(tp.territoryAffinity['ai']).toBeGreaterThan(0.5)
  })

  it('scoreTasteMatch returns higher score for preferred content', () => {
    let tp = createTasteProfile('persona1')
    for (let i = 0; i < 10; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true, wasOpinion: true } })
    }
    const techScore = scoreTasteMatch(tp, { isTechnical: true, territory: 'ai' })
    const humanScore = scoreTasteMatch(tp, { isTechnical: false, territory: 'ai' })
    expect(techScore).toBeGreaterThan(humanScore)
  })

  it('neutral score when no interactions', () => {
    const tp = createTasteProfile('persona1')
    const score = scoreTasteMatch(tp, { isTechnical: true })
    expect(score).toBe(0.5)
  })
})
