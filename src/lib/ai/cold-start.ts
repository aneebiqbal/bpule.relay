import { hasProvider } from '@/lib/ai/config'
import { generate } from '@/lib/ai/runtime'

export interface ColdStartAnswer {
  questionId: string
  prompt: string
  selectedOption: string
  typedInput?: string
}

export interface ColdStartQuestion {
  id: string
  prompt: string
  kind: 'yes_no' | 'choice'
  options: string[]
  depth: number
  done: boolean
}

interface ColdStartOutput {
  prompt: string
  kind: 'yes_no' | 'choice'
  options: string[]
  done: boolean
}

const COLD_START_SCHEMA = {
  type: 'object',
  required: ['prompt', 'kind', 'options', 'done'],
  properties: {
    prompt: { type: 'string' },
    kind: { type: 'string', enum: ['yes_no', 'choice'] },
    options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
    done: { type: 'boolean' },
  },
} as const

const MAX_DEPTH = 6

/**
 * Generates the next cold-start question adaptively, based on all previous
 * answers. Starts broad (what they do day-to-day) and narrows with each
 * response. Returns done=true when enough signal has been gathered to build a
 * usable initial voice and topic profile.
 *
 * This is the deeper replacement for the short fixed no-history sequence — it
 * follows the same adaptive principle used elsewhere, applied more thoroughly
 * because there's no pasted writing to lean on.
 */
export async function generateColdStartQuestion(args: {
  profileInput: string
  previousAnswers: ColdStartAnswer[]
  depth: number
}): Promise<ColdStartQuestion> {
  if (!hasProvider() || args.depth >= MAX_DEPTH) {
    return { id: `cs${args.depth}`, prompt: '', kind: 'choice', options: [], depth: args.depth, done: true }
  }

  const answerHistory = args.previousAnswers
    .map((a, i) => {
      const answer = a.typedInput?.trim() || a.selectedOption
      return `Q${i + 1}: ${a.prompt}\nA: ${answer}`
    })
    .join('\n')

  const profileContext = args.profileInput.trim()
    ? `Initial profile/bio (may be brief):\n"""\n${args.profileInput.trim().slice(0, 4000)}\n"""`
    : 'No profile or bio was provided — ask broadly to establish who this person is and what they do.'

  const result = await generate<ColdStartOutput>({
    task: 'FAST_STRUCTURED',
    system: `You conduct an adaptive tap-first onboarding interview for a content-writing tool, for someone with NO past posts to analyze. Each question must be generated from the previous answers — never follow a fixed script.

Rules:
- Start broad (what they actually do, day-to-day), then narrow based on each answer. If they say "I'm an engineer," next ask what kind of work. If they say "infrastructure," next ask what decisions eat their time.
- Each question should go ONE level deeper than the last answer.
- Every question is tap-to-select: "yes_no" with options ["Yes", "No"], or "choice" with 2-5 concrete tappable options (each under 6 words), plus the person can always type their own answer.
- After 5-6 answers covering: (1) what they do, (2) their field/tools, (3) what they have opinions about, (4) what kind of writing they admire, (5) their tone — return done: true.
- Keep each prompt to ONE short plain sentence. No jargon. No explaining what you are doing.
- Do not invent facts about the person. Probe preference and experience, never assert.
- If no profile was provided, start extremely broad: "Which of these sounds most like your day-to-day?"`,
    user: `${profileContext}\n\nINTERVIEW SO FAR (${args.previousAnswers.length} answers, depth ${args.depth}):\n${answerHistory || '(none yet — this is the first question)'}\n\nGenerate the NEXT single question.`,
    schema: COLD_START_SCHEMA,
    maxTokens: 512,
  })

  const done = result.data.done || args.depth >= MAX_DEPTH - 1
  const prompt = (result.data.prompt ?? '').trim()
  const options = (Array.isArray(result.data.options) ? result.data.options : [])
    .map((o) => String(o).trim()).filter(Boolean).slice(0, 5)

  return {
    id: `cs${args.depth}-${Date.now()}`,
    prompt,
    kind: result.data.kind === 'yes_no' ? 'yes_no' : 'choice',
    options: options.length >= 2 ? options : (result.data.kind === 'yes_no' ? ['Yes', 'No'] : []),
    depth: args.depth,
    done: done || prompt.length === 0 || options.length < 2,
  }
}
