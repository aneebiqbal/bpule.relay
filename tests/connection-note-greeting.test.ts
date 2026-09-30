import { describe, it, expect } from 'vitest'
import { normalizeGreeting, extractFirstName, validateAndRepair, evaluateConnectionNote } from '@/lib/prospect/connection-note'

describe('extractFirstName', () => {
  it('extracts first name from full name', () => {
    expect(extractFirstName('Sarah Chen')).toBe('Sarah')
    expect(extractFirstName('John Smith')).toBe('John')
    expect(extractFirstName('Mary')).toBe('Mary')
  })

  it('returns null for unreliable names', () => {
    expect(extractFirstName(null)).toBeNull()
    expect(extractFirstName('')).toBeNull()
    expect(extractFirstName('A')).toBeNull()
    expect(extractFirstName('   ')).toBeNull()
  })

  it('handles hyphenated names', () => {
    expect(extractFirstName('Anne-Marie Johnson')).toBe('Anne-Marie')
  })
})

describe('normalizeGreeting', () => {
  it('uses first name when full name is used in greeting', () => {
    const result = normalizeGreeting('Hi Sarah Chen, saw your work on Rails.', 'Sarah Chen')
    expect(result).toBe('Hi Sarah, saw your work on Rails.')
  })

  it('leaves natural first-name greeting unchanged', () => {
    const result = normalizeGreeting('Hey Sarah, saw your work.', 'Sarah Chen')
    expect(result).toBe('Hey Sarah, saw your work.')
  })

  it('prepends greeting when none exists and name is available', () => {
    const result = normalizeGreeting('Saw your work on Rails marketplace.', 'Sarah Chen')
    expect(result).toBe('Hi Sarah, saw your work on Rails marketplace.')
  })

  it('does not fabricate name when none available', () => {
    const result = normalizeGreeting('Saw your work on Rails.', null)
    expect(result).toBe('Saw your work on Rails.')
  })

  it('replaces "Hi there" with first name', () => {
    const result = normalizeGreeting('Hi there, saw your profile.', 'Sarah Chen')
    expect(result).toBe('Hi Sarah, saw your profile.')
  })

  it('collapses a multi-token / honorific-like display name to first name without leaving trailing tokens', () => {
    // "MD ABUL MANSUR" is a real multi-token display name (extractFirstName
    // returns "MD", its first token). The greeting-normalization regex
    // previously consumed only ONE extra word after the first name, leaving
    // "Mansur," dangling: "Hi MD Abul Mansur," incorrectly became
    // "Hi MD, Mansur," instead of "Hi MD,".
    const result = normalizeGreeting('Hi MD Abul Mansur, saw your work on XHYRE.', 'MD ABUL MANSUR')
    expect(result).toBe('Hi MD, saw your work on XHYRE.')
    expect(result).not.toMatch(/Hi MD, Mansur,/)
  })
})

describe('validateAndRepair - greeting normalization', () => {
  it('passes clean first-name greeting', () => {
    const result = validateAndRepair({
      text: 'Hi Sarah, saw you are hiring for Rails work.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(true)
  })

  it('repairs surveillance opening', () => {
    const result = validateAndRepair({
      text: 'Hi Sarah, I came across your profile and would love to connect.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    // After repair, the surveillance opening is removed
    expect(result.passed).toBe(true)
    expect(result.repaired).not.toBeNull()
    expect(result.text.toLowerCase()).not.toContain('came across')
  })

  it('rejects questions in connection notes', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Sarah, curious about how you are scaling the team?',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.toLowerCase().includes('question'))).toBe(true)
  })

  it('rejects manufactured personalization', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Sarah, would love to learn more about your work at Acme.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => /manufactured|curious|would love to learn/i.test(f))).toBe(true)
  })

  it('rejects service descriptions', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Sarah, we build Rails apps and I think we can help Acme.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => /service description/i.test(f))).toBe(true)
  })

  it('passes a clean observation-based connection note', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Sarah, noticed the Rails migration at Acme. Close to work I have done. Worth connecting.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(true)
  })

  // Regression: budget/funding inference must be contextual, not a blanket word ban.
  // Notes that mention "budget", "spend", or "funding" in the sender's own context
  // (e.g., reducing cloud spend, budget-friendly approach) must NOT be flagged.

  it('does NOT flag a note mentioning cloud spend in sender context', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Erick, cloud platform architecture at scale is what I work on daily. Helping teams reduce cloud spend without sacrificing reliability. Worth connecting.',
      profile: null,
      prospectName: 'Erick Albuquerque',
      prospectCompany: 'Microsoft',
      matchedProof: [],
    })
    expect(result.passed).toBe(true)
    expect(result.failures.some((f) => f.includes('funding = budget'))).toBe(false)
  })

  it('does NOT flag a note mentioning budget-friendly approach', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Sarah, platform engineering at scale is what I work on. Budget-friendly approaches to infra automation. Worth connecting.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(true)
    expect(result.failures.some((f) => f.includes('funding = budget'))).toBe(false)
  })

  it('does NOT flag a note mentioning cost optimization', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Ben, infra cost optimization is a space I work in daily. Always keen to connect with peers building in that world.',
      profile: null,
      prospectName: 'Ben Stone',
      prospectCompany: 'FanDuel',
      matchedProof: [],
    })
    expect(result.passed).toBe(true)
    expect(result.failures.some((f) => f.includes('funding = budget'))).toBe(false)
  })

  it('STILL flags actual funding-to-budget inference', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Sarah, congrats on the Series A. That gives you some budget to spend on delivery. I can help.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.includes('funding = budget'))).toBe(true)
  })

  it('STILL flags inference from "closed a round" + budget', () => {
    const result = evaluateConnectionNote({
      text: 'Hi Sarah, you just closed a round which likely gives you budget to spend. I can help ship faster.',
      profile: null,
      prospectName: 'Sarah Chen',
      prospectCompany: 'Acme',
      matchedProof: [],
    })
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.includes('funding = budget'))).toBe(true)
  })
})
