import { hasProvider } from '@/lib/ai/config'
import { generate } from '@/lib/ai/runtime'

export interface PersonaRefinementInput {
  currentHumorStyle: string
  currentValuesAndOpinions: string[]
  currentAdmiredExamples: string[]
  topicClusterNames: string[]
  recentFeedback: Array<{
    topicClusterName: string | null
    sourceKind: 'answer' | 'conviction' | 'field_update'
    reaction: 'posting' | 'not_for_me' | 'posting_after_edit'
    edited: boolean
    editSignals: string[]
  }>
}

export interface PersonaRefinementResult {
  humorStyle: string
  valuesAndOpinions: string[]
  admiredExamples: string[]
  focusShiftNote: string
}

interface RefinementOutput {
  humor_style: string
  values_and_opinions: string[]
  admired_examples: string[]
  focus_shift_note: string
}

const REFINEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['humor_style', 'values_and_opinions', 'admired_examples', 'focus_shift_note'],
  properties: {
    humor_style: { type: 'string' },
    values_and_opinions: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    admired_examples: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    focus_shift_note: { type: 'string' },
  },
} as const

/**
 * Runs a lightweight re-analysis of a persona's stored voice based on their
 * actual accept/reject behavior over time. Uses the cheapest available model
 * tier and is meant to be called periodically (after N reactions or weekly),
 * not on every single decision.
 */
export async function refinePersonaFromFeedback(input: PersonaRefinementInput): Promise<PersonaRefinementResult> {
  if (!hasProvider()) {
    return {
      humorStyle: input.currentHumorStyle,
      valuesAndOpinions: input.currentValuesAndOpinions,
      admiredExamples: input.currentAdmiredExamples,
      focusShiftNote: '',
    }
  }

  const accepted = input.recentFeedback.filter((f) => f.reaction === 'posting' || f.reaction === 'posting_after_edit')
  const rejected = input.recentFeedback.filter((f) => f.reaction === 'not_for_me')
  const edited = input.recentFeedback.filter((f) => f.edited)

  const acceptedTopics = accepted.map((f) => f.topicClusterName).filter(Boolean)
  const rejectedTopics = rejected.map((f) => f.topicClusterName).filter(Boolean)

  const allEditSignals = edited.flatMap((f) => f.editSignals)

  const summary = [
    `Current humor style: ${input.currentHumorStyle || 'not set'}`,
    `Current convictions: ${(input.currentValuesAndOpinions || []).join(' | ') || 'none'}`,
    `Admired post styles: ${(input.currentAdmiredExamples || []).join(' | ') || 'none'}`,
    `Active focus areas: ${(input.topicClusterNames || []).join(', ') || 'none'}`,
    `Recently accepted posts tended to be about: ${[...new Set(acceptedTopics)].join(', ') || 'n/a'}`,
    `Recently skipped posts tended to be about: ${[...new Set(rejectedTopics)].join(', ') || 'n/a'}`,
    `Frequent edit patterns: ${[...new Set(allEditSignals)].join(', ') || 'none'}`,
    `Total accepted: ${accepted.length}, skipped: ${rejected.length}, edited before posting: ${edited.length}`,
  ].join('\n')

  const result = await generate<RefinementOutput>({
    task: 'FAST_STRUCTURED',
    system: `You refine a content persona's stored voice profile based on what the person actually chose to post versus skip over time.

Rules:
- Make small, conservative adjustments. Do not throw away the existing profile and start over.
- Only shift humor_style if the accept/reject pattern clearly supports it (e.g., consistently skipping "playful" posts suggests a more serious tone).
- Update values_and_opinions only when a clear new conviction emerges from what they kept posting about.
- admired_examples should reflect the writing style of posts they actually accepted.
- Keep every string short and plain. No jargon.
- focus_shift_note is one plain sentence summarizing what changed and why, or "No clear shift yet." if behavior is still ambiguous.`,
    user: `PERSONA BEHAVIOR SUMMARY:\n"""\n${summary}\n"""\n\nProduce a refined but conservative profile update.`,
    schema: REFINEMENT_SCHEMA,
    maxTokens: 1024,
  })

  return {
    humorStyle: (result.data.humor_style ?? input.currentHumorStyle).trim(),
    valuesAndOpinions: (Array.isArray(result.data.values_and_opinions) ? result.data.values_and_opinions : input.currentValuesAndOpinions)
      .map((v) => String(v).trim()).filter(Boolean).slice(0, 8),
    admiredExamples: (Array.isArray(result.data.admired_examples) ? result.data.admired_examples : input.currentAdmiredExamples)
      .map((v) => String(v).trim()).filter(Boolean).slice(0, 5),
    focusShiftNote: (result.data.focus_shift_note ?? '').trim(),
  }
}
