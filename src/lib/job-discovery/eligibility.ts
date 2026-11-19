/**
 * Remote eligibility intelligence.
 *
 * Deterministic and explainable: every decision carries the source snippet
 * that produced it. A job is never assumed worldwide because the word
 * "remote" appears, and a marketing line saying "remote anywhere" cannot
 * override an actual country restriction elsewhere in the posting.
 */

export type EligibilityClassification =
  | 'worldwide'
  | 'country_restricted'
  | 'region_restricted'
  | 'timezone_restricted'
  | 'residency_required'
  | 'contractor_allowed'
  | 'employee_only'
  | 'unknown'

export type EligibilityConfidence = 'confirmed' | 'likely' | 'unknown'

export interface EligibilityEvidence {
  /** Verbatim snippet from the posting (trimmed, max ~180 chars). */
  text: string
  /** The decision this snippet supports. */
  decision: string
}

export interface JobEligibility {
  classification: EligibilityClassification
  remote: boolean
  regions: string[]
  countries: string[]
  timezones: string[]
  residencyRequired: boolean
  workAuthorizationRequired: boolean
  /** True when the posting explicitly allows contracting/1099/freelance. */
  contractorAllowed: boolean | null
  employeeOnly: boolean
  confidence: EligibilityConfidence
  evidence: EligibilityEvidence[]
  explanation: string
}

export interface JobEligibilityInput {
  title: string
  description: string
  locationRaw?: string | null
  remote?: boolean
}

export interface SeekerPreferences {
  /** ISO-3166 alpha-2 when Relay already knows it. */
  country?: string
  /** Free-text location from the profile, used only as a hint. */
  location?: string
  timezone?: string
  /** Never inferred. Unknown means "do not assume authorization". */
  workAuthorization?: 'authorized' | 'unknown'
  employmentPreference?: string
}

export interface EligibilityVerdict {
  eligible: boolean
  confidence: EligibilityConfidence
  reasons: string[]
}

const COUNTRIES: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'u.s.a.': 'US', 'u.s.': 'US', 'us': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'britain': 'GB',
  'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'canada': 'CA', 'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR',
  'colombia': 'CO', 'chile': 'CL', 'peru': 'PE', 'uruguay': 'UY',
  'germany': 'DE', 'france': 'FR', 'netherlands': 'NL', 'spain': 'ES',
  'portugal': 'PT', 'italy': 'IT', 'ireland': 'IE', 'switzerland': 'CH',
  'austria': 'AT', 'belgium': 'BE', 'sweden': 'SE', 'norway': 'NO',
  'denmark': 'DK', 'finland': 'FI', 'poland': 'PL', 'czechia': 'CZ',
  'czech republic': 'CZ', 'hungary': 'HU', 'romania': 'RO', 'bulgaria': 'BG',
  'greece': 'GR', 'croatia': 'HR', 'serbia': 'RS', 'ukraine': 'UA',
  'russia': 'RU', 'turkey': 'TR', 'israel': 'IL', 'united arab emirates': 'AE',
  'uae': 'AE', 'saudi arabia': 'SA', 'egypt': 'EG', 'south africa': 'ZA',
  'nigeria': 'NG', 'kenya': 'KE', 'ghana': 'GH', 'morocco': 'MA',
  'india': 'IN', 'pakistan': 'PK', 'bangladesh': 'BD', 'sri lanka': 'LK',
  'nepal': 'NP', 'indonesia': 'ID', 'malaysia': 'MY', 'philippines': 'PH',
  'singapore': 'SG', 'vietnam': 'VN', 'thailand': 'TH', 'taiwan': 'TW',
  'hong kong': 'HK', 'china': 'CN', 'japan': 'JP', 'south korea': 'KR',
  'australia': 'AU', 'new zealand': 'NZ',
}

const REGIONS: Record<string, string> = {
  'european union': 'EU', 'eu': 'EU', 'europe': 'EU', 'european economic area': 'EEA',
  'eea': 'EEA', 'emea': 'EMEA', 'apac': 'APAC', 'asia-pacific': 'APAC',
  'latin america': 'LATAM', 'latam': 'LATAM', 'south america': 'LATAM',
  'north america': 'NA', 'middle east': 'MEA', 'africa': 'AFR',
}

const TIMEZONES: Record<string, string> = {
  'gmt': 'GMT', 'utc': 'UTC', 'cet': 'CET', 'cest': 'CET',
  'est': 'ET', 'edt': 'ET', 'eastern time': 'ET', 'et': 'ET',
  'cst': 'CT', 'cdt': 'CT', 'central time': 'CT', 'ct': 'CT',
  'mst': 'MT', 'mdt': 'MT', 'mountain time': 'MT', 'mt': 'MT',
  'pst': 'PT', 'pdt': 'PT', 'pacific time': 'PT', 'pt': 'PT',
  'ist': 'IST', 'india standard time': 'IST',
  'aest': 'AEST', 'sydney': 'AEST', 'melbourne': 'AEST',
}

const WORLDWIDE = [
  'worldwide', 'world-wide', 'anywhere in the world', 'anywhere globally',
  'global remote', 'remote anywhere', 'work from anywhere', 'work remotely from anywhere',
  'any location', 'no location restriction', 'no location restrictions',
  'location-agnostic', 'location agnostic', 'location independent', 'location-independent',
  'no matter where you live', 'any country', 'all countries', 'globally',
]

const WORK_AUTH = [
  'authorized to work in', 'authorised to work in', 'work authorization required',
  'work authorisation required', 'legally authorized to work', 'legally authorised to work',
  'proof of work authorization', 'proof of work authorisation', 'visa sponsorship not',
  'no visa sponsorship', 'without sponsorship', 'citizens only', 'citizenship required',
  'must have the right to work', 'right to work in', 'must be a resident', 'must be resident',
  'residents only', 'residency required',
]

const CONTRACTOR = [
  '1099', 'contractor', 'contract work', 'contract-to-hire', 'contract to hire',
  'freelance', 'freelancer', 'self-employed', 'sole trader', 'consultant', 'consulting',
  'independent contractor', 'c2c', 'c2h',
]

const EMPLOYEE_ONLY = [
  'employee only', 'employees only', 'w-2 only', 'w2 only', 'full-time employee',
  'full time employee', 'permanent employee', 'permanent position', 'permanent role',
  'staff member', 'not a contract', 'no contractors', 'no 1099', 'no freelancers',
]

const TIMEZONE_PHRASES = [
  'time zone', 'timezone', 'time zones', 'timezones', 'hours overlap',
  'hour overlap', 'overlap with', 'working hours overlap', 'core hours',
  'business hours in', 'gmt', 'utc', 'eastern time', 'pacific time', 'central time',
  'european time', 'us time zones', 'u.s. time zones', 'eu time',
]

function snippet(text: string, index: number, radius = 90): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + radius)
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + raw + (end < text.length ? '…' : '')
}

function findFirst(text: string, phrases: string[]): { phrase: string; index: number } | null {
  let best: { phrase: string; index: number } | null = null
  for (const phrase of phrases) {
    const index = text.indexOf(phrase)
    if (index >= 0 && (!best || index < best.index)) best = { phrase, index }
  }
  return best
}

function findCountries(text: string): { code: string; evidence: EligibilityEvidence }[] {
  const found: { code: string; evidence: EligibilityEvidence }[] = []
  const seen = new Set<string>()
  // Longest names first so "united states" wins over "us".
  const entries = Object.entries(COUNTRIES).sort((a, b) => b[0].length - a[0].length)
  for (const [name, code] of entries) {
    if (seen.has(code)) continue
    // Bare "us" is the English pronoun ("join us"), not a country. Only treat
    // it as the United States in an explicit location/work-boundary phrase.
    const pattern = code === 'US' && name === 'us'
      ? /(?:\b(?:in|within|across|throughout|for)\s+the\s+us\b|\bus[-\s]+(?:only|based|remote|candidates?|employees?|workers?|residents?|citizens?|locations?|offices?)\b|,\s*us\b)/i
      : new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    const match = text.match(pattern)
    if (match && match.index !== undefined) {
      // "US Eastern time" / "US time zones" is a timezone boundary, not a
      // country boundary. Never let the abbreviation steal that decision.
      const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 24).toLowerCase()
      if (code === 'US' && /^\s+(eastern|central|mountain|pacific|time)/.test(tail)) continue
      seen.add(code)
      found.push({
        code,
        evidence: {
          text: snippet(text, match.index),
          decision: `Mentions ${name} as a location/work boundary`,
        },
      })
    }
  }
  return found
}

function findRegions(text: string): { region: string; evidence: EligibilityEvidence }[] {
  const found: { region: string; evidence: EligibilityEvidence }[] = []
  const seen = new Set<string>()
  const entries = Object.entries(REGIONS).sort((a, b) => b[0].length - a[0].length)
  for (const [name, region] of entries) {
    if (seen.has(region)) continue
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    const match = text.match(pattern)
    if (match && match.index !== undefined) {
      seen.add(region)
      found.push({
        region,
        evidence: {
          text: snippet(text, match.index),
          decision: `Region restriction: ${name}`,
        },
      })
    }
  }
  return found
}

function findTimezones(text: string): { tz: string; evidence: EligibilityEvidence }[] {
  const found: { tz: string; evidence: EligibilityEvidence }[] = []
  const seen = new Set<string>()
  for (const phrase of TIMEZONE_PHRASES) {
    const index = text.indexOf(phrase)
    if (index < 0) continue
    // Map the phrase to a zone when possible; phrase-only restrictions stay named.
    const phraseKey = Object.keys(TIMEZONES).find((key) => phrase.includes(key)) ?? phrase
    const tz = TIMEZONES[phraseKey] ?? phrase.toUpperCase()
    if (seen.has(tz)) continue
    seen.add(tz)
    found.push({
      tz,
      evidence: { text: snippet(text, index), decision: `Timezone restriction: ${phrase}` },
    })
  }
  return found
}

function hasRemoteSignal(input: JobEligibilityInput, text: string): boolean {
  if (input.remote) return true
  if (/^\s*remote\b/i.test(input.locationRaw ?? '')) return true
  return /\bremote\b|\bwork from home\b|\bwfh\b|\btelecommut/i.test(text)
}

/**
 * Classify a posting. Hard restrictions are scanned first, so a benefits
 * section that says "remote anywhere" cannot mask a real country boundary.
 */
export function classifyRemoteEligibility(input: JobEligibilityInput): JobEligibility {
  const description = input.description ?? ''
  const title = input.title ?? ''
  const locationRaw = (input.locationRaw ?? '').trim()
  const text = `${title}\n${locationRaw}\n${description}`.replace(/\r/g, '')
  const lower = text.toLowerCase()

  const evidence: EligibilityEvidence[] = []
  // Countries named in the actual posting are stronger evidence than a
  // location label, which may only be a headquarters.
  const textCountries = findCountries(`${title}\n${description}`.toLowerCase())
  const locationCountries = findCountries(locationRaw.toLowerCase())
  const countries = [...textCountries, ...locationCountries.filter((l) => !textCountries.some((t) => t.code === l.code))]
  const regions = findRegions(lower)
  const timezones = findTimezones(lower)
  const workAuth = findFirst(lower, WORK_AUTH)
  const employeeOnly = findFirst(lower, EMPLOYEE_ONLY)
  const contractor = findFirst(lower, CONTRACTOR)
  const worldwide = findFirst(lower, WORLDWIDE)
  const remote = hasRemoteSignal(input, lower)

  if (workAuth) {
    evidence.push({ text: snippet(lower, workAuth.index), decision: 'Work authorization / residency requirement' })
  }
  for (const c of textCountries) evidence.push(c.evidence)
  for (const r of regions) evidence.push(r.evidence)
  for (const t of timezones) evidence.push(t.evidence)
  if (employeeOnly) evidence.push({ text: snippet(lower, employeeOnly.index), decision: 'Employee-only engagement' })
  if (contractor) evidence.push({ text: snippet(lower, contractor.index), decision: 'Contractor engagement permitted' })
  if (worldwide) evidence.push({ text: snippet(lower, worldwide.index), decision: 'Explicit worldwide language' })

  // A single-country location on a non-worldwide posting is a likely boundary.
  const locationCountry = locationCountries.length === 1 ? locationCountries[0].code : null
  const locationIsBoundary = Boolean(
    locationCountry && !worldwide && !textCountries.some((c) => c.code === locationCountry),
  )
  if (locationIsBoundary && locationCountry) {
    evidence.push({
      text: locationRaw,
      decision: `Location listed as ${locationCountry}; no worldwide statement`,
    })
  }

  const countryCodes = [...new Set([...countries.map((c) => c.code)])]
  const regionCodes = [...new Set(regions.map((r) => r.region))]
  const tzCodes = [...new Set(timezones.map((t) => t.tz))]

  let classification: EligibilityClassification = 'unknown'
  if (countryCodes.length > 0) classification = 'country_restricted'
  else if (regionCodes.length > 0) classification = 'region_restricted'
  else if (tzCodes.length > 0) classification = 'timezone_restricted'
  else if (workAuth) classification = 'residency_required'
  else if (worldwide) classification = 'worldwide'
  else if (employeeOnly) classification = 'employee_only'
  else if (contractor) classification = 'contractor_allowed'
  else if (remote) classification = 'unknown'

  let confidence: EligibilityConfidence = 'unknown'
  if (workAuth || textCountries.length > 0 || regions.length > 0 || timezones.length > 0) confidence = 'confirmed'
  else if (locationIsBoundary || employeeOnly || worldwide) confidence = 'likely'

  const explanation = buildExplanation(classification, {
    countries: countryCodes,
    regions: regionCodes,
    timezones: tzCodes,
    residency: Boolean(workAuth),
    employeeOnly: Boolean(employeeOnly),
    contractor: Boolean(contractor),
    worldwide: Boolean(worldwide),
    remote,
  })

  return {
    classification,
    remote,
    regions: regionCodes,
    countries: countryCodes,
    timezones: tzCodes,
    residencyRequired: Boolean(workAuth),
    workAuthorizationRequired: Boolean(workAuth),
    contractorAllowed: employeeOnly ? false : contractor ? true : null,
    employeeOnly: Boolean(employeeOnly),
    confidence,
    evidence: evidence.slice(0, 12),
    explanation,
  }
}

function buildExplanation(
  classification: EligibilityClassification,
  facts: {
    countries: string[]
    regions: string[]
    timezones: string[]
    residency: boolean
    employeeOnly: boolean
    contractor: boolean
    worldwide: boolean
    remote: boolean
  },
): string {
  switch (classification) {
    case 'residency_required':
      return 'The posting states a residency or work-authorization requirement.'
    case 'country_restricted':
      return `The posting restricts work to ${facts.countries.join(', ')}.`
    case 'region_restricted':
      return `The posting restricts work to ${facts.regions.join(', ')}.`
    case 'timezone_restricted':
      return `The posting restricts work to ${facts.timezones.join(', ')} time zones.`
    case 'worldwide':
      return 'The posting explicitly allows work from anywhere.'
    case 'employee_only':
      return 'The posting is for an employee, not a contractor.'
    case 'contractor_allowed':
      return 'The posting explicitly allows contractor or freelance engagement.'
    case 'unknown':
    default:
      return facts.remote
        ? 'The posting is remote but does not state geographic eligibility.'
        : 'The posting does not state remote eligibility clearly.'
  }
}

/** Extract a single country from a location string; null when ambiguous. */
export function countryFromLocation(location: string | null | undefined): string | null {
  if (!location) return null
  const upper = location.trim().toUpperCase()
  if (['US', 'USA', 'UNITED STATES', 'U.S.', 'U.S.A.'].includes(upper)) return 'US'
  if (['UK', 'UNITED KINGDOM', 'GREAT BRITAIN', 'BRITAIN'].includes(upper)) return 'GB'
  const lower = location.toLowerCase()
  const countries = findCountries(lower)
  if (countries.length === 1) return countries[0].code
  return null
}

const NAMED_TZ_OFFSETS: Record<string, number> = {
  GMT: 0, UTC: 0, CET: 1, CEST: 2, ET: -5, EST: -5, EDT: -4,
  CT: -6, CST: -6, CDT: -5, MT: -7, MST: -7, MDT: -6,
  PT: -8, PST: -8, PDT: -7, IST: 5.5, AEST: 10,
  'Asia/Karachi': 5, 'Asia/Kolkata': 5.5, 'Asia/Dubai': 4,
  'Europe/Berlin': 1, 'Europe/London': 0, 'Europe/Paris': 1,
  'America/New_York': -5, 'America/Chicago': -6, 'America/Denver': -7,
  'America/Los_Angeles': -8, 'America/Sao_Paulo': -3,
  'Australia/Sydney': 10, 'Pacific/Auckland': 12,
}

function tzOffset(tz: string): number | null {
  const named = NAMED_TZ_OFFSETS[tz.trim()]
  if (named !== undefined) return named
  const match = tz.trim().match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return null
  const value = Number(match[2]) + (Number(match[3] ?? 0) / 60)
  return (match[1] === '-' ? -1 : 1) * value
}

/**
 * Compare a job's eligibility against what Relay actually knows about the
 * seeker. Unknown authorization is never treated as authorized, and a
 * location that is merely a hint never becomes a confirmed rejection.
 */
export function evaluateEligibility(
  eligibility: JobEligibility,
  prefs: SeekerPreferences,
): EligibilityVerdict {
  const reasons: string[] = []

  if (!eligibility.remote) {
    return { eligible: false, confidence: 'confirmed', reasons: ['This is not a remote role.'] }
  }

  if (eligibility.residencyRequired) {
    if (!prefs.country) {
      reasons.push('The role requires work authorization Relay has not recorded; confirm eligibility before applying.')
      return { eligible: false, confidence: 'unknown', reasons }
    }
    if (eligibility.countries.length > 0 && !eligibility.countries.includes(prefs.country)) {
      reasons.push(`The role is restricted to ${eligibility.countries.join(', ')} and requires authorization there; your recorded location is ${prefs.country}.`)
      return { eligible: false, confidence: 'confirmed', reasons }
    }
    if (prefs.workAuthorization !== 'authorized') {
      reasons.push('The role requires work authorization; Relay has not recorded that you hold it.')
      return { eligible: false, confidence: 'unknown', reasons }
    }
  }

  if (eligibility.classification === 'country_restricted' && prefs.country) {
    if (!eligibility.countries.includes(prefs.country)) {
      reasons.push(`The role is restricted to ${eligibility.countries.join(', ')}; your recorded location is ${prefs.country}.`)
      return { eligible: false, confidence: 'confirmed', reasons }
    }
  }

  if (eligibility.classification === 'region_restricted') {
    const regionCountry = regionForCountry(prefs.country)
    if (prefs.country && regionCountry && !eligibility.regions.some((r) => r === regionCountry)) {
      reasons.push(`The role is restricted to ${eligibility.regions.join(', ')}; your recorded location is outside it.`)
      return { eligible: false, confidence: 'likely', reasons }
    }
    if (!prefs.country) {
      reasons.push(`The role is restricted to ${eligibility.regions.join(', ')}; Relay has no recorded location to compare.`)
      return { eligible: false, confidence: 'unknown', reasons }
    }
  }

  if (eligibility.classification === 'timezone_restricted' && prefs.timezone) {
    const seekerOffset = tzOffset(prefs.timezone)
    const overlap = eligibility.timezones.some((tz) => {
      const jobOffset = tzOffset(tz)
      if (jobOffset === null || seekerOffset === null) return true
      return Math.abs(seekerOffset - jobOffset) <= 4
    })
    if (!overlap) {
      reasons.push(`The role requires ${eligibility.timezones.join(', ')} hours; your timezone is ${prefs.timezone}.`)
      return { eligible: false, confidence: 'likely', reasons }
    }
  }

  if (eligibility.employeeOnly && prefs.employmentPreference?.toLowerCase().includes('contract')) {
    reasons.push('The role is employee-only and your preference is contract work.')
    return { eligible: false, confidence: 'likely', reasons }
  }

  if (eligibility.classification === 'worldwide') {
    return { eligible: true, confidence: 'confirmed', reasons: ['Worldwide remote.'] }
  }

  return {
    eligible: eligibility.classification !== 'unknown',
    confidence: eligibility.confidence,
    reasons: reasons.length > 0 ? reasons : [eligibility.explanation],
  }
}

function regionForCountry(code: string | undefined): string | null {
  if (!code) return null
  const eu = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']
  const eea = [...eu, 'IS', 'LI', 'NO']
  const emea = [...eea, 'GB', 'CH', 'TR', 'IL', 'AE', 'SA', 'EG', 'ZA', 'NG', 'KE']
  if (emea.includes(code)) return 'EMEA'
  if (eea.includes(code)) return 'EEA'
  if (eu.includes(code)) return 'EU'
  const na = ['US', 'CA', 'MX']
  if (na.includes(code)) return 'NA'
  const latam = ['BR', 'AR', 'CO', 'CL', 'PE', 'UY']
  if (latam.includes(code)) return 'LATAM'
  return null
}
