import { describe, it, expect, beforeEach } from 'vitest'
import {
  pickModelChain,
  pickDraftChain,
  tier1Chain,
  tier2Chain,
  shouldEscalateToPremium,
  buildLongcatDraftChain,
  buildOpenaiDraftChain,
} from '@/lib/ai/routing'
import { isDeepseekEnabled, tier1Hosts, tier2Hosts, hasProvider } from '@/lib/ai/config'
import { ContentCache } from '@/lib/ai/cache'
import { deduplicated } from '@/lib/ai/dedup'
import * as budget from '@/lib/ai/budget'
import { constructIdeaGenome } from '@/lib/content/intelligence/genome'
import { extractIdentityFromSource } from '@/lib/content/onboarding-extract'
import { parseQuickCapture } from '@/lib/content/quick-capture'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'

describe('DeepSeek removal', () => {
  beforeEach(() => {
    delete process.env.SCOUT_DEEPSEEK_ENABLED
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.FIREWORKS_API_KEY
  })

  it('isDeepseekEnabled returns false by default', () => {
    expect(isDeepseekEnabled()).toBe(false)
  })

  it('isDeepseekEnabled returns true only when explicitly set to 1', () => {
    process.env.SCOUT_DEEPSEEK_ENABLED = '1'
    expect(isDeepseekEnabled()).toBe(true)
  })

  it('tier1Hosts returns empty when DeepSeek disabled', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
    process.env.SCOUT_DEEPSEEK_ENABLED = '0'
    expect(tier1Hosts()).toEqual([])
  })

  it('tier2Hosts returns empty when DeepSeek disabled', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
    expect(tier2Hosts()).toEqual([])
  })

  it('tier1Chain excludes DeepSeek when disabled', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
    expect(tier1Chain()).toEqual([])
  })

  it('tier2Chain excludes DeepSeek when disabled', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
    expect(tier2Chain()).toEqual([])
  })

  it('pickModelChain never includes DeepSeek hosts when disabled', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
    const chain = pickModelChain('extract')
    const hostIds = chain.map((s) => s.host.id)
    expect(hostIds).not.toContain('deepseek-official')
    expect(hostIds).not.toContain('fireworks')
  })

  it('pickDraftChain never includes DeepSeek hosts when disabled', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
    const chain = pickDraftChain()
    const hostIds = chain.map((s) => s.host.id)
    expect(hostIds).not.toContain('deepseek-official')
    expect(hostIds).not.toContain('fireworks')
  })

  it('tier1Hosts returns hosts when DeepSeek explicitly enabled', () => {
    process.env.SCOUT_DEEPSEEK_ENABLED = '1'
    process.env.DEEPSEEK_API_KEY = 'test-key'
    const hosts = tier1Hosts()
    expect(hosts.length).toBeGreaterThan(0)
    expect(hosts[0].id).toBe('deepseek-official')
  })
})

describe('Groq-first extraction routing', () => {
  beforeEach(() => {
    delete process.env.SCOUT_DEEPSEEK_ENABLED
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.LONGCAT_API_KEY
  })

  it('pickModelChain starts with Groq when GROQ_API_KEY is set', () => {
    process.env.GROQ_API_KEY = 'test-groq'
    const chain = pickModelChain('extract')
    expect(chain.length).toBeGreaterThan(0)
    expect(chain[0].host.id).toBe('groq')
  })

  it('pickModelChain falls through to OpenAI when no Groq', () => {
    process.env.OPENAI_API_KEY = 'test-openai'
    const chain = pickModelChain('extract')
    expect(chain.length).toBeGreaterThan(0)
    expect(chain[0].host.id).toBe('openai')
  })

  it('pickModelChain returns empty when no providers', () => {
    const chain = pickModelChain('extract')
    expect(chain).toEqual([])
  })
})

describe('LongCat-primary drafting', () => {
  beforeEach(() => {
    delete process.env.LONGCAT_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  it('pickDraftChain starts with LongCat when configured', () => {
    process.env.LONGCAT_API_KEY = 'test-longcat'
    const chain = pickDraftChain()
    expect(chain.length).toBeGreaterThan(0)
    expect(chain[0].host.id).toBe('longcat')
  })

  it('pickDraftChain includes Groq as fallback', () => {
    process.env.LONGCAT_API_KEY = 'test-longcat'
    process.env.GROQ_API_KEY = 'test-groq'
    const chain = pickDraftChain()
    const ids = chain.map((s) => s.host.id)
    expect(ids).toContain('longcat')
    expect(ids).toContain('groq')
  })

  it('buildLongcatDraftChain includes Groq fallback', () => {
    process.env.LONGCAT_API_KEY = 'test-longcat'
    process.env.GROQ_API_KEY = 'test-groq'
    const chain = buildLongcatDraftChain()
    const ids = chain.map((s) => s.host.id)
    expect(ids[0]).toBe('longcat')
    expect(ids).toContain('groq')
  })

  it('buildOpenaiDraftChain starts with OpenAI', () => {
    process.env.OPENAI_API_KEY = 'test-openai'
    const chain = buildOpenaiDraftChain()
    expect(chain[0].host.id).toBe('openai')
  })
})

describe('shouldEscalateToPremium', () => {
  it('does not escalate when primary passed', () => {
    const result = shouldEscalateToPremium({
      primaryPassed: true,
      primaryScore: 8,
      isHighValue: false,
      malformedOutput: false,
      attemptCount: 1,
    })
    expect(result.shouldEscalate).toBe(false)
    expect(result.reason).toBe('')
  })

  it('escalates on malformed output after retries', () => {
    const result = shouldEscalateToPremium({
      primaryPassed: false,
      primaryScore: 0,
      isHighValue: false,
      malformedOutput: true,
      attemptCount: 2,
    })
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toBe('malformed_output_retries_exhausted')
  })

  it('escalates on high-value quality failure', () => {
    const result = shouldEscalateToPremium({
      primaryPassed: false,
      primaryScore: 3,
      isHighValue: true,
      malformedOutput: false,
      attemptCount: 1,
    })
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toBe('high_value_quality_failure')
  })

  it('escalates on low quality score', () => {
    const result = shouldEscalateToPremium({
      primaryPassed: false,
      primaryScore: 2,
      isHighValue: false,
      malformedOutput: false,
      attemptCount: 1,
    })
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toBe('quality_gate_failure')
  })

  it('does not escalate on borderline score that is not high-value', () => {
    const result = shouldEscalateToPremium({
      primaryPassed: false,
      primaryScore: 5,
      isHighValue: false,
      malformedOutput: false,
      attemptCount: 1,
    })
    expect(result.shouldEscalate).toBe(false)
  })
})

describe('hasProvider', () => {
  beforeEach(() => {
    delete process.env.GROQ_API_KEY
    delete process.env.LONGCAT_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.SCOUT_DEEPSEEK_ENABLED
    delete process.env.DEEPSEEK_API_KEY
  })

  it('returns false with no providers', () => {
    expect(hasProvider()).toBe(false)
  })

  it('returns true with Groq', () => {
    process.env.GROQ_API_KEY = 'test'
    expect(hasProvider()).toBe(true)
  })

  it('returns true with LongCat', () => {
    process.env.LONGCAT_API_KEY = 'test'
    expect(hasProvider()).toBe(true)
  })

  it('returns true with OpenAI', () => {
    process.env.OPENAI_API_KEY = 'test'
    expect(hasProvider()).toBe(true)
  })

  it('returns true with DeepSeek when enabled', () => {
    process.env.SCOUT_DEEPSEEK_ENABLED = '1'
    process.env.DEEPSEEK_API_KEY = 'test'
    expect(hasProvider()).toBe(true)
  })

  it('returns false with DeepSeek key but disabled', () => {
    process.env.DEEPSEEK_API_KEY = 'test'
    expect(hasProvider()).toBe(false)
  })
})

describe('Cost tier mapping', () => {
  beforeEach(() => {
    delete process.env.SCOUT_DEEPSEEK_ENABLED
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.LONGCAT_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  it('Groq extraction chain uses tier1 cost label', () => {
    process.env.GROQ_API_KEY = 'test-groq'
    const chain = pickModelChain('extract')
    expect(chain[0].costTier).toBe('tier1')
  })

  it('OpenAI escalation chain uses tier4 cost label', () => {
    process.env.OPENAI_API_KEY = 'test-openai'
    const chain = buildOpenaiDraftChain()
    expect(chain[0].costTier).toBe('tier4')
  })
})

describe('Cache behavior', () => {
  it('ContentCache returns null on miss', () => {
    const cache = new ContentCache<string>({ maxSize: 10, ttlMs: 1000 })
    expect(cache.get('nonexistent')).toBeNull()
  })

  it('ContentCache returns value on hit', () => {
    const cache = new ContentCache<string>({ maxSize: 10, ttlMs: 60000 })
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')
  })

  it('ContentCache evicts oldest when over max size', () => {
    const cache = new ContentCache<string>({ maxSize: 2, ttlMs: 60000 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')
    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBeNull()
    expect(cache.get('c')).toBe('3')
  })

  it('ContentCache respects TTL', async () => {
    const cache = new ContentCache<string>({ maxSize: 10, ttlMs: 10 })
    cache.set('key', 'value')
    await new Promise((r) => setTimeout(r, 20))
    expect(cache.get('key')).toBeNull()
  })
})

describe('Deduplication', () => {
  it('deduplicated reuses in-flight promise', async () => {
    let callCount = 0
    const fn = async () => {
      callCount += 1
      await new Promise((r) => setTimeout(r, 50))
      return 'result'
    }
    const [r1, r2] = await Promise.all([
      deduplicated('test-key', fn),
      deduplicated('test-key', fn),
    ])
    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(callCount).toBe(1)
  })
})

describe('Budget tracking', () => {
  it('tracks usage and reports summary', () => {
    budget.recordCost({
      feature: 'test',
      operation: 'extract',
      provider: 'groq',
      model: 'gpt-oss-20b',
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 200,
      cacheHit: false,
      retryCount: 0,
      fallback: false,
      estimatedCostUsd: 0.001,
      costTier: 'tier1',
    })
    const summary = budget.getUsageSummary()
    expect(summary.calls).toBeGreaterThanOrEqual(1)
    expect(summary.totalUsd).toBeGreaterThanOrEqual(0.001)
  })
})

describe('Genome deterministic default', () => {
  beforeEach(() => {
    delete process.env.SCOUT_GENOME_AI
  })

  it('genome uses deterministic path when SCOUT_GENOME_AI is not set', async () => {
    const result = await constructIdeaGenome({
      sourceMaterial: 'I built a React app last week that handles real-time data.',
      topic: 'React performance',
      profile: null,
      memories: [],
    })
    expect(result.genome.topic).toBe('React performance')
    expect(result.qualification.qualified).toBe(true)
  })
})

describe('Onboarding Extraction', () => {
  it('extracts role from LinkedIn text', () => {
    const identity = extractIdentityFromSource(
      'Senior Software Engineer at Acme Corp. I build React applications and lead a team of 5 developers. Expert in TypeScript, Node.js, and AWS.'
    )
    expect(identity.role).toBe('Senior Software Engineer')
    expect(identity.seniority).toBe('Senior')
    expect(identity.technologies.length).toBeGreaterThan(0)
  })

  it('extracts industries', () => {
    const identity = extractIdentityFromSource(
      'Building fintech products for SaaS companies. Working on eCommerce platforms and healthcare applications.'
    )
    expect(identity.industries.length).toBeGreaterThan(0)
    expect(identity.industries).toContain('FinTech')
    expect(identity.industries).toContain('SaaS')
  })

  it('suggests audiences based on role', () => {
    const identity = extractIdentityFromSource(
      'Staff Engineer at a tech company. I work on React, TypeScript, and system architecture.'
    )
    expect(identity.audiences.length).toBeGreaterThan(0)
  })

  it('suggests territories based on expertise', () => {
    const identity = extractIdentityFromSource(
      'Engineering leader building Rails and React applications. Focused on team productivity and shipping.'
    )
    expect(identity.territories.length).toBeGreaterThan(0)
  })

  it('extracts opinions from text', () => {
    const identity = extractIdentityFromSource(
      'I think most startups over-engineer too early. I believe Rails is still the best framework for rapid development.'
    )
    expect(identity.opinions.length).toBeGreaterThan(0)
  })

  it('handles minimal input gracefully', () => {
    const identity = extractIdentityFromSource('Developer')
    expect(identity).toBeDefined()
    expect(identity.role).toBe('Professional')
  })
})

describe('Quick Capture', () => {
  it('extracts technical lesson from debugging story', () => {
    const angles = parseQuickCapture('Spent 4 hours debugging a weird Redis connection issue')
    expect(angles.length).toBeGreaterThan(0)
    expect(angles[0].type).toBe('technical_lesson')
  })

  it('extracts lesson from learning story', () => {
    const angles = parseQuickCapture('Learned that microservices were the wrong choice for our team size')
    expect(angles.length).toBeGreaterThan(0)
  })

  it('extracts opinion from belief statement', () => {
    const angles = parseQuickCapture('I think AI coding assistants are overhyped')
    expect(angles.length).toBeGreaterThan(0)
    expect(angles[0].type).toBe('opinion')
  })

  it('provides fallback for unrecognized input', () => {
    const angles = parseQuickCapture('Hello world')
    expect(angles.length).toBeGreaterThan(0)
  })

  it('limits to 3 angles', () => {
    const angles = parseQuickCapture(
      'Spent all week debugging a race condition. Learned that testing is crucial. I think TDD is overrated. Client changed requirements again.'
    )
    expect(angles.length).toBeLessThanOrEqual(3)
  })
})

describe('Daily Ideas Generation', () => {
  it('generates ideas from expertise', () => {
    const profile = {
      id: 'p1', organizationId: 'org1', personaId: 'persona1',
      role: 'Software Engineer', seniority: 'Senior', industries: ['SaaS'],
      audience: 'engineers', expertise: [
        { area: 'React', level: 'expert' as const, evidence: '10 years experience', updatedAt: '2024-01-01' },
      ],
      technologies: [], goals: [], topicsCared: [], topicsAvoided: [],
      opinions: [], projects: [], experiences: [],
      writingCharacteristics: {}, storytellingTendencies: [],
      confidence: 0.5, lastLearnedAt: null, createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }
    const ideas = generateDailyIdeas({
      profile, clusters: [], history: [], memories: [], journey: [],
      contentGoals: ['build_authority'], audiences: ['engineers'], territories: ['React'],
    })
    expect(ideas.length).toBeGreaterThan(0)
    expect(ideas[0].title.toLowerCase()).toContain('react')
  })

  it('generates ideas from opinions', () => {
    const profile = {
      id: 'p1', organizationId: 'org1', personaId: 'persona1',
      role: 'Engineer', seniority: 'Senior', industries: [],
      audience: '', expertise: [],
      technologies: [], goals: [], topicsCared: [], topicsAvoided: [],
      opinions: [
        { belief: 'TypeScript is overrated', strength: 'moderate' as const, evidence: '', source: 'inference' as const, updatedAt: '2024-01-01' },
      ],
      projects: [], experiences: [],
      writingCharacteristics: {}, storytellingTendencies: [],
      confidence: 0.5, lastLearnedAt: null, createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }
    const ideas = generateDailyIdeas({
      profile, clusters: [], history: [], memories: [], journey: [],
      contentGoals: [], audiences: [], territories: [],
    })
    expect(ideas.some((i) => i.sourceKind === 'opinion')).toBe(true)
  })

  it('falls back to evergreen for sparse profiles', () => {
    const ideas = generateDailyIdeas({
      profile: null, clusters: [], history: [], memories: [], journey: [],
      contentGoals: [], audiences: [], territories: [],
    })
    expect(ideas.length).toBeGreaterThan(0)
    expect(ideas.every((i) => i.sourceKind === 'evergreen')).toBe(true)
  })

  it('diversifies territories', () => {
    const profile = {
      id: 'p1', organizationId: 'org1', personaId: 'persona1',
      role: 'Engineer', seniority: 'Senior', industries: [],
      audience: '', expertise: [
        { area: 'React', level: 'expert' as const, evidence: '', updatedAt: '2024-01-01' },
      ],
      technologies: [], goals: [], topicsCared: [], topicsAvoided: [],
      opinions: [
        { belief: 'TDD is overrated', strength: 'moderate' as const, evidence: '', source: 'inference' as const, updatedAt: '2024-01-01' },
      ],
      projects: [
        { name: 'Design System', description: '', role: '', outcome: 'Shipped', lessons: ['Reusable components save time'], updatedAt: '2024-01-01' },
      ],
      experiences: [
        { type: 'mistake' as const, description: 'Deployed on Friday', lesson: 'Never deploy on Friday', date: null, updatedAt: '2024-01-01' },
      ],
      writingCharacteristics: {}, storytellingTendencies: [],
      confidence: 0.5, lastLearnedAt: null, createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }
    const ideas = generateDailyIdeas({
      profile, clusters: [], history: [], memories: [], journey: [],
      contentGoals: [], audiences: [], territories: [],
    })
    const territories = new Set(ideas.map((i) => i.territory))
    expect(territories.size).toBeGreaterThan(1)
  })
})
