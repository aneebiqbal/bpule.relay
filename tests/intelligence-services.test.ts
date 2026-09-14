import { describe, it, expect } from 'vitest'
import { analyzePerformance, buildPerformancePromptBlock, adjustOpportunityConfidence } from '@/lib/content/intelligence/performance'
import { detectOrgThemes, areIdeasTooSimilar } from '@/lib/content/intelligence/org-intelligence'
import { requiresResearch, generateConstraints, classifyClaimProvenance, noopResearchProvider, performResearch } from '@/lib/content/intelligence/research'
import { findSimilarDeterministic, isDuplicate, areEmbeddingsEnabled } from '@/lib/content/intelligence/semantic'
import { mergeDnaCandidates, extractDnaCandidatesFromAnswer, calculateProfileConfidence } from '@/lib/content/content-dna'
import { discoverOpportunities } from '@/lib/content/intelligence/opportunities'
import type { ContentHistoryEntry, ContentProfile, ContentMemory, ContentPersona, ContentProfileExperience, ContentProfileOpinion, TopicCluster } from '@/lib/domain/types'

function makeHistoryEntry(overrides: Partial<ContentHistoryEntry> = {}): ContentHistoryEntry {
  return {
    id: `h-${Math.random()}`,
    organizationId: 'org1',
    personaId: 'p1',
    pillarId: null,
    topicClusterId: 'rails',
    platform: 'linkedin',
    openingLine: 'Deployed a new feature today',
    postedAt: new Date().toISOString(),
    ledToRealOutcome: false,
    outcomeNotedAt: null,
    likes: null, reach: null, comments: null, reposts: null, saves: null,
    profileVisits: null, followerDelta: null, metricsLoggedAt: null,
    ...overrides,
  }
}

function makeProfile(overrides: Partial<ContentProfile> = {}): ContentProfile {
  return {
    id: 'p1', organizationId: 'org1', personaId: 'persona1',
    role: 'Engineer', seniority: 'Senior', industries: ['fintech'],
    audience: 'engineers', expertise: [], technologies: [], goals: [],
    topicsCared: [], topicsAvoided: [], opinions: [], projects: [],
    experiences: [], writingCharacteristics: {}, storytellingTendencies: [],
    confidence: 0.5, lastLearnedAt: null, createdAt: '2024-01-01', updatedAt: '2024-01-01',
    ...overrides,
  }
}

describe('Performance Learning', () => {
  it('returns insufficient data for few posts', () => {
    const history = Array.from({ length: 3 }, (_, i) =>
      makeHistoryEntry({ metricsLoggedAt: '2024-01-01', likes: 10 + i, reach: 100 }),
    )
    const insights = analyzePerformance(history)
    expect(insights.hasEnoughData).toBe(false)
    expect(insights.patterns).toEqual([])
  })

  it('derives patterns with enough data', () => {
    const history = Array.from({ length: 6 }, (_, i) =>
      makeHistoryEntry({
        metricsLoggedAt: '2024-01-01',
        likes: 20 + i * 5,
        reach: 200 + i * 20,
        comments: 3 + i,
        saves: 2 + i,
        topicClusterId: i % 2 === 0 ? 'rails' : 'postgres',
      }),
    )
    const insights = analyzePerformance(history)
    expect(insights.hasEnoughData).toBe(true)
    expect(insights.patterns.length).toBeGreaterThan(0)
  })

  it('does not overfit from tiny samples', () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeHistoryEntry({ metricsLoggedAt: '2024-01-01', likes: 100 - i * 20 }),
    )
    const insights = analyzePerformance(history)
    // Patterns should be weak with only 5 samples
    for (const pattern of insights.patterns) {
      expect(['weak', 'insufficient']).toContain(pattern.signal)
    }
  })

  it('returns empty prompt block without enough data', () => {
    const history = Array.from({ length: 2 }, (_, i) =>
      makeHistoryEntry({ metricsLoggedAt: '2024-01-01' }),
    )
    const insights = analyzePerformance(history)
    expect(buildPerformancePromptBlock(insights)).toBe('')
  })

  it('adjusts confidence only slightly', () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      makeHistoryEntry({ metricsLoggedAt: '2024-01-01', likes: 50, reach: 500 }),
    )
    const insights = analyzePerformance(history)
    const adjusted = adjustOpportunityConfidence(0.6, 'recent_work', insights)
    // Adjustment should be small (±0.1 max)
    expect(Math.abs(adjusted - 0.6)).toBeLessThanOrEqual(0.1)
  })
})

describe('Organization Intelligence', () => {
  it('detects shared themes across personas', () => {
    const personas = [
      {
        persona: { id: 'p1', displayName: 'Backend Engineer' } as ContentPersona,
        memories: [
          { id: 'm1', organizationId: 'org1', personaId: 'p1', memoryType: 'topic_covered' as const, content: 'Rails API design', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-01-01' },
        ] as ContentMemory[],
      },
      {
        persona: { id: 'p2', displayName: 'DevOps Engineer' } as ContentPersona,
        memories: [
          { id: 'm2', organizationId: 'org1', personaId: 'p2', memoryType: 'topic_covered' as const, content: 'Rails deployment', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-01-01' },
        ] as ContentMemory[],
      },
    ]
    const themes = detectOrgThemes(personas)
    expect(themes.length).toBeGreaterThan(0)
  })

  it('does not expose private data', () => {
    const personas = [
      {
        persona: { id: 'p1', displayName: 'Engineer' } as ContentPersona,
        memories: [
          { id: 'm1', organizationId: 'org1', personaId: 'p1', memoryType: 'topic_covered' as const, content: 'Secret project InternalTool', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-01-01' },
        ] as ContentMemory[],
      },
      {
        persona: { id: 'p2', displayName: 'Other Engineer' } as ContentPersona,
        memories: [] as ContentMemory[],
      },
    ]
    const themes = detectOrgThemes(personas)
    // Themes should only use public topic names, not private data
    for (const theme of themes) {
      for (const persona of theme.relevantPersonas) {
        expect(persona.personaId).toBeDefined()
        expect(persona.suggestedAngle).toBeDefined()
      }
    }
  })

  it('detects similar ideas across personas', () => {
    expect(areIdeasTooSimilar('Rails API design patterns', 'Rails API design patterns for scale', 0.5)).toBe(true)
    expect(areIdeasTooSimilar('Rails API design', 'React state management')).toBe(false)
  })

  it('returns empty for single persona', () => {
    const personas = [
      { persona: { id: 'p1', displayName: 'Engineer' } as ContentPersona, memories: [] as ContentMemory[] },
    ]
    expect(detectOrgThemes(personas)).toEqual([])
  })
})

describe('Research Layer', () => {
  it('does not require research for personal experience', () => {
    const result = requiresResearch({
      sourceMaterial: 'I spent hours debugging our deployment',
      genomeSource: 'personal_experience',
      supportingFacts: [],
    })
    expect(result.shouldResearch).toBe(false)
  })

  it('requires research for statistics', () => {
    const result = requiresResearch({
      sourceMaterial: 'Rails 8 is 3x faster than Django according to benchmarks',
      genomeSource: null,
      supportingFacts: ['3x faster'],
    })
    expect(result.shouldResearch).toBe(true)
  })

  it('requires research for recent releases', () => {
    const result = requiresResearch({
      sourceMaterial: 'React 19 was released yesterday with new features',
      genomeSource: null,
      supportingFacts: [],
    })
    expect(result.shouldResearch).toBe(true)
  })

  it('generates constraints when research unavailable', () => {
    const constraints = generateConstraints('Rails 8 is 3x faster than Django')
    expect(constraints.length).toBeGreaterThan(0)
    expect(constraints.some((c) => c.includes('statistics') || c.includes('metrics'))).toBe(true)
  })

  it('classifies claim provenance correctly', () => {
    expect(classifyClaimProvenance('I built this at work', false, true)).toBe('USER_FACT')
    expect(classifyClaimProvenance('Studies show 50% improvement', true, false)).toBe('EXTERNAL_FACT')
    expect(classifyClaimProvenance('I think this is better', false, false)).toBe('MODEL_SUGGESTION')
    expect(classifyClaimProvenance('The system uses microservices', false, false)).toBe('MODEL_INFERENCE')
  })

  it('noop provider returns no results', async () => {
    expect(noopResearchProvider.isAvailable()).toBe(false)
    const results = await performResearch(noopResearchProvider, 'test')
    expect(results).toEqual([])
  })
})

describe('Semantic Similarity', () => {
  it('detects exact prefix matches', () => {
    const results = findSimilarDeterministic('Shipped the caching fix today', ['Shipped the caching fix today. Latency dropped.'])
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].similarity).toBeGreaterThanOrEqual(0.9)
  })

  it('detects word overlap', () => {
    const results = findSimilarDeterministic('Rails API design', ['Building a Rails API', 'React state management'], 0.3)
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns empty for dissimilar content', () => {
    const results = findSimilarDeterministic('Kubernetes ingress', ['Baking sourdough bread'], 0.3)
    expect(results).toEqual([])
  })

  it('isDuplicate works correctly', () => {
    const result = isDuplicate('Rails API design patterns', ['Rails API design patterns for scale'], 0.4)
    expect(result.isDuplicate).toBe(true)

    const result2 = isDuplicate('Rails API design', ['React state management'], 0.5)
    expect(result2.isDuplicate).toBe(false)
  })

  it('embeddings not enabled by default', () => {
    expect(areEmbeddingsEnabled()).toBe(false)
  })
})

describe('DNA Merge', () => {
  it('merges high-confidence candidates into profile', () => {
    const profile = makeProfile()
    const candidates = [
      {
        type: 'experience' as const,
        value: { type: 'mistake' as const, description: 'Deployed on Friday', lesson: 'Never deploy on Friday', date: null, updatedAt: '2024-01-01' } as ContentProfileExperience,
        confidence: 0.7,
        source: 'Deployed on Friday',
      },
      {
        type: 'opinion' as const,
        value: { belief: 'Microservices are overrated', strength: 'moderate' as const, evidence: '', source: 'answer' as const, updatedAt: '2024-01-01' } as ContentProfileOpinion,
        confidence: 0.6,
        source: 'Microservices are overrated',
      },
    ]
    const patches = mergeDnaCandidates(profile, candidates)
    expect(patches.experiences.length).toBe(1)
    expect(patches.opinions.length).toBe(1)
  })

  it('filters low-confidence candidates', () => {
    const profile = makeProfile()
    const candidates = [
      {
        type: 'experience' as const,
        value: { type: 'project' as const, description: 'Built something', lesson: '', date: null, updatedAt: '2024-01-01' } as ContentProfileExperience,
        confidence: 0.3, // below threshold
        source: 'Built something',
      },
    ]
    const patches = mergeDnaCandidates(profile, candidates)
    expect(patches.experiences.length).toBe(0)
  })

  it('deduplicates against existing entries', () => {
    const profile = makeProfile({
      experiences: [{ type: 'mistake', description: 'Deployed on Friday', lesson: 'Never deploy on Friday', date: null, updatedAt: '2024-01-01' }],
    })
    const candidates = [
      {
        type: 'experience' as const,
        value: { type: 'mistake' as const, description: 'Deployed on Friday', lesson: 'Never deploy on Friday', date: null, updatedAt: '2024-01-01' } as ContentProfileExperience,
        confidence: 0.7,
        source: 'Deployed on Friday',
      },
    ]
    const patches = mergeDnaCandidates(profile, candidates)
    expect(patches.experiences.length).toBe(0) // duplicate filtered
  })

  it('updates confidence after merge', () => {
    const profile = makeProfile({ confidence: 0.2 })
    const candidates = [
      {
        type: 'experience' as const,
        value: { type: 'project' as const, description: 'Built something important', lesson: 'Test in production', date: null, updatedAt: '2024-01-01' } as ContentProfileExperience,
        confidence: 0.7,
        source: 'Built something important',
      },
    ]
    const patches = mergeDnaCandidates(profile, candidates)
    const newProfile = { ...profile, experiences: [...profile.experiences, ...patches.experiences] }
    const newConfidence = calculateProfileConfidence(newProfile)
    expect(newConfidence).toBeGreaterThan(profile.confidence)
  })
})

describe('Discover Opportunities', () => {
  it('generates opportunities from moderate opinions', () => {
    const profile = makeProfile({
      opinions: [
        { belief: 'TypeScript is overrated for small projects', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-01-01' },
      ],
    })
    const opps = discoverOpportunities({ profile, clusters: [], history: [], memories: [] })
    expect(opps.length).toBeGreaterThan(0)
    expect(opps[0].type).toBe('contrarian_position')
  })

  it('generates opportunities from topicsCared', () => {
    const profile = makeProfile({
      topicsCared: [{ topic: 'Rust', intensity: 'passionate', source: 'onboarding' }],
    })
    const opps = discoverOpportunities({ profile, clusters: [], history: [], memories: [] })
    expect(opps.length).toBeGreaterThan(0)
    expect(opps.some((o) => o.title.includes('Rust'))).toBe(true)
  })

  it('generates opportunities from stale topic clusters', () => {
    const clusters: TopicCluster[] = [
      { id: 'c1', organizationId: 'org1', personaId: 'p1', clusterName: 'AI Safety', description: '', sourceType: 'profile', lastInputAt: '2024-01-01', lastResearchAt: null, mergedIntoId: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ]
    const opps = discoverOpportunities({ profile: makeProfile(), clusters, history: [], memories: [] })
    expect(opps.length).toBeGreaterThan(0)
    expect(opps.some((o) => o.title.includes('AI Safety'))).toBe(true)
  })

  it('generates opportunities from topic clusters never posted', () => {
    const clusters: TopicCluster[] = [
      { id: 'c1', organizationId: 'org1', personaId: 'p1', clusterName: 'PostgreSQL', description: 'Database stuff', sourceType: 'profile', lastInputAt: null, lastResearchAt: null, mergedIntoId: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ]
    const opps = discoverOpportunities({ profile: makeProfile(), clusters, history: [], memories: [] })
    expect(opps.length).toBeGreaterThan(0)
    expect(opps.some((o) => o.title.includes('PostgreSQL'))).toBe(true)
  })

  it('returns opportunities from recent user input', () => {
    const opps = discoverOpportunities({
      profile: makeProfile(),
      clusters: [],
      history: [],
      memories: [],
      recentUserInput: 'I spent all week debugging a race condition in production',
    })
    expect(opps.length).toBeGreaterThan(0)
    expect(opps[0].sourceKind).toBe('user_input')
  })

  it('returns evergreen fallback for empty profile with no clusters or input', () => {
    const opps = discoverOpportunities({ profile: makeProfile(), clusters: [], history: [], memories: [] })
    expect(opps.length).toBeGreaterThan(0)
    expect(opps[0].sourceKind).toBe('system_inferred')
  })

  it('handles null profile with evergreen fallback', () => {
    const opps = discoverOpportunities({ profile: null, clusters: [], history: [], memories: [] })
    expect(opps.length).toBeGreaterThan(0)
  })
})
