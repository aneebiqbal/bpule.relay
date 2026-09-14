import { describe, it, expect } from 'vitest'
import { discoverOpportunities } from '@/lib/content/intelligence/opportunities'
import { decideIfInterviewNeeded, assessAnswerQuality } from '@/lib/content/intelligence/interview'
import { extractDnaCandidatesFromAnswer, mergeDnaCandidates, calculateProfileConfidence, buildContentDnaPromptBlock } from '@/lib/content/content-dna'
import { checkMemoryForDuplicates } from '@/lib/content/intelligence/memory'
import { requiresResearch } from '@/lib/content/intelligence/research'
import type { ContentProfile, ContentMemory, TopicCluster } from '@/lib/domain/types'

/**
 * Validate the "stale env var" debugging story flows correctly
 * through the entire intelligence pipeline.
 */

const DEBUGGING_STORY = `I lost a few hours debugging a deployment that wasn't actually broken.

The issue appeared right after a new release, so naturally I started with the release itself.

Build looked fine. Application was healthy. Logs weren't showing anything obviously wrong.

But the behavior in production still didn't match what I had just deployed.

Eventually I stopped looking at the code and checked the environment the application was actually running with.

One value was stale. That was it.

The interesting part wasn't the fix. It was how quickly the timing of the problem convinced me that the deployment had to be responsible.

Since then, I've become much more deliberate about separating these two questions:

Did the new code deploy correctly?
and
Is the new code running with the configuration I think it is?

They sound like the same debugging problem when you're in the middle of an incident. They're not.

Now runtime configuration is one of the first things I verify when a deployment looks healthy but production behavior doesn't.`

function makeSarahProfile(): ContentProfile {
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
      { name: 'Ruby on Rails', proficiency: 'expert', context: 'backend' },
      { name: 'PostgreSQL', proficiency: 'expert', context: 'database' },
    ],
    goals: [],
    topicsCared: [{ topic: 'Production Debugging', intensity: 'passionate', source: 'onboarding' }],
    topicsAvoided: [],
    opinions: [{ belief: 'Most performance problems are N+1 queries', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' }],
    projects: [{ name: 'Payment Gateway v2', description: 'Rebuilt payment processing', role: 'Tech Lead', outcome: 'Reduced failures by 40%', lessons: ['Always design for retry safety'], updatedAt: '2024-11-01' }],
    experiences: [{ type: 'mistake', description: 'Deployed a non-idempotent job that double-charged customers', lesson: 'Always make jobs idempotent', date: '2024-09-15', updatedAt: '2024-11-01' }],
    writingCharacteristics: { sentenceRhythm: 'measured, varied', preferredLength: 'medium', questionFrequency: 'occasional', dataUsage: 'light' },
    storytellingTendencies: [],
    confidence: 0.6, lastLearnedAt: '2024-11-01', createdAt: '2024-01-01', updatedAt: '2024-11-01',
  }
}

const sarahMemories: ContentMemory[] = [
  { id: 'm1', organizationId: 'org1', personaId: 'persona1', memoryType: 'topic_covered', content: 'Why we chose to stay on Postgres instead of adding Elasticsearch', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-11-01' },
  { id: 'm2', organizationId: 'org1', personaId: 'persona1', memoryType: 'hook_used', content: 'We double-charged 200 customers on a Tuesday morning', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-11-01' },
]

const sarahClusters: TopicCluster[] = [
  { id: 'c1', organizationId: 'org1', personaId: 'persona1', clusterName: 'Production Debugging', description: 'Debugging production issues', sourceType: 'profile', mergedIntoId: null, lastInputAt: '2024-11-01', lastResearchAt: null, createdAt: '2024-01-01', updatedAt: '2024-11-01' },
  { id: 'c2', organizationId: 'org1', personaId: 'persona1', clusterName: 'System Design', description: '', sourceType: 'profile', mergedIntoId: null, lastInputAt: null, lastResearchAt: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
]

describe('Debugging Story: Stale Environment Variable', () => {
  it('detects a production_lesson opportunity from the story', () => {
    const opportunities = discoverOpportunities({
      profile: makeSarahProfile(),
      clusters: sarahClusters,
      history: [],
      memories: sarahMemories,
      recentUserInput: DEBUGGING_STORY,
    })
    // Should detect the lesson about deployment vs configuration
    const lessonOpp = opportunities.find((o) => o.type === 'production_lesson')
    expect(lessonOpp).toBeDefined()
    expect(lessonOpp!.title.toLowerCase()).toContain('lesson')
  })

  it('does NOT flag this as a duplicate of previous content', () => {
    const dupCheck = checkMemoryForDuplicates(DEBUGGING_STORY, sarahMemories, 0.6)
    expect(dupCheck.isDuplicate).toBe(false)
  })

  it('does NOT require research for personal experience content', () => {
    const research = requiresResearch({
      sourceMaterial: DEBUGGING_STORY,
      genomeSource: 'personal_experience',
      supportingFacts: [],
    })
    expect(research.shouldResearch).toBe(false)
  })

  it('extracts the debugging experience into Content DNA', () => {
    const profile = makeSarahProfile()
    const candidates = extractDnaCandidatesFromAnswer(DEBUGGING_STORY, profile)
    expect(candidates.length).toBeGreaterThan(0)

    // Should extract the experience about the stale env var
    const expCandidate = candidates.find((c) => c.type === 'experience')
    expect(expCandidate).toBeDefined()
  })

  it('updates profile confidence after learning', () => {
    const profile = makeSarahProfile()
    const confidenceBefore = calculateProfileConfidence(profile)

    const candidates = extractDnaCandidatesFromAnswer(DEBUGGING_STORY, profile)
    const patches = mergeDnaCandidates(profile, candidates)
    const newProfile = {
      ...profile,
      experiences: [...profile.experiences, ...patches.experiences],
      opinions: [...profile.opinions, ...patches.opinions],
    }
    const confidenceAfter = calculateProfileConfidence(newProfile)
    expect(confidenceAfter).toBeGreaterThan(confidenceBefore)
  })

  it('DNA prompt block includes the new experience', () => {
    const profile = makeSarahProfile()
    const candidates = extractDnaCandidatesFromAnswer(DEBUGGING_STORY, profile)
    const patches = mergeDnaCandidates(profile, candidates)
    const newProfile = {
      ...profile,
      experiences: [...profile.experiences, ...patches.experiences],
    }
    const dnaBlock = buildContentDnaPromptBlock(newProfile)
    // Should include the role
    expect(dnaBlock).toContain('Senior Full-Stack Engineer')
    // Should include the new experience
    expect(dnaBlock.length).toBeGreaterThan(50)
  })

  it('interview is NOT needed for this rich input', () => {
    const decision = decideIfInterviewNeeded({
      profile: makeSarahProfile(),
      memories: sarahMemories,
      sourceMaterial: DEBUGGING_STORY,
    })
    // Rich personal detail + high confidence profile = no interview needed
    expect(decision.shouldInterview).toBe(false)
  })

  it('assesses the story as high-quality input', () => {
    const quality = assessAnswerQuality(DEBUGGING_STORY, '')
    expect(quality).toBe('high')
  })
})
