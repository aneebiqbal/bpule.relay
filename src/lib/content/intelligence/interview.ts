import type {
  ContentProfile,
  ContentMemory,
  ContentInterviewSession,
  ContentInterviewAnswer,
  ContentOpportunity,
} from '@/lib/domain/types'
import { hasProvider } from '@/lib/ai/config'
import { generate } from '@/lib/ai/runtime'

/**
 * Adaptive Interview Agent.
 *
 * Central question: "What information is missing that would make this post
 * uniquely attributable to this person?"
 *
 * Asks ONE question at a time. Stops when enough unique information exists.
 */

export const MAX_INTERVIEW_QUESTIONS = 3

export interface InterviewQuestion {
  question: string
  reason: string  // why this question matters (not shown to user directly)
}

export interface InterviewDecision {
  shouldInterview: boolean
  reason: string
  missingDimensions: string[]
}

/**
 * Determine whether an interview is needed before generation.
 */
export function decideIfInterviewNeeded(input: {
  profile: ContentProfile | null
  memories: ContentMemory[]
  sourceMaterial: string
  opportunity?: ContentOpportunity | null
}): InterviewDecision {
  const missingDimensions: string[] = []

  // Check if we have enough personal context
  if (!input.profile || input.profile.confidence < 0.3) {
    missingDimensions.push('basic professional context')
  }

  const hasStrongAction = /\b(spent|built|shipped|debugged|fixed|learned|decided|chose|realized|discovered|found out|turns out|deployed|migrated|refactored|optimized|reduced|increased|cut|dropped|stopped|checked|changed|updated|removed|added)\b/i.test(input.sourceMaterial)

  const hasConcreteDetail = input.sourceMaterial.trim().length > 30 &&
    /\b(i|we|my|our|today|yesterday|last week|this morning|the|a|our|my)\b/i.test(input.sourceMaterial) &&
    /\b(system|server|API|endpoint|query|index|cache|queue|migration|build|deploy|config|environment|database|CI|pipeline|production|codebase|infrastructure|Docker|Kubernetes|Rails|React|Postgres|Redis|Python|TypeScript|JavaScript|Go|Rust|microservices?|monolith|architecture|framework|platform|stack|tooling)\b/i.test(input.sourceMaterial)

  const hasSpecificDetail = hasStrongAction && hasConcreteDetail

  if (!hasSpecificDetail) {
    missingDimensions.push('specific personal detail or experience')
  }

  const hasOpinionOrAngle = input.sourceMaterial.trim().length > 10 &&
    /\b(think|believe|opinion|take|learned|lesson|realized|found out|discovered|turns out|should|shouldn't|overrated|underrated|better|worse|prefer|recommend)\b/i.test(input.sourceMaterial)

  if (!hasOpinionOrAngle) {
    missingDimensions.push('opinion, lesson, or angle')
  }

  // Only skip interview if profile is confident AND input has strong action + concrete detail
  if (input.profile && input.profile.confidence >= 0.5 && hasSpecificDetail && hasOpinionOrAngle) {
    return { shouldInterview: false, reason: 'Enough context exists from Content DNA and source material.', missingDimensions: [] }
  }

  if (missingDimensions.length === 0) {
    return { shouldInterview: false, reason: 'Source material contains sufficient personal detail.', missingDimensions: [] }
  }

  return { shouldInterview: true, reason: `Missing: ${missingDimensions.join(', ')}.`, missingDimensions }
}

/**
 * Generate the next interview question based on what we already know.
 *
 * Uses the cheapest model tier. Returns a targeted question.
 */
export async function generateInterviewQuestion(input: {
  profile: ContentProfile | null
  memories: ContentMemory[]
  sourceMaterial: string
  opportunity?: ContentOpportunity | null
  previousAnswers: ContentInterviewAnswer[]
  missingDimensions: string[]
}): Promise<InterviewQuestion> {
  if (!hasProvider()) {
    return getFallbackQuestion(input.missingDimensions, input.previousAnswers.length)
  }

  const profileSummary = input.profile
    ? [
        input.profile.role ? `Role: ${input.profile.role}` : '',
        input.profile.seniority ? `Seniority: ${input.profile.seniority}` : '',
        input.profile.expertise.length > 0 ? `Expertise: ${input.profile.expertise.slice(0, 3).map((e) => e.area).join(', ')}` : '',
        input.profile.opinions.length > 0 ? `Known convictions: ${input.profile.opinions.slice(0, 2).map((o) => o.belief).join('; ')}` : '',
      ].filter(Boolean).join('\n')
    : 'No Content DNA available yet.'

  const answerHistory = input.previousAnswers.length > 0
    ? input.previousAnswers.map((a, i) => `Q${i + 1}: ${a.question}\nA: ${a.answer}`).join('\n\n')
    : '(none — this is the first question)'

  const result = await generate<{ question: string; reason: string }>({
    task: 'FAST_STRUCTURED',
    system: `You conduct a brief, targeted interview to extract the ONE piece of unique information that would make a social media post unmistakably attributable to this specific person.

Rules:
- Ask exactly ONE question. No preamble, no explanation.
- The question must target what we DON'T already know.
- If they mention a specific event, ask what happened or what they learned.
- If they mention a project, ask about the hardest decision or surprising outcome.
- If they express an opinion, ask what changed their mind or what evidence they have.
- Questions should feel like a curious colleague, not a form.
- Keep it to ONE short sentence (under 25 words).
- Do not ask about anything already covered in previous answers.
- If you have enough information already, return an empty question (we will stop).`,
    user: `WHAT WE KNOW ABOUT THIS PERSON:
${profileSummary}

SOURCE MATERIAL FOR THE POST:
"${input.sourceMaterial.slice(0, 500)}"

${input.opportunity ? `OPPORTUNITY: ${input.opportunity.title}\n${input.opportunity.description}` : ''}

PREVIOUS ANSWERS:
${answerHistory}

MISSING DIMENSIONS: ${input.missingDimensions.join(', ')}

Generate the NEXT single question. If enough information exists, return empty question.`,
    schema: {
      type: 'object',
      required: ['question', 'reason'],
      properties: {
        question: { type: 'string', description: 'The ONE question to ask, or empty string if we have enough' },
        reason: { type: 'string', description: 'Why this question matters' },
      },
    },
    maxTokens: 256,
  })

  const question = (result.data.question ?? '').trim()
  const reason = (result.data.reason ?? '').trim()

  if (!question) {
    return { question: '', reason: 'Model determined enough information exists.' }
  }

  return { question, reason }
}

/**
 * Evaluate whether we should stop interviewing.
 */
export function shouldStopInterview(input: {
  questionsAsked: number
  lastAnswerQuality: 'high' | 'medium' | 'low'
  informationGain: number
  missingDimensionsRemaining: number
}): { shouldStop: boolean; reason: string } {
  // Hard cap
  if (input.questionsAsked >= MAX_INTERVIEW_QUESTIONS) {
    return { shouldStop: true, reason: `Reached maximum of ${MAX_INTERVIEW_QUESTIONS} questions.` }
  }

  // Stop if last answer was high quality and we have at least 1 answer
  if (input.lastAnswerQuality === 'high' && input.questionsAsked >= 1) {
    return { shouldStop: true, reason: 'Last answer provided strong unique material.' }
  }

  // Stop if no missing dimensions remain
  if (input.missingDimensionsRemaining <= 0 && input.questionsAsked >= 1) {
    return { shouldStop: true, reason: 'No missing dimensions remain.' }
  }

  // Stop if marginal information gain is low
  if (input.informationGain > 0.7 && input.questionsAsked >= 2) {
    return { shouldStop: true, reason: 'Information gain is high enough.' }
  }

  return { shouldStop: false, reason: 'Continue interviewing.' }
}

/**
 * Assess the quality of an interview answer for information gain.
 */
export function assessAnswerQuality(answer: string, existingContext: string): 'high' | 'medium' | 'low' {
  const len = answer.trim().length
  if (len < 10) return 'low'

  // Strong action/lesson verbs — indicate the user actually did something or learned something
  const hasStrongAction = /\b(spent|built|shipped|debugged|fixed|learned|decided|chose|realized|discovered|found out|found it|turns out|stopped looking|checked the|was stale|was reading|convinced|I've become|I stopped|eventually|turned out|deployed|migrated|refactored|optimized|reduced|increased|cut|dropped|by adding|instead of|the actual)\b/i.test(answer)

  // Weak temporal markers alone don't indicate quality
  const hasWeakTemporal = /\b(today|yesterday|last week|last month|this morning|this week)\b/i.test(answer)

  // Concrete details — technologies, systems, metrics, outcomes
  const hasConcreteDetail = /\b\d|my (team|manager|customer|client)|our (product|system|codebase|infrastructure)|\.env|deploy|config|pipeline|production|stale|environment|release|build|logs?|CI|database|server|API|endpoint|query|index|cache|queue|migration/i.test(answer)

  // A complete story needs action + detail + sufficient length
  if (hasStrongAction && hasConcreteDetail && len > 50) return 'high'
  // Medium requires either strong action OR (concrete detail + sufficient length + not just a statement of fact)
  if (hasStrongAction && len > 20) return 'medium'
  if (hasConcreteDetail && len > 60 && hasStrongAction) return 'medium'
  // Short inputs with only factual statements (no action) are low quality
  return 'low'
}

function getFallbackQuestion(missingDimensions: string[], questionIndex: number): InterviewQuestion {
  const fallbacks: Record<string, string[]> = {
    'basic professional context': [
      'What do you spend most of your time on day-to-day?',
      'What kind of work has been keeping you busy lately?',
      'What did you work on this week?',
    ],
    'specific personal detail or experience': [
      'Can you give me one specific example from your own experience?',
      'What actually happened — what did you see or do?',
      'What was the moment that mattered?',
    ],
    'opinion, lesson, or angle': [
      'What did you learn from that?',
      'What would you tell someone facing the same situation?',
      'What surprised you most?',
    ],
  }

  // Pick a question from the first missing dimension
  const dimension = missingDimensions[0] ?? 'specific personal detail or experience'
  const questions = fallbacks[dimension] ?? fallbacks['specific personal detail or experience']!
  const idx = Math.min(questionIndex, questions.length - 1)

  return {
    question: questions[idx],
    reason: `Fallback question for missing dimension: ${dimension}`,
  }
}
