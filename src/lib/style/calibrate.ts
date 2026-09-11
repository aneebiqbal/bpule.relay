import type { StyleCard, StyleSampleSource } from '@/lib/domain/types'
import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJson } from '@/lib/ai/provider'
import {
  styleCardFromQuiz,
  type QuizAnswers,
} from '@/lib/style/quiz'

export interface CalibrationInput {
  quiz: QuizAnswers
  /** Optional pasted real messages separated by blank lines. */
  samples: string
}

export interface CalibrationResult {
  card: StyleCard
  sampleSource: StyleSampleSource
}

/** Strict schema for the JSON style card the model must return. */
const STYLE_CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contractions',
    'formality',
    'sentence_length',
    'punctuation',
    'openers',
    'emoji_use',
    'greeting',
    'sign_off',
    'never_words',
    'preferred_words',
    'summary',
  ],
  properties: {
    contractions: { type: 'string', enum: ['mostly_no', 'sometimes', 'mostly_yes'] },
    formality: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    sentence_length: { type: 'string', enum: ['short', 'medium', 'long'] },
    punctuation: { type: 'string', enum: ['relaxed', 'standard', 'heavy'] },
    openers: { type: 'string', enum: ['question', 'statement'] },
    emoji_use: { type: 'string', enum: ['none', 'light'] },
    greeting: { type: 'string' },
    sign_off: { type: 'string' },
    never_words: {
      type: 'array',
      items: { type: 'string' },
    },
    preferred_words: {
      type: 'array',
      items: { type: 'string' },
    },
    summary: { type: 'string' },
  },
} as const

const CALIBRATE_SYSTEM = `You build a JSON "style card" describing how a specific human writes outreach messages. This is used to make AI drafts sound exactly like that person, in their voice, never like a template.

You receive: (1) their answers to a writing-preference quiz, and possibly (2) samples of real messages they have written.

Rules:
- Describe what is actually present in the samples, not what you think is good.
- If samples are given, they are the strongest evidence. Every field must stay consistent with the samples when they contradict the quiz.
- greeting and sign_off should be taken from the samples verbatim if present, otherwise from the quiz.
- never_words and preferred_words come from the quiz list, plus anything clearly violated or heavily used in the samples.
- summary is one plain sentence, reader-visible, that describes how this person writes.`

/**
 * One-time calibration for a rep. Turns quiz answers (and optional pasted real
 * messages) into a structured style card. Uses the cheap model when an API key
 * is present; otherwise falls back to a deterministic card from the quiz (DEMO).
 */
export async function calibrateStyleCard(
  input: CalibrationInput,
): Promise<CalibrationResult> {
  const hasSamples = input.samples.trim().length > 0
  const sampleSource: StyleSampleSource = hasSamples ? 'both' : 'quiz'

  const quizSeed = styleCardFromQuiz(input.quiz)

  if (!hasProvider()) {
    const card = hasSamples
      ? mergeSamplesIntoCard(quizSeed, input.samples)
      : quizSeed
    return { card, sampleSource: hasSamples ? 'pasted_samples' : 'quiz' }
  }

  const { model } = pickModel('calibrate')

  const userBlock = [
    'Quiz answers:',
    JSON.stringify(input.quiz, null, 2),
    hasSamples ? `\nReal messages this person has written:\n\n${input.samples}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const card = await structuredJson<StyleCard>({
    model,
    system: CALIBRATE_SYSTEM,
    user: userBlock,
    schema: STYLE_CARD_SCHEMA,
  })

  return normalizeCard(card, quizSeed, sampleSource)
}

/**
 * DEMO ONLY. Heuristic overrides so pasted samples still shape the card when
 * no API key is configured. Only active when hasProvider() is false.
 */
function mergeSamplesIntoCard(base: StyleCard, samples: string): StyleCard {
  const copy: StyleCard = { ...base, never_words: [...base.never_words], preferred_words: [...base.preferred_words] }
  const lines = samples
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  const greetingMatch = lines.find((l) => /^(hey|hi|hello)\b/i.test(l))
  if (greetingMatch) copy.greeting = greetingMatch.replace(/^([^,\s]+).*/i, '$1')

  const signOffLookup = ['Best,', 'Cheers,', 'Thanks,', 'Warmly,', 'Talk soon,', 'Best regards,']
  const signOffLine = lines.find((l) => signOffLookup.some((s) => l.startsWith(s, 0)))
  if (signOffLine) copy.sign_off = signOffLine.replace(/[,\s]+$/, '')

  const full = samples.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/)
  const contractions = (full.join(' ').match(/\b(?:i'm|it's|we'll|we're|i'll|can't|don't|won't)\b/gi) ?? []).length
  const total = full.length
  if (total > 0) {
    copy.contractions = contractions > total / 50 ? 'mostly_yes' : contractions > 0 ? 'sometimes' : 'mostly_no'
  }

  return copy
}

function normalizeCard(
  raw: StyleCard,
  seed: StyleCard,
  source: StyleSampleSource,
): CalibrationResult {
  const fallbackNever = seed.never_words
  const card: StyleCard = {
    contractions:
      raw.contractions === 'mostly_no' || raw.contractions === 'sometimes' || raw.contractions === 'mostly_yes'
        ? raw.contractions
        : seed.contractions,
    formality: raw.formality >= 1 && raw.formality <= 5 ? ((Math.round(raw.formality) as 1 | 2 | 3 | 4 | 5)) : seed.formality,
    sentence_length:
      raw.sentence_length === 'short' || raw.sentence_length === 'medium' || raw.sentence_length === 'long'
        ? raw.sentence_length
        : seed.sentence_length,
    punctuation:
      raw.punctuation === 'relaxed' || raw.punctuation === 'standard' || raw.punctuation === 'heavy'
        ? raw.punctuation
        : seed.punctuation,
    openers:
      raw.openers === 'question' || raw.openers === 'statement' ? raw.openers : seed.openers,
    emoji_use: raw.emoji_use === 'light' || raw.emoji_use === 'none' ? raw.emoji_use : seed.emoji_use,
    greeting: raw.greeting?.trim() || seed.greeting,
    sign_off: raw.sign_off?.trim() || seed.sign_off,
    never_words: Array.isArray(raw.never_words) && raw.never_words.length > 0 ? raw.never_words : [], 
    preferred_words: Array.isArray(raw.preferred_words) ? raw.preferred_words.slice(0, 12) : [],
    summary: raw.summary?.trim() || seed.summary,
  }
  if (card.never_words.length === 0 && source === 'quiz') {
    card.never_words = fallbackNever
  }
  return { card, sampleSource: source }
}