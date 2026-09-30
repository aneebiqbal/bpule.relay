import { describe, it, expect } from 'vitest'
import { normalizeText, sanitizeFilename, contentHash } from '@/lib/profile-intelligence/parse-document'

describe('normalizeText', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeText('line1\r\nline2')).toBe('line1\nline2')
  })

  it('collapses multiple blank lines', () => {
    expect(normalizeText('line1\n\n\n\nline2')).toBe('line1\n\nline2')
  })

  it('trims trailing whitespace on lines', () => {
    expect(normalizeText('line1   \nline2')).toBe('line1\nline2')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeText('hello    world')).toBe('hello world')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
  })
})

describe('sanitizeFilename', () => {
  it('replaces special characters', () => {
    expect(sanitizeFilename('my file (1).pdf')).toBe('my_file_1_.pdf')
  })

  it('collapses multiple underscores', () => {
    expect(sanitizeFilename('my   file.pdf')).toBe('my_file.pdf')
  })

  it('truncates long filenames', () => {
    const long = 'a'.repeat(300) + '.pdf'
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(204)
  })
})

describe('contentHash', () => {
  it('produces consistent hash for same content', () => {
    const hash1 = contentHash('hello world')
    const hash2 = contentHash('hello world')
    expect(hash1).toBe(hash2)
  })

  it('produces different hash for different content', () => {
    const hash1 = contentHash('hello world')
    const hash2 = contentHash('goodbye world')
    expect(hash1).not.toBe(hash2)
  })

  it('produces a non-empty string', () => {
    expect(contentHash('test').length).toBeGreaterThan(0)
  })
})
