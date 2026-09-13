import { pickModelChain } from '@/lib/ai/routing'
import { structuredJsonChain } from '@/lib/ai/provider'

export interface OnboardingQuestion {
  id: string
  prompt: string
  kind: 'yes_no' | 'choice'
  options: string[]
}

interface OnboardingQuestionOutput {
  questions: Array<{
    prompt: string
    kind: 'yes_no' | 'choice'
    options: string[]
  }>
}

const QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'kind', 'options'],
        properties: {
          prompt: { type: 'string' },
          kind: { type: 'string', enum: ['yes_no', 'choice'] },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 5,
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const

/**
 * Generates a short set of tap-to-select onboarding questions tailored to
 * what a pasted profile suggests about this person's field — a technical
 * profile gets technical-flavored options, not a generic universal form.
 * Runs on the cheapest available host in the structuring chain; if none is
 * configured, returns an empty list and the caller falls back to free text.
 */
export async function generateOnboardingQuestions(profileInput: string): Promise<OnboardingQuestion[]> {
  const chain = pickModelChain('extract')
  if (chain.length === 0) return []

  const trimmed = profileInput.trim()
  if (!trimmed) return []

  const result = await structuredJsonChain<OnboardingQuestionOutput>(chain, {
    system: `You write short tap-to-select onboarding questions for a content-writing tool, based on a person's profile or bio.

Rules:
- Generate 3-5 questions that are specific to this person's actual field, tools, and role as shown in the profile. A software engineer gets questions about bugs/features/infra; a designer gets questions about critique/tools/process. Never output the same generic question set regardless of profile.
- Each question is either "yes_no" (options must be exactly ["Yes", "No"]) or "choice" (2-5 short, concrete, tappable options, each under 6 words).
- Do not invent facts about the person. Questions probe preference/opinion/what-they-do, they don't assert anything as already true.
- Keep each prompt to one short plain sentence, no jargon.`,
    user: `PROFILE OR BIO INPUT:\n"""\n${trimmed.slice(0, 9000)}\n"""`,
    schema: QUESTION_SCHEMA,
  })

  const questions = Array.isArray(result.data.questions) ? result.data.questions : []
  return questions
    .map((q, i) => ({
      id: `q${i + 1}`,
      prompt: String(q.prompt ?? '').trim(),
      kind: q.kind === 'yes_no' ? ('yes_no' as const) : ('choice' as const),
      options: (Array.isArray(q.options) ? q.options : [])
        .map((o) => String(o).trim())
        .filter(Boolean)
        .slice(0, 5),
    }))
    .filter((q) => q.prompt.length > 0 && q.options.length >= 2)
    .slice(0, 5)
}
