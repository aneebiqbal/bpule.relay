import { describe, it, expect } from 'vitest'
import { runContentForge, type ForgeInput } from '@/lib/content/intelligence/forge'
import { buildContentDnaPromptBlock } from '@/lib/content/content-dna'
import { buildMemoryPromptBlock } from '@/lib/content/intelligence/memory'
import type { ContentProfile, ContentMemory } from '@/lib/domain/types'

/**
 * Test the forge pipeline with premium writing rules.
 * These tests validate that the pipeline produces high-quality output
 * without requiring model calls (using the demo/no-provider path).
 */

function makeProfile(): ContentProfile {
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

function makeMemories(): ContentMemory[] {
  return [
    { id: 'm1', organizationId: 'org1', personaId: 'persona1', memoryType: 'topic_covered', content: 'Why we chose to stay on Postgres instead of adding Elasticsearch', sourceDraftId: null, sourceHistoryId: null, createdAt: '2024-11-01' },
  ]
}

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

describe('Forge Pipeline: Premium Writing Integration', () => {
  const profile = makeProfile()
  const memories = makeMemories()

  it('includes visual concept in forge result', async () => {
    const contentDnaBlock = buildContentDnaPromptBlock(profile)
    const memoryBlock = buildMemoryPromptBlock(memories)

    const forgeInput: ForgeInput = {
      personaName: 'Sarah Chen',
      platform: 'linkedin',
      sourceMaterial: DEBUGGING_STORY,
      styleCard: 'Direct, technical, no fluff.',
      humorStyle: 'dry',
      valuesAndOpinions: ['Most performance problems are N+1 queries'],
      contentDnaBlock,
      genomeBlock: 'Angle: The timing of a failure can mislead the investigation. Source: personal_experience.',
      memoryBlock,
      recentOpenings: [],
      generationMode: 'personal',
    }

    const result = await runContentForge(forgeInput)
    expect(result.visualConcept).toBeDefined()
    expect(result.visualConcept!.visualIdea.length).toBeGreaterThan(10)
    expect(result.visualConcept!.imagePrompt.length).toBeGreaterThan(20)
  })

  it('selects a structure for the content', async () => {
    const contentDnaBlock = buildContentDnaPromptBlock(profile)
    const memoryBlock = buildMemoryPromptBlock(memories)

    const forgeInput: ForgeInput = {
      personaName: 'Sarah Chen',
      platform: 'linkedin',
      sourceMaterial: DEBUGGING_STORY,
      styleCard: null,
      humorStyle: '',
      valuesAndOpinions: [],
      contentDnaBlock,
      genomeBlock: 'Angle: Deployment debugging lesson. Source: personal_experience.',
      memoryBlock,
      recentOpenings: [],
      generationMode: 'personal',
    }

    const result = await runContentForge(forgeInput)
    expect(result.structure).toBeDefined()
    expect(typeof result.structure).toBe('string')
  })

  it('visual concept is not generic stock imagery', async () => {
    const contentDnaBlock = buildContentDnaPromptBlock(profile)
    const memoryBlock = buildMemoryPromptBlock(memories)

    const forgeInput: ForgeInput = {
      personaName: 'Sarah Chen',
      platform: 'linkedin',
      sourceMaterial: DEBUGGING_STORY,
      styleCard: null,
      humorStyle: '',
      valuesAndOpinions: [],
      contentDnaBlock,
      genomeBlock: 'Angle: Stale config debugging. Source: personal_experience.',
      memoryBlock,
      recentOpenings: [],
      generationMode: 'personal',
    }

    const result = await runContentForge(forgeInput)
    const prompt = result.visualConcept!.imagePrompt.toLowerCase()
    // The negative constraints section lists exclusions — verify no generic subjects appear BEFORE it
    const beforeConstraints = prompt.slice(0, prompt.indexOf('no people'))
    expect(beforeConstraints).not.toMatch(/\blaptop\b/i)
    expect(beforeConstraints).not.toMatch(/\brobot\b/i)
    expect(beforeConstraints).not.toMatch(/stock\s+photo/i)
    expect(beforeConstraints).not.toContain('ai brain')
    expect(beforeConstraints).not.toContain('floating code')
  })

  it('result includes evaluation scores', async () => {
    const contentDnaBlock = buildContentDnaPromptBlock(profile)
    const memoryBlock = buildMemoryPromptBlock(memories)

    const forgeInput: ForgeInput = {
      personaName: 'Sarah Chen',
      platform: 'linkedin',
      sourceMaterial: DEBUGGING_STORY,
      styleCard: null,
      humorStyle: '',
      valuesAndOpinions: [],
      contentDnaBlock,
      genomeBlock: 'Angle: Debugging lesson. Source: personal_experience.',
      memoryBlock,
      recentOpenings: [],
      generationMode: 'personal',
    }

    const result = await runContentForge(forgeInput)
    expect(result.evaluation.quality).toBeGreaterThanOrEqual(0)
    expect(result.evaluation.specificity).toBeGreaterThanOrEqual(0)
    expect(result.evaluation.slopScore).toBeGreaterThanOrEqual(0)
  })
})
