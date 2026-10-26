/**
 * REL-QA-007 — Studio image Regenerate failure (production QA, 26 Oct 2026).
 *
 * Reported: clicking Regenerate on a Studio post failed. The old code replaced
 * the existing image with a canvas placeholder and persisted it, so the real
 * visual was destroyed and no reason was shown.
 *
 * Fix: classify the failure, keep the existing image intact, and surface a real
 * reason with a retry.
 */
import { describe, expect, it } from 'vitest'
import { imageFailureCategory, imageFailureReason } from '@/lib/content/image-failure'

describe('REL-QA-007 — image failure classification', () => {
  it('classifies auth, provider, rate limit, timeout and invalid response', () => {
    expect(imageFailureCategory(401)).toBe('auth')
    expect(imageFailureCategory(403)).toBe('auth')
    expect(imageFailureCategory(503)).toBe('provider')
    expect(imageFailureCategory(429)).toBe('rate_limit')
    expect(imageFailureCategory(408)).toBe('timeout')
    expect(imageFailureCategory(504)).toBe('timeout')
    expect(imageFailureCategory(502)).toBe('invalid_response')
  })

  it('a network failure with no status is a timeout', () => {
    expect(imageFailureCategory(null, 'Failed to fetch')).toBe('timeout')
  })

  it('each reason names the cause and offers a retry', () => {
    expect(imageFailureReason(401)).toMatch(/not signed in/i)
    expect(imageFailureReason(503)).toMatch(/not configured/i)
    expect(imageFailureReason(429)).toMatch(/rate limit/i)
    expect(imageFailureReason(504)).toMatch(/timed out/i)
    for (const status of [401, 503, 429, 504, 502, 500]) {
      expect(imageFailureReason(status)).toMatch(/retry/i)
    }
  })

  it('an unknown failure still carries the provider message', () => {
    expect(imageFailureReason(500, 'bad payload')).toContain('bad payload')
  })
})
