/**
 * REL-QA-009 — AI reply completeness (production QA, 26 Oct 2026).
 *
 * Reported: a buyer asked about relevant experience, an estimated delivery
 * timeline and availability next week. The generated reply answered one, omitted
 * two, and proposed time slots nobody offered.
 *
 * Fix: extract every explicit buyer question before generation, hand the plan to
 * the generator, and gate the draft on covering all of them. Never invent a
 * calendar slot.
 */
import { describe, expect, it } from 'vitest'
import {
  assessQuestionCoverage,
  buildQuestionPlanBlock,
  extractExplicitBuyerQuestions,
  hasInventedAvailability,
} from '@/lib/relay/buyer-questions'

const BUYER_MESSAGE = `Thanks for the introduction. Can you share relevant experience with warehouse management systems? What is your estimated delivery timeline for a build like this? And are you available next week for a call?`

describe('REL-QA-009 — explicit buyer questions', () => {
  it('MULTI_QUESTION_BUYER: extracts all three requested topics', () => {
    const questions = extractExplicitBuyerQuestions(BUYER_MESSAGE)
    expect(questions).toHaveLength(3)
    expect(questions.map((q) => q.topic).sort()).toEqual(['availability', 'experience', 'timeline'])
  })

  it('ignores statements that are not questions', () => {
    expect(extractExplicitBuyerQuestions('We have an approved budget of $85,000.')).toHaveLength(0)
  })

  it('a reply that answers every question is complete', () => {
    const questions = extractExplicitBuyerQuestions(BUYER_MESSAGE)
    const draft = 'We have delivered similar warehouse systems for two logistics clients. The estimated timeline is about 12 weeks, phased. I can coordinate a time next week for a call.'
    const coverage = assessQuestionCoverage(questions, draft)
    expect(coverage.total).toBe(3)
    expect(coverage.complete).toBe(true)
    // A calendar-backed question is answered by offering to coordinate; it is
    // never answered by inventing a slot.
    expect(coverage.questions.every((q) => q.status !== 'NEEDS_VERIFICATION')).toBe(true)
  })

  it('a reply that omits two of three questions fails the gate', () => {
    const questions = extractExplicitBuyerQuestions(BUYER_MESSAGE)
    const draft = 'Thanks for the note — we have delivered similar warehouse systems before.'
    const coverage = assessQuestionCoverage(questions, draft)
    expect(coverage.complete).toBe(false)
    expect(coverage.covered).toBeLessThan(coverage.total)
    expect(coverage.questions.some((q) => q.status === 'NEEDS_VERIFICATION')).toBe(true)
  })

  it('the question plan names every question and forbids invented slots', () => {
    const questions = extractExplicitBuyerQuestions(BUYER_MESSAGE)
    const block = buildQuestionPlanBlock(questions)
    expect(block).toContain('experience')
    expect(block).toContain('timeline')
    expect(block).toContain('availability')
    expect(block).toMatch(/never invent a calendar slot/i)
  })
})

describe('REL-QA-009 — availability fabrication', () => {
  it('flags a specific day/time proposal', () => {
    expect(hasInventedAvailability('How about Tuesday at 2pm?')).toBe(true)
    expect(hasInventedAvailability('We are free next Monday at 10am.')).toBe(true)
  })

  it('does not flag coordinating a time without a specific slot', () => {
    expect(hasInventedAvailability('I can coordinate a time next week.')).toBe(false)
    expect(hasInventedAvailability('Would a call next week work for you?')).toBe(false)
  })
})
