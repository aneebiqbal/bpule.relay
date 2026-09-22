/**
 * Find Jobs — location normalization and remote/hybrid/onsite detection.
 *
 * Provider location strings are inconsistent ("Remote - Worldwide",
 * "New York, NY US", "Hybrid / Berlin"). This module produces structured
 * flags plus a comparable country/location string cheaply and safely.
 */

export interface NormalizedLocation {
  location: string
  country?: string
  locations: string[]
  remote: boolean
  hybrid: boolean
  onsite: boolean
}

const REMOTE_RE = /\b(remote|work\s+from\s+home|wfh|fully\s+remote|100%\s+remote|distributed)\b/i
const HYBRID_RE = /\b(hybrid|partially\s+remote|flexible\s+remote)\b/i
const ONSITE_RE = /\b(on[- ]?site|on[- ]?premise|in[- ]?office|office[- ]based)\b/i

const COUNTRY_ALIASES: Array<{ name: RegExp; code: string }> = [
  { name: /\bunited\s+states|\busa\b|\bu\.?s\.?a\.?\b|\bamerica\b|\bnew\s+york\b|\bnb\b|\bny\b|\bsilicon\s+valley\b|\bwashington\s+(dc|d\.c\.)\b|\bremote\s+in\s+(the\s+)?us\b/, code: 'US' },
  { name: /\bunited\s+kingdom\b|\buk\b|\bengland\b|\bscotland\b|\bwales\b|\blondon\b/, code: 'GB' },
  { name: /\bgermany\b|\bberlin\b|\bmunich\b|\bfrankfurt\b|\bcologne\b|\bkoeln\b/, code: 'DE' },
  { name: /\bfrance\b|\bparis\b|\blyon\b/, code: 'FR' },
  { name: /\bnetherlands\b|\bamsterdam\b|\brotterdam\b/, code: 'NL' },
  { name: /\bspain\b|\bmadrid\b|\bbarcelona\b/, code: 'ES' },
  { name: /\bitaly\b|\bmilan\b|\brome\b/, code: 'IT' },
  { name: /\bpoland\b|\bwarsaw\b|\bkrakow\b|\bkraków\b/, code: 'PL' },
  { name: /\bcanada\b|\btoronto\b|\bvancouver\b|\bmontreal\b|\bottawa\b|\bremote\s+in\s+canada\b/, code: 'CA' },
  { name: /\baustralia\b|\bsydney\b|\bmelbourne\b|\bbrisbane\b|\bremote\s+in\s+australia\b/, code: 'AU' },
  { name: /\bindia\b|\bbangalore\b|\bbengaluru\b|\bmumbai\b|\bdelhi\b|\bpune\b|\bhyderabad\b|\bchennai\b/, code: 'IN' },
  { name: /\bnew\s+zealand\b|\bauckland\b|\bwellington\b/, code: 'NZ' },
  { name: /\bsingapore\b/, code: 'SG' },
  { name: /\bjapan\b|\btokyo\b|\bosaka\b/, code: 'JP' },
  { name: /\bsweden\b|\bstockholm\b/, code: 'SE' },
  { name: /\bnorway\b|\boslo\b/, code: 'NO' },
  { name: /\bdenmark\b|\bcopenhagen\b/, code: 'DK' },
  { name: /\bswitzerland\b|\bzurich\b|\bgeneva\b|\bbern\b/, code: 'CH' },
  { name: /\bdubai\b|\babu\s+dhabi\b|\buae\b/, code: 'AE' },
  { name: /\bireland\b|\bdublin\b/, code: 'IE' },
  { name: /\bbelgium\b|\bbrussels\b|\bantwerp\b/, code: 'BE' },
  { name: /\bportugal\b|\blisbon\b|\bporto\b/, code: 'PT' },
  { name: /\bafghanistan\b/, code: 'AF' },
  { name: /\balgeria\b/, code: 'DZ' },
  { name: /\bargentina\b|\bbuenos\s+aires\b/, code: 'AR' },
  { name: /\barmenia\b|\byerevan\b/, code: 'AM' },
  { name: /\bbrazil\b|\bsão\s+paulo\b|\brio\s+de\s+janeiro\b/, code: 'BR' },
  { name: /\bbulgaria\b|\bsofia\b/, code: 'BG' },
  { name: /\bchile\b|\bsantiago\b/, code: 'CL' },
  { name: /\bchina\b|\bbeijing\b|\bshanghai\b|\bshenzhen\b|\bhong\s+kong\b/, code: 'CN' },
  { name: /\bcolombia\b|\bbogota\b|\bmedellin\b/, code: 'CO' },
  { name: /\bczech\b|\bprague\b/, code: 'CZ' },
  { name: /\begypt\b|\bcairo\b/, code: 'EG' },
  { name: /\bestonia\b|\btallinn\b/, code: 'EE' },
  { name: /\bfinland\b|\bhelsinki\b/, code: 'FI' },
  { name: /\bgeorgia\b|\btbilisi\b/, code: 'GE' },
  { name: /\bgreece\b|\bathens\b/, code: 'GR' },
  { name: /\bhungary\b|\bbudapest\b/, code: 'HU' },
  { name: /\biceland\b|\breykjavik\b/, code: 'IS' },
  { name: /\bindonesia\b|\bjakarta\b|\bbali\b/, code: 'ID' },
  { name: /\biran\b/, code: 'IR' },
  { name: /\bisrael\b|\btel\s+aviv\b/, code: 'IL' },
  { name: /\bkenya\b|\bnairobi\b/, code: 'KE' },
  { name: /\blocked\b|\bluxembourg\b/, code: 'LU' },
  { name: /\bmalaysia\b|\bkuala\s+lumpur\b/, code: 'MY' },
  { name: /\bmexico\b|\bmexico\s+city\b|\bguadalajara\b/, code: 'MX' },
  { name: /\bmorocco\b|\bca(e)?sablanca\b/, code: 'MA' },
  { name: /\bnigeria\b|\blagos\b/, code: 'NG' },
  { name: /\bpakistan\b|\bkarachi\b|\blahore\b|\bislamabad\b/, code: 'PK' },
  { name: /\bphilippines\b|\bmanila\b/, code: 'PH' },
  { name: /\bromania\b|\bbucharest\b/, code: 'RO' },
  { name: /\bsaudi\s+arabia\b|\briyadh\b|\bjeddah\b/, code: 'SA' },
  { name: /\bserbia\b|\bbelgrade\b/, code: 'RS' },
  { name: /\bslovakia\b|\bbratislava\b/, code: 'SK' },
  { name: /\bslovenia\b|\bljubljana\b/, code: 'SI' },
  { name: /\bsouth\s+africa\b|\bcape\s+town\b|\bjohannesburg\b/, code: 'ZA' },
  { name: /\bsouth\s+korea\b|\bseoul\b/, code: 'KR' },
  { name: /\btaiwan\b|\btaipei\b/, code: 'TW' },
  { name: /\bthailand\b|\bbangkok\b/, code: 'TH' },
  { name: /\bturkey\b|\bistanbul\b|\bankara\b/, code: 'TR' },
  { name: /\bukraine\b|\bkyiv\b|\bkiev\b/, code: 'UA' },
  { name: /\bvietnam\b|\bhanoi\b|\bho\s+chi\s+minh\b/, code: 'VN' },
  { name: /\bworldwide\b|\bworld[- ]?wide\b|\bglobal\b|\banywhere\b|\beverywhere\b|\ball\s+time\s+zones\b/, code: 'WW' },
]

export function normalizeLocation(
  input: unknown,
  extra?: { remote?: boolean; hybrid?: boolean; onsite?: boolean },
): NormalizedLocation {
  const raw = Array.isArray(input)
    ? input.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).join(' | ')
    : typeof input === 'string'
      ? input
      : ''

  const text = sanitizeLocationText(raw)
  const locations = splitLocations(text)

  const remote =
    extra?.remote !== undefined ? extra.remote : REMOTE_RE.test(text) || REMOTE_RE.test(raw)
  const hybrid =
    extra?.hybrid !== undefined ? extra.hybrid : HYBRID_RE.test(text) || HYBRID_RE.test(raw)
  const onsite =
    extra?.onsite !== undefined
      ? extra.onsite
      : !remote && !hybrid && Boolean(text) && (ONSITE_RE.test(text) || ONSITE_RE.test(raw) || !/remote|anywhere|global|worldwide/i.test(text))

  const country = detectCountry(text) ?? detectCountry(raw)

  return {
    location: locations.length > 0 ? locations.join(' · ') : remote ? 'Remote' : text || '—',
    country,
    locations,
    remote,
    hybrid,
    onsite,
  }
}

export function sanitizeLocationText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, '·')
    .replace(/[|/;·]-/g, ' · ')
    .replace(/\s+/g, ' ')
    .replace(/·+/g, '·')
    .replace(/\s+·\s+/g, ' · ')
    .trim()
}

function splitLocations(text: string): string[] {
  return text
    .split('·')
    .map((p) => p.replace(/^(and|&)\s*/i, '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

export function detectCountry(text: string): string | undefined {
  if (!text) return undefined
  // Alias patterns are lowercase literals; providers send title-case strings.
  const lower = text.toLowerCase()
  for (const alias of COUNTRY_ALIASES) {
    if (alias.name.test(text) || alias.name.test(lower)) return alias.code
  }
  const isoMatch = text.match(/\b([A-Z]{2})\b$/)
  if (isoMatch) return isoMatch[1].toUpperCase()
  return undefined
}

/**
 * Deterministic location match for hard filtering. Loose, case-insensitive
 * substring matching; never blocks on punctuation.
 */
export function locationMatches(text: string, needle: string | undefined): boolean {
  if (!needle) return true
  const target = needle.trim().toLowerCase()
  if (!target) return true
  const hay = ` ${text.toLowerCase()} `
  if (hay.includes(target)) return true
  const bare = sanitizeLocationText(text.toLowerCase())
    .replace(/remote/gi, ' ')
    .replace(/\b(ww|worldwide|global|anywhere)\b/g, ' ')
    .trim()
  return target.length > 2 && bare.includes(target)
}

/**
 * True when the value describes an actual place ("Remote, Worldwide",
 * "Anywhere", "Worldwide", "Open to relocation") are preferences, not places,
 * and must not be sent to providers as location filters.
 */
export function isConcretePlace(value: string | string[] | undefined | null): boolean {
  if (!value) return false
  const list = Array.isArray(value) ? value : [value]
  const text = list
    .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
    .map((s) => s.trim())
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return false
  const remainder = text
    .replace(/\b(remote|work\s+from\s+home|wfh|anywhere|everywhere|worldwide|world|global|all\s+time\s+zones|any\s+location|open\s+to\s+relocation|first|priority|preferred|us|usa|uk|uae|eu|emea)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (remainder.length >= 3) return true
  const country = detectCountry(text)
  return country !== undefined && country !== 'WW'
}