/**
 * Post-login destination normalization.
 *
 * Browsers fold backslashes to slashes for special URLs, so `/\evil.test`
 * would otherwise become a protocol-relative redirect off-site. Only absolute
 * root-relative paths (optionally with query/hash) survive.
 */
export function sanitizeNextPath(value: string | null): string {
  if (!value) return '/dashboard'
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return '/dashboard'
  return value
}
