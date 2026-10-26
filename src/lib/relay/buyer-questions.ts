/**
 * Explicit buyer questions.
 *
 * A reply that asks three things and gets one answered is a failed reply
 * (REL-QA-009). Before generating, every requested topic is extracted into a
 * plan; after generation, each topic is checked for coverage. The generator is
 * told the plan, and a draft that leaves an explicit buyer question unaddressed
 * fails the quality gate.
 */

export type BuyerQuestionTopic =
  | 'experience'
  | 'timeline'
  | 'availability'
  | 'pricing'
  | 'process'
  | 'team'
  | 'other'

export type BuyerQuestionStatus = 'ANSWERED' | 'ASK_CLARIFICATION' | 'NEEDS_VERIFICATION' | 'PENDING'

export interface BuyerQuestion {
  topic: BuyerQuestionTopic
  /** The question as the buyer asked it. */
  text: string
  status: BuyerQuestionStatus
}

/** Topic detectors. Order matters: the first match wins. */
const TOPIC_PATTERNS: ReadonlyArray<{ topic: BuyerQuestionTopic; pattern: RegExp }> = [
  { topic: 'pricing', pattern: /\b(price|pricing|cost|rate|budget|how much|quote|ballpark)\b/i },
  { topic: 'availability', pattern: /\b(availab|are you free|can you take|capacity|next week|when are you|start date|kick ?off)\b/i },
  { topic: 'timeline', pattern: /\b(timeline|how long|deliver|estimate|turn ?around|deadline|when can|launch|roll ?out)\b/i },
  { topic: 'experience', pattern: /\b(experience|worked with|portfolio|case stud|past project|reference|similar project|relevant)\b/i },
  { topic: 'process', pattern: /\b(process|how do you work|approach|methodology|workflow|engagement model)\b/i },
  { topic: 'team', pattern: /\b(team|who would|which developer|designer|engineer|resourcing)\b/i },
]

const QUESTION_MARKER = /\?|\b(can you|could you|do you|would you|what|how|when|where|are you|have you|is it)\b/i

/** Words that must appear in the draft for a topic to count as addressed. */
const TOPIC_COVERAGE_KEYWORDS: Record<BuyerQuestionTopic, readonly string[]> = {
  experience: ['experience', 'worked', 'portfolio', 'case stud', 'project', 'client', 'built', 'delivered', 'similar'],
  timeline: ['week', 'weeks', 'month', 'months', 'timeline', 'deliver', 'estimate', 'start', 'phase', 'schedule'],
  availability: ['availab', 'next week', 'capacity', 'free', 'schedule', 'coordinate', 'time next week', 'window'],
  pricing: ['price', 'pricing', 'cost', 'rate', 'budget', 'quote', 'investment', 'fee'],
  process: ['process', 'approach', 'workflow', 'step', 'sprint', 'discovery', 'methodology'],
  team: ['team', 'developer', 'designer', 'engineer', 'specialist', 'who works'],
  other: [],
}

const CLARIFICATION_MARKER = /\?|\b(what|which|when|how many|could you clarify|can you clarify)\b/i

/**
 * Every explicit question in a buyer message, with its topic. Deterministic —
 * the plan is built before generation and checked after.
 */
export function extractExplicitBuyerQuestions(replyText: string): BuyerQuestion[] {
  if (!replyText || !replyText.trim()) return []
  const sentences = replyText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
  const questions: BuyerQuestion[] = []
  for (const sentence of sentences) {
    if (!QUESTION_MARKER.test(sentence)) continue
    const topic = TOPIC_PATTERNS.find((t) => t.pattern.test(sentence))?.topic ?? 'other'
    questions.push({ topic, text: sentence, status: 'PENDING' })
  }
  return questions
}

export interface QuestionCoverage {
  total: number
  answered: number
  /** answered + asked-for-clarification; the reply is complete at 100%. */
  covered: number
  /** covered / total, 0 when there are no questions. */
  ratio: number
  complete: boolean
  questions: BuyerQuestion[]
}

/**
 * Whether the draft addresses every explicit buyer question. A topic counts as
 * covered when the draft contains a topic keyword (answered) or asks a
 * clarifying question back (ASK_CLARIFICATION).
 */
export function assessQuestionCoverage(questions: readonly BuyerQuestion[], draftText: string): QuestionCoverage {
  const draft = (draftText ?? '').toLowerCase()
  const clarifying = CLARIFICATION_MARKER.test(draft)
  const assessed = questions.map((q) => {
    const keywords = TOPIC_COVERAGE_KEYWORDS[q.topic] ?? []
    if (keywords.some((k) => draft.includes(k))) return { ...q, status: 'ANSWERED' as const }
    // Asking the buyer back is acceptable only when the draft engages this
    // specific question — a single unrelated question must not cover them all.
    const questionWords = q.text.toLowerCase().split(/\W+/).filter((w) => w.length >= 5)
    if (clarifying && questionWords.some((w) => draft.includes(w))) {
      return { ...q, status: 'ASK_CLARIFICATION' as const }
    }
    return { ...q, status: 'NEEDS_VERIFICATION' as const }
  })
  const total = assessed.length
  const answered = assessed.filter((q) => q.status === 'ANSWERED').length
  const covered = assessed.filter((q) => q.status !== 'NEEDS_VERIFICATION').length
  const ratio = total === 0 ? 1 : covered / total
  return { total, answered, covered, ratio, complete: total === 0 || covered === total, questions: assessed }
}

/**
 * The prompt block that tells the generator exactly what to answer. Injected
 * only for replies.
 */
export function buildQuestionPlanBlock(questions: readonly BuyerQuestion[]): string {
  if (questions.length === 0) return ''
  const lines = questions.map((q, i) => `${i + 1}. [${q.topic}] ${q.text}`)
  return [
    'THE BUYER ASKED THESE EXPLICIT QUESTIONS. Answer every one of them in the reply. Do not skip any.',
    ...lines,
    'If you cannot answer one from the approved facts, say so and ask for what you need — never invent an answer.',
    'NEVER invent a calendar slot or a specific meeting time. If no calendar is available, offer to coordinate a time (for example "I can coordinate a time next week") instead of proposing a date.',
  ].join('\n')
}

/**
 * True when the draft proposes a specific day/time slot. Those slots are never
 * backed by a calendar in Relay, so proposing one is a fabrication.
 */
export function hasInventedAvailability(draftText: string): boolean {
  const draft = (draftText ?? '').toLowerCase()
  return /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.{0,20}\b(at\s+)?\d{1,2}(:\d{2})?\s?(am|pm)\b|\b(at\s+)?\d{1,2}(:\d{2})?\s?(am|pm)\b.{0,20}\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bnext\s+(monday|tuesday|wednesday|thursday|friday)\s+at\b|\bhow about\s+(monday|tuesday|wednesday|thursday|friday)\b/i.test(draft)
}
