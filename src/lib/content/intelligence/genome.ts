import type {
  ContentIdeaGenome,
  IdeaGenomeSource,
  IdeaGenomeArchetype,
  ContentProfile,
  ContentMemory,
  ContentOpportunity,
} from '@/lib/domain/types'
import { generate } from '@/lib/ai/runtime'
import { ContentCache } from '@/lib/ai/cache'
import { classifyClaimProvenance } from '@/lib/content/intelligence/research'

const genomeCache = new ContentCache<GenomeConstructionResult>({ maxSize: 100, ttlMs: 24 * 60 * 60 * 1000, version: 'genome-v2' })

/**
 * Idea Genome + Opportunity Qualification.
 *
 * Before serious drafting, every qualified idea gets a structured genome.
 * The genome is used throughout generation and evaluation.
 */

export interface GenomeInput {
  sourceMaterial: string
  topic: string
  profile: ContentProfile | null
  memories: ContentMemory[]
  opportunity?: ContentOpportunity | null
  interviewAnswers?: string[]
}

export interface GenomeConstructionResult {
  genome: {
    source: IdeaGenomeSource
    topic: string
    angle: string
    archetype: IdeaGenomeArchetype
    audience: string
    emotion: string
    valueType: 'practical' | 'emotional' | 'intellectual' | 'social'
    supportingFacts: string[]
    personalEvidence: string[]
  }
  qualification: {
    novelty: number
    evidenceStrength: number
    personalSpecificity: number
    relevance: number
    conversationPotential: number
    scrollStopPotential: number
    qualified: boolean
    rejectionReason: string
  }
}

/**
 * Construct an idea genome from material + context.
 *
 * Default: deterministic construction (no model call). Set SCOUT_GENOME_AI=1
 * to enable AI-assisted genome construction for ambiguous material.
 */
export async function constructIdeaGenome(input: GenomeInput): Promise<GenomeConstructionResult> {
  const cacheKey = `${input.sourceMaterial.slice(0, 500)}|${input.topic}|${input.profile?.role ?? ''}|${input.interviewAnswers?.join('|') ?? ''}`
  const cached = genomeCache.get(cacheKey)
  if (cached) return cached

  const useAi = process.env.SCOUT_GENOME_AI === '1'

  if (!useAi) {
    const result = constructGenomeDeterministic(input)
    genomeCache.set(cacheKey, result)
    return result
  }

  const profileSummary = input.profile
    ? [
        input.profile.role ? `Role: ${input.profile.role} (${input.profile.seniority})` : '',
        input.profile.expertise.length > 0 ? `Expertise: ${input.profile.expertise.slice(0, 4).map((e) => `${e.area} (${e.level})`).join(', ')}` : '',
        input.profile.audience ? `Audience: ${input.profile.audience}` : '',
      ].filter(Boolean).join('\n')
    : 'No profile available.'

  const memoryContext = input.memories.length > 0
    ? input.memories.slice(0, 8).map((m) => `- ${m.memoryType}: ${m.content}`).join('\n')
    : 'No previous content recorded.'

  const result = await generate<{
    source: string
    topic: string
    angle: string
    archetype: string
    audience: string
    emotion: string
    value_type: string
    supporting_facts: string[]
    personal_evidence: string[]
    novelty: number
    evidence_strength: number
    personal_specificity: number
    relevance: number
    conversation_potential: number
    scroll_stop_potential: number
    qualified: boolean
    rejection_reason: string
  }>({
    task: 'FAST_STRUCTURED',
    system: `You analyze a content idea and produce a structured genome for generation.

Rules:
- source must be one of: personal_experience, professional_expertise, opinion, industry_observation, contrarian_take, lesson_learned, behind_the_build, customer_insight, experiment_result
- archetype must be one of: story_to_lesson, lesson_direct, contrarian_stand, how_to, behind_the_scenes, hot_take, data_driven, question_engagement, mistake_to_wins, career_lesson
- value_type must be one of: practical, emotional, intellectual, social
- emotion: one word describing the emotional hook (e.g. curiosity, surprise, recognition, challenge, empathy)
- Score 0-1 for novelty, evidence_strength, personal_specificity, relevance, conversation_potential, scroll_stop_potential
- If personal_specificity < 0.4, set qualified=false and explain why in rejection_reason
- If evidence_strength < 0.3, set qualified=false and explain why
- supporting_facts: specific claims or data that support the post
- personal_evidence: concrete details that make this attributable to THIS person
- Never invent personal experiences, metrics, or customers`,
    user: `PERSON PROFILE:
${profileSummary}

PREVIOUS CONTENT MEMORY:
${memoryContext}

${input.opportunity ? `OPPORTUNITY: ${input.opportunity.title}\n${input.opportunity.description}` : ''}

SOURCE MATERIAL:
"""
${input.sourceMaterial.slice(0, 800)}
"""

${input.interviewAnswers?.length ? `INTERVIEW ANSWERS:\n${input.interviewAnswers.map((a, i) => `A${i + 1}: ${a}`).join('\n')}` : ''}

Construct the genome and qualify this idea.`,
    schema: {
      type: 'object',
      required: ['source', 'topic', 'angle', 'archetype', 'audience', 'emotion', 'value_type', 'supporting_facts', 'personal_evidence', 'novelty', 'evidence_strength', 'personal_specificity', 'relevance', 'conversation_potential', 'scroll_stop_potential', 'qualified', 'rejection_reason'],
      properties: {
        source: { type: 'string' },
        topic: { type: 'string' },
        angle: { type: 'string' },
        archetype: { type: 'string' },
        audience: { type: 'string' },
        emotion: { type: 'string' },
        value_type: { type: 'string' },
        supporting_facts: { type: 'array', items: { type: 'string' } },
        personal_evidence: { type: 'array', items: { type: 'string' } },
        novelty: { type: 'number' },
        evidence_strength: { type: 'number' },
        personal_specificity: { type: 'number' },
        relevance: { type: 'number' },
        conversation_potential: { type: 'number' },
        scroll_stop_potential: { type: 'number' },
        qualified: { type: 'boolean' },
        rejection_reason: { type: 'string' },
      },
    },
    maxTokens: 2048,
  })

  const d = result.data
  const output = {
    genome: {
      source: validateSource(d.source),
      topic: (d.topic ?? input.topic ?? 'General').trim(),
      angle: (d.angle ?? 'personal observation').trim(),
      archetype: validateArchetype(d.archetype),
      audience: (d.audience ?? input.profile?.audience ?? 'professionals').trim(),
      emotion: (d.emotion ?? 'curiosity').trim(),
      valueType: validateValueType(d.value_type),
      supportingFacts: Array.isArray(d.supporting_facts) ? d.supporting_facts.filter(Boolean).slice(0, 5) : [],
      personalEvidence: Array.isArray(d.personal_evidence) ? d.personal_evidence.filter(Boolean).slice(0, 5) : [],
    },
    qualification: {
      novelty: clamp01(d.novelty),
      evidenceStrength: clamp01(d.evidence_strength),
      personalSpecificity: clamp01(d.personal_specificity),
      relevance: clamp01(d.relevance),
      conversationPotential: clamp01(d.conversation_potential),
      scrollStopPotential: clamp01(d.scroll_stop_potential),
      qualified: d.qualified && clamp01(d.personal_specificity) >= 0.4 && clamp01(d.evidence_strength) >= 0.3,
      rejectionReason: d.rejection_reason ?? '',
    },
  }
  genomeCache.set(`${input.sourceMaterial.slice(0, 500)}|${input.topic}|${input.profile?.role ?? ''}|${input.interviewAnswers?.join('|') ?? ''}`, output)
  return output
}

function constructGenomeDeterministic(input: GenomeInput): GenomeConstructionResult {
  const source = classifySource(input.sourceMaterial)
  const archetype = classifyArchetype(input.sourceMaterial)
  const hasPersonalDetail = /\b(i|we|my|our|today|yesterday|last week|spent|built|shipped|fixed|debugged|learned|decided)\b/i.test(input.sourceMaterial)
  const hasEvidence = /\b\d|percent|%|x faster|saved|reduced|increased|measured|data|result/i.test(input.sourceMaterial)

  // Include interview answers as personal evidence — they contain the user's
  // specific experiences, decisions, and lessons that make content attributable.
  const interviewEvidence = (input.interviewAnswers ?? [])
    .filter((a) => a.trim().length > 10)
    .map((a) => a.trim().slice(0, 200))

  const allEvidence = [
    ...(hasPersonalDetail ? [input.sourceMaterial.trim().slice(0, 200)] : []),
    ...interviewEvidence,
  ]

  const combinedHasPersonal = hasPersonalDetail || interviewEvidence.length > 0

  return {
    genome: {
      source,
      topic: input.topic,
      angle: 'personal observation',
      archetype,
      audience: input.profile?.audience ?? 'professionals',
      emotion: 'curiosity',
      valueType: 'practical',
      supportingFacts: interviewEvidence.slice(0, 3),
      personalEvidence: allEvidence,
    },
    qualification: {
      novelty: 0.6,
      evidenceStrength: hasEvidence ? 0.7 : 0.3,
      personalSpecificity: combinedHasPersonal ? 0.7 : 0.3,
      relevance: 0.6,
      conversationPotential: 0.5,
      scrollStopPotential: combinedHasPersonal ? 0.6 : 0.4,
      qualified: combinedHasPersonal,
      rejectionReason: combinedHasPersonal ? '' : 'No personal detail or experience found in source material or interview answers.',
    },
  }
}

function classifySource(material: string): IdeaGenomeSource {
  const lower = material.toLowerCase()
  if (/\b(i think|i believe|my opinion|hot take|controversial)\b/.test(lower)) return 'opinion'
  if (/\b(learned|lesson|mistake|realized|discovered|turns out)\b/.test(lower)) return 'lesson_learned'
  if (/\b(built|shipped|created|launched|deployed|migrated|refactored)\b/.test(lower)) return 'behind_the_build'
  if (/\b(customer|client|user|they were|their team)\b/.test(lower)) return 'customer_insight'
  if (/\b(experiment|tested|measured|a\/b|hypothesis)\b/.test(lower)) return 'experiment_result'
  if (/\b(industry|market|trend|everyone is|the field)\b/.test(lower)) return 'industry_observation'
  return 'personal_experience'
}

function classifyArchetype(material: string): IdeaGenomeArchetype {
  const lower = material.toLowerCase()
  if (/\b(learned|lesson|mistake|turns out)\b/.test(lower)) return 'story_to_lesson'
  if (/\b(how to|here\'s how|steps to|guide|framework)\b/.test(lower)) return 'how_to'
  if (/\b(i think|i believe|unpopular|controversial|hot take)\b/.test(lower)) return 'contrarian_stand'
  if (/\b(built|shipped|created|deployed)\b/.test(lower)) return 'behind_the_scenes'
  if (/\b(data|measured|percent|%|numbers|stats)\b/.test(lower)) return 'data_driven'
  return 'lesson_direct'
}

function validateSource(s: string): IdeaGenomeSource {
  const valid: IdeaGenomeSource[] = [
    'personal_experience', 'professional_expertise', 'opinion',
    'industry_observation', 'contrarian_take', 'lesson_learned',
    'behind_the_build', 'customer_insight', 'experiment_result',
  ]
  return valid.includes(s as IdeaGenomeSource) ? s as IdeaGenomeSource : 'personal_experience'
}

function validateArchetype(a: string): IdeaGenomeArchetype {
  const valid: IdeaGenomeArchetype[] = [
    'story_to_lesson', 'lesson_direct', 'contrarian_stand',
    'how_to', 'behind_the_scenes', 'hot_take', 'data_driven',
    'question_engagement', 'mistake_to_wins', 'career_lesson',
  ]
  return valid.includes(a as IdeaGenomeArchetype) ? a as IdeaGenomeArchetype : 'lesson_direct'
}

function validateValueType(v: string): 'practical' | 'emotional' | 'intellectual' | 'social' {
  return (['practical', 'emotional', 'intellectual', 'social'].includes(v)) ? v as 'practical' : 'practical'
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Build a prompt block for generation from the genome.
 */
export function buildGenomePromptBlock(genome: GenomeConstructionResult['genome'], sourceMaterial?: string): string {
  const parts: string[] = [
    `IDEA: ${genome.topic}`,
    `ANGLE: ${genome.angle}`,
    `ARCHETYPE: ${genome.archetype.replace(/_/g, ' ')}`,
    `AUDIENCE: ${genome.audience}`,
    `EMOTION: ${genome.emotion}`,
    `VALUE: ${genome.valueType}`,
  ]
  if (genome.personalEvidence.length > 0) {
    parts.push(`PERSONAL EVIDENCE (use this, do not invent):\n${genome.personalEvidence.map((e) => `- ${e}`).join('\n')}`)
  }
  if (genome.supportingFacts.length > 0) {
    const factsWithProvenance = genome.supportingFacts.map((f) => {
      const provenance = classifyClaimProvenance(f, false, sourceMaterial?.includes(f) ?? false)
      return `- ${f} [${provenance}]`
    })
    parts.push(`SUPPORTING FACTS (with provenance):\n${factsWithProvenance.join('\n')}`)
  }
  return parts.join('\n')
}
