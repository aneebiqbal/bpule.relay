/**
 * Studio image failure classification.
 *
 * A failed regeneration must never destroy the existing image, and the rep must
 * be told why (REL-QA-007). The category comes from the provider response, so
 * the UI can show a real reason and a retry instead of a silent fallback.
 */

export type ImageFailureCategory =
  | 'auth'
  | 'provider'
  | 'rate_limit'
  | 'timeout'
  | 'invalid_response'
  | 'storage'
  | 'unknown'

export function imageFailureCategory(status: number | null | undefined, message?: string): ImageFailureCategory {
  if (status === 401 || status === 403) return 'auth'
  if (status === 503) return 'provider'
  if (status === 429) return 'rate_limit'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 502) return 'invalid_response'
  if (status === null || status === undefined) {
    return /network|fetch|failed to fetch|abort/i.test(message ?? '') ? 'timeout' : 'unknown'
  }
  return 'unknown'
}

/** A human reason for the failure banner. Always ends with a retry hint. */
export function imageFailureReason(status: number | null | undefined, message?: string): string {
  switch (imageFailureCategory(status, message)) {
    case 'auth':
      return 'Image regeneration failed: not signed in. Sign in and retry.'
    case 'provider':
      return 'Image regeneration failed: the image provider is not configured. Check the configuration and retry.'
    case 'rate_limit':
      return 'Image regeneration failed: rate limit reached. Retry in a moment.'
    case 'timeout':
      return 'Image regeneration failed: the provider timed out. Retry.'
    case 'invalid_response':
      return 'Image regeneration failed: the provider returned an invalid response. Retry.'
    case 'storage':
      return 'Image regeneration failed: the image could not be stored. Retry.'
    default:
      return `Image regeneration failed${message ? `: ${message}` : '. Retry.'}`
  }
}
