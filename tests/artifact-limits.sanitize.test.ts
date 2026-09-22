import { describe, it, expect } from 'vitest'
import { sanitizeDraft } from '@/lib/facts/sanitize'
import { enforceArtifactLimit, countFor } from '@/lib/relay/artifact-limits'
import { evaluateMessage } from '@/lib/relay/message-forge'

describe('Bug 3: emoji stripping in sanitizeDraft', () => {
  it('strips emojis and reports hadEmoji', () => {
    const input = 'Now Hiring: Talent Acquisition Specialist! 💼✨ We are scaling.'
    const out = sanitizeDraft(input, [])
    expect(out.hadEmoji).toBe(true)
    expect(out.text).not.toContain('💼')
    expect(out.text).not.toContain('✨')
    expect(out.text).toContain('Now Hiring: Talent Acquisition Specialist')
  })

  it('hadEmoji is false for clean text', () => {
    const out = sanitizeDraft('No emoji in this draft at all.', [])
    expect(out.hadEmoji).toBe(false)
  })
})

describe('Bug 4: shared per-type limits', () => {
  it('hard-cap truncates over-limit text and marks it', () => {
    const longDM = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const capped = enforceArtifactLimit(longDM, 'dm')
    expect(capped.truncated).toBe(true)
    expect(countFor('words', capped.text)).toBeLessThanOrEqual(55)
  })

  it('leaves within-limit text untouched', () => {
    const fine = 'Just a short hello note for the lead.'
    const capped = enforceArtifactLimit(fine, 'dm')
    expect(capped.truncated).toBe(false)
    expect(capped.text).toBe(fine)
  })
})

describe('Bug 4: evaluateMessage enforces all five types', () => {
  it('rejects an over-length DM', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    const r = evaluateMessage(long, null, 'dm')
    expect(r.passed).toBe(false)
    expect(r.reasons.some((x) => x.includes('dm'))).toBe(true)
  })

  it('rejects an over-length upwork letter (was unchecked)', () => {
    const long = Array.from({ length: 400 }, (_, i) => `w${i}`).join(' ')
    const r = evaluateMessage(long, null, 'upwork')
    expect(r.passed).toBe(false)
    expect(r.reasons.some((x) => x.includes('upwork'))).toBe(true)
  })

  it('rejects an over-length follow-up (was unchecked)', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    const r = evaluateMessage(long, null, 'followup')
    expect(r.passed).toBe(false)
    expect(r.reasons.some((x) => x.includes('followup'))).toBe(true)
  })

  it('rejects an over-length reply (was unchecked)', () => {
    const long = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ')
    const r = evaluateMessage(long, null, 'reply')
    expect(r.passed).toBe(false)
    expect(r.reasons.some((x) => x.includes('reply'))).toBe(true)
  })

  it('accepts within-limit drafts across types', () => {
    expect(evaluateMessage('Hey, want to chat?', null, 'dm').passed).toBe(true)
    expect(evaluateMessage('Short note.', null, 'connection').passed).toBe(true)
    expect(evaluateMessage('Short note.', null, 'upwork').passed).toBe(true)
    expect(evaluateMessage('Short note.', null, 'followup').passed).toBe(true)
    expect(evaluateMessage('Short note.', null, 'reply').passed).toBe(true)
  })
})