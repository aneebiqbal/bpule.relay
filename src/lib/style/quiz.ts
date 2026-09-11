import type { StyleCard } from '@/lib/domain/types'

export interface QuizAnswers {
  contractions: 'mostly_yes' | 'sometimes' | 'mostly_no'
  formality: 1 | 2 | 3 | 4 | 5
  sentenceLength: 'short' | 'medium' | 'long'
  punctuation: 'relaxed' | 'standard' | 'heavy'
  openers: 'question' | 'statement'
  emoji: 'none' | 'light'
  greeting: string
  signOff: string
  neverWords: string
  preferredWords: string
}

export const DEFAULT_QUIZ: QuizAnswers = {
  contractions: 'sometimes',
  formality: 3,
  sentenceLength: 'medium',
  punctuation: 'standard',
  openers: 'statement',
  emoji: 'none',
  greeting: 'Hey',
  signOff: 'Best',
  neverWords: '',
  preferredWords: '',
}

export interface QuizOption<T extends string | number> {
  value: T
  label: string
  hint: string
}

export interface QuizQuestion<T extends string | number = string | number> {
  id: keyof QuizAnswers
  prompt: string
  options: QuizOption<T>[]
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'contractions',
    prompt: 'Do you write contractions (I am vs I am NOT) or the full forms?',
    options: [
      { value: 'mostly_yes', label: 'Contractions', hint: 'I am, we will, cannot' },
      { value: 'sometimes', label: 'Mix of both', hint: 'Depends on the message' },
      { value: 'mostly_no', label: 'Full forms', hint: 'I am, we will, I cannot' },
    ],
  },
  {
    id: 'formality',
    prompt: 'How formal do your messages read?',
    options: [
      { value: 1, label: 'Very casual', hint: 'Like a text to a friend' },
      { value: 2, label: 'Casual', hint: 'Relaxed but decent' },
      { value: 3, label: 'Neutral', hint: 'Professional, plain' },
      { value: 4, label: 'Formal', hint: 'Proper business tone' },
      { value: 5, label: 'Very formal', hint: 'Letter style' },
    ],
  },
  {
    id: 'sentenceLength',
    prompt: 'What sentence length feels natural to you?',
    options: [
      { value: 'short', label: 'Short', hint: 'Mostly under 12 words' },
      { value: 'medium', label: 'Medium', hint: 'One to two clauses' },
      { value: 'long', label: 'Long', hint: 'Full flowing sentences' },
    ],
  },
  {
    id: 'punctuation',
    prompt: 'How strict is your punctuation?',
    options: [
      { value: 'relaxed', label: 'Relaxed', hint: 'No periods, lowercase I' },
      { value: 'standard', label: 'Standard', hint: 'Correct but not fussy' },
      { value: 'heavy', label: 'Heavy', hint: 'Complete punctuation everywhere' },
    ],
  },
  {
    id: 'openers',
    prompt: 'How do you usually open a cold message?',
    options: [
      { value: 'question', label: 'With a question', hint: 'Are you the right person for...' },
      { value: 'statement', label: 'With a statement', hint: 'I saw your company is...' },
    ],
  },
  {
    id: 'emoji',
    prompt: 'Do you ever use an emoji in outreach?',
    options: [
      { value: 'none', label: 'Never', hint: 'Plain text only' },
      { value: 'light', label: 'Occasionally', hint: 'Almost never, but fine' },
    ],
  },
  {
    id: 'greeting',
    prompt: 'What greeting do you typically open with (or leave blank for none)?',
    options: [{ value: '', label: 'Type your own', hint: '' }],
  },
  {
    id: 'signOff',
    prompt: 'What sign-off closes your messages (or leave blank for none)?',
    options: [{ value: '', label: 'Type your own', hint: '' }],
  },
  {
    id: 'neverWords',
    prompt: 'Words or phrases you would never say (comma separated)',
    options: [{ value: '', label: 'Type your own', hint: 'e.g. leverage, circle back' }],
  },
  {
    id: 'preferredWords',
    prompt: 'Words you reach for often, if any (comma separated)',
    options: [{ value: '', label: 'Type your own', hint: 'Optional' }],
  },
]

function listFromCsv(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
}

/**
 * Deterministic style card built directly from quiz answers. Used as the
 * demo-mode calibration result and as the seed the cheap model refines when
 * an API key is present.
 */
export function styleCardFromQuiz(q: QuizAnswers): StyleCard {
  return {
    contractions: q.contractions,
    formality: q.formality,
    sentence_length: q.sentenceLength,
    punctuation: q.punctuation,
    openers: q.openers,
    emoji_use: q.emoji === 'light' ? 'light' : 'none',
    greeting: q.greeting.trim() || 'Hey',
    sign_off: q.signOff.trim() || 'Best',
    never_words: listFromCsv(q.neverWords),
    preferred_words: listFromCsv(q.preferredWords),
    summary: [
      `Writes ${q.formality <= 2 ? 'casually' : q.formality >= 4 ? 'formally' : 'in a neutral business tone'}`,
      `with ${q.sentenceLength} sentences,`,
      `${q.contractions === 'mostly_yes' ? 'frequent' : q.contractions === 'mostly_no' ? 'no' : 'some'} contractions,`,
      `${q.punctuation} punctuation, opening with a ${q.openers}.`,
    ].join(' '),
  }
}