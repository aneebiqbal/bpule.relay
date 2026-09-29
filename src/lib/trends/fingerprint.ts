export function canonicalizeUrl(url: string | undefined): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    u.hash = ''
    const params = new URLSearchParams(u.search)
    for (const key of Array.from(params.keys())) {
      if (key.startsWith('utm_') || key === 'ref' || key === 'source') {
        params.delete(key)
      }
    }
    u.search = params.toString()
    let normalized = u.toString().toLowerCase()
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    return normalized
  } catch {
    return url.toLowerCase().trim()
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function contentFingerprint(url: string | undefined, title: string): string {
  const canonical = canonicalizeUrl(url)
  if (canonical) {
    return `url:${canonical}`
  }
  const normalized = normalizeTitle(title)
  const words = normalized.split(' ').slice(0, 8).join('-')
  return `title:${words}`
}

export function isDuplicate(existing: string[], candidate: string): boolean {
  const candidateNorm = candidate.toLowerCase()
  return existing.some(fp => {
    if (fp === candidateNorm) return true
    if (fp.startsWith('url:') && candidateNorm.startsWith('url:')) {
      return fp === candidateNorm
    }
    return false
  })
}
