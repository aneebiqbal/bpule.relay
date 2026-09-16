const LEGAL_SUFFIXES = [
  'inc',
  'inc.',
  'llc',
  'ltd',
  'ltd.',
  'limited',
  'corp',
  'corporation',
  'co',
  'co.',
  'gmbh',
  'b.v',
  'bv',
  'sa',
  'sarl',
  'pte',
  'plc',
  'group',
  'holdings',
  'technologies',
  'technology',
  'tech',
  'labs',
  'studio',
  'studios',
]

/**
 * Mirrors the database generated column:
 * lower(regexp_replace(company, '[^a-z0-9]', '', 'gi')).
 */
export function companyKey(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Fuzzy key used by the app-level dedupe gate. Strips legal suffixes so
 * "Acme Inc", "Acme LLC", and "acme" all collide. The database unique index
 * is the hard backstop on the raw company_key; this is the softer gate that
 * catches suffix variations before a row is ever written.
 */
export function companyFuzzyKey(company: string): string {
  let key = company.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const suffix of LEGAL_SUFFIXES) {
    const plain = suffix.replace(/[^a-z0-9]/g, '')
    if (key.length > plain.length && key.endsWith(plain)) {
      key = key.slice(0, -plain.length)
    }
  }
  return key
}

export function normalizeLeadUrl(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const path = parsed.pathname.replace(/\/+$/, '')
    const normalized = `${host}${path}`.toLowerCase()
    return normalized.length > 0 ? normalized : null
  } catch {
    return raw.toLowerCase()
  }
}

export function contactKey(name: string | null | undefined): string | null {
  const key = (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return key.length > 0 ? key : null
}
