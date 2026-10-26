/**
 * Named message-quality eval set (REL-QA-009).
 *
 * The buyer-question gate is keyword-based, so it must be tested against the
 * phrasings a real buyer uses — paraphrases, compound asks, implicit asks and
 * pricing/technical questions — not just the original report.
 */
import { describe, expect, it } from 'vitest'
import {
  assessQuestionCoverage,
  extractExplicitBuyerQuestions,
  hasInventedAvailability,
} from '@/lib/relay/buyer-questions'

interface EvalCase {
  name: string
  message: string
  /** Topics that must be present (order-independent). */
  expectTopics: string[]
}

const CASES: EvalCase[] = [
  {
    name: 'MULTI_QUESTION_BUYER',
    message:
      'Thanks for the introduction. Can you share relevant experience with warehouse management systems? What is your estimated delivery timeline for a build like this? And are you available next week for a call?',
    expectTopics: ['experience', 'timeline', 'availability'],
  },
  { name: 'PARAPHRASE_EXPERIENCE', message: 'Have you built something like this before?', expectTopics: ['experience'] },
  { name: 'PARAPHRASE_TIMELINE', message: 'Roughly how long would this take?', expectTopics: ['timeline'] },
  { name: 'PARAPHRASE_AVAILABILITY', message: 'Can you start next week?', expectTopics: ['availability'] },
  { name: 'PRICING_BUDGET', message: "What's the ballpark cost for a build like this?", expectTopics: ['pricing'] },
  {
    name: 'TECHNICAL_REQUIREMENTS',
    message: 'Do you work with React and Node on the backend?',
    expectTopics: ['tech_stack'],
  },
  {
    name: 'COMPOUND_QUESTION',
    message: 'Can you share some relevant case studies, and roughly how long would delivery take?',
    expectTopics: ['experience', 'timeline'],
  },
  { name: 'IMPLICIT_ASK', message: "We'd love to see some previous work.", expectTopics: ['experience'] },
]

describe('REL-QA-009 message-quality eval set', () => {
  it.each(CASES)('$name: extracts the requested topics', ({ message, expectTopics }) => {
    const questions = extractExplicitBuyerQuestions(message)
    expect(questions.map((q) => q.topic).sort()).toEqual([...expectTopics].sort())
  })

  it('a reply that answers every paraphrase is complete', () => {
    for (const { message, expectTopics } of CASES) {
      const questions = extractExplicitBuyerQuestions(message)
      // Answer each topic with its own keyword, so the gate is satisfied per topic.
      const answers: Record<string, string> = {
        experience: 'We have built similar systems before.',
        timeline: 'The timeline is about 10 weeks.',
        availability: 'We can start next week.',
        pricing: 'The cost depends on scope; a ballpark is available.',
        tech_stack: 'We work with React and Node.',
        process: 'Our process starts with discovery.',
        team: 'A senior developer and designer would work on it.',
        other: 'Happy to share more.',
      }
      const draft = expectTopics.map((t) => answers[t]).join(' ')
      const coverage = assessQuestionCoverage(questions, draft)
      expect(coverage.complete, `${message} -> ${coverage.divergences ?? ''}`).toBe(true)
    }
  })

  it('a reply that drops a question in a compound ask fails the gate', () => {
    const questions = extractExplicitBuyerQuestions(CASES.find((c) => c.name === 'COMPOUND_QUESTION')!.message)
    const draft = 'Here are two relevant case studies from similar logistics clients.'
    const coverage = assessQuestionCoverage(questions, draft)
    expect(coverage.complete).toBe(false)
  })

  it('availability is never invented, even when asked directly', () => {
    const questions = extractExplicitBuyerQuestions(CASES.find((c) => c.name === 'PARAPHRASE_AVAILABILITY')!.message)
    expect(hasInventedAvailability('Yes — Tuesday at 2pm works.')).toBe(true)
    const coverage = assessQuestionCoverage(questions, 'I can coordinate a time next week.')
    expect(coverage.complete).toBe(true)
  })

  it('a statement with no ask produces no questions', () => {
    expect(extractExplicitBuyerQuestions('Our approved budget is $85,000 and we start in February.')).toHaveLength(0)
  })
})
