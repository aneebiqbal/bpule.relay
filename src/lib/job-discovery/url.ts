/**
 * Application-destination safety.
 *
 * Relay only opens http(s) URLs on public hosts. It rejects localhost,
 * link-local and RFC1918 private ranges so a malicious feed cannot turn the
 * "Open official application" button into an SSRF probe.
 */
export function isSafeApplicationUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') return false
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
    if (/^\[?(::1|fc|fd|fe80)/.test(host)) return false
    return true
  } catch {
    return false
  }
}
