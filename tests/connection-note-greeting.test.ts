import { describe, it, expect } from 'vitest'
import { normalizeGreeting, extractFirstName, validateAndRepair } from '@/lib/prospect/connection-note'

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
})
