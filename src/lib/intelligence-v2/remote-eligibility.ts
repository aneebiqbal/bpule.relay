/**
 * Remote Eligibility Module
 *
 * Determines whether a Pakistan-based team can realistically pursue an
 * opportunity. This is NOT about local employment — it's about remote
 * international contracts, freelance projects, and clients.
 *
 * Key principle: Company location ≠ required worker location.
 */

import type {
  RemoteEligibility,
  WorkplaceType,
  RemoteScope,
  EligibilityStatus,
} from './types'

// ── Workplace Type Detection ───────────────────────────────────────────────

const REMOTE_FULL = /\b(remote|work from home|work from anywhere|fully remote|100% remote|location independent|distributed team|distributed workforce|fully distributed)\b/i
const REMOTE_US_ANYWHERE = /\b(us[- ]?wide|anywhere in the us|anywhere in the usa|continental us|contiguous us|48 states|lower 48|us only|usa only|american[- ]only)\b/i
const REMOTE_UK_ANYWHERE = /\b(uk[- ]?wide|anywhere in the uk|anywhere in england)\b/i
const REMOTE_EU_ONLY = /\b(eu only|european union only|eea only|eu\/eea|europe only)\b/i
const REMOTE_COUNTRY_RESTRICTED = /\b((?:only|must be (?:in|based in|located in|resident in))\s+(?:the\s+)?(?:us|usa|united states|uk|united kingdom|canada|australia|germany|netherlands|switzerland|singapore|uae))\b/i
// Employer restriction patterns — ONLY match explicit employer language like
// "we only hire US workers", "must be based in UK". Does NOT match
// "looking for roles in UK" (that's job seeker preference, not restriction).
const EMPLOYER_ONLY_HIRE = /\b(we only hire|only hiring|must be based in|must reside in|only accept(?:ing)? applications? from|only for (?:us|uk|eu) (?:residents|citizens|workers)|restricted to (?:us|uk|eu))\b/i

// Job seeker context detection — when present, geography = person's preference
export const JOB_SEEKER_MARKERS = /\b(open to work|looking for (?:a |remote | )?(?:job|role|position|opportunity|work|employment)|seeking (?:a |remote | )?(?:job|role|position|opportunity)|#OpenToWork|available for (?:freelance|contract|remote)|available for hire|looking to (?:join|work|relocate))\b/i
const HYBRID = /\b(hybrid|part[- ]?remote|partial remote|office days|in[- ]?office|split between|\d+\s*days?\s*(?:\/\s*week)?\s*(?:in|at).{0,20}\boffice\b)\b/i
const ONSITE = /\b(on[- ]?site|onsite|in[- ]?person|in[- ]?office|at our (?:office|headquarters|location)|based in (?:the )?(?:office|hq))\b/i
const IMPLICIT_REMOTE_ASK = /\b(looking for|need (?:a|an|someone|help)?|seeking|dm me|reach out|contract|freelance|engagement|project basis|upwork|proposal)\b/i
const TECH_ROLE_HINT = /\b(developer|engineer|full[- ]?stack|backend|frontend|software|app|platform|rails|react(?!ion)|node|python|api|extension|devops|architect)\b/i

// ── Timezone Detection ─────────────────────────────────────────────────────

const TZ_PST_PDT = /\b(pst|pdt|pacific(?:\s+time)?|pacific standard|pacific daylight)\b/i
const TZ_EST_EDT = /\b(est|edt|eastern time|eastern standard|eastern daylight)\b/i
const TZ_CST_CDT = /\b(cst|cdt|central time|central standard|central daylight)\b/i
const TZ_GMT_UTC = /\b(gmt|utc|greenwich|universal time)\b/i
const TZ_CET = /\b(cet|cest|central european)\b/i
const TZ_OVERLAP = /\b(timezone overlap|overlapping hours|overlap with|similar time|close timezone|nearby timezone|within \d+ hours? (?:of|from))\b/i
const TZ_FLEXIBLE = /\b(flexible hours|flexible schedule|async|asynchronous|work when you want|your own hours|results[- ]?oriented)\b/i

// ── Country Restrictions ───────────────────────────────────────────────────

const COUNTRY_RESTRICTIONS: Array<{ pattern: RegExp; country: string }> = [
  { pattern: /\b(?:united states|usa|us only|us[- ]?based)\b/i, country: 'US' },
  { pattern: /\b(?:united kingdom|uk only|uk[- ]?based|britain|great britain)\b/i, country: 'UK' },
  { pattern: /\b(?:canada|canadian only|ca[- ]?based)\b/i, country: 'CA' },
  { pattern: /\b(?:australia|australian only|au[- ]?based|aussie)\b/i, country: 'AU' },
  { pattern: /\b(?:germany|german only|de[- ]?based)\b/i, country: 'DE' },
  { pattern: /\b(?:netherlands|dutch only|nl[- ]?based)\b/i, country: 'NL' },
  { pattern: /\b(?:switzerland|swiss only|ch[- ]?based)\b/i, country: 'CH' },
  { pattern: /\b(?:singapore|sg[- ]?based)\b/i, country: 'SG' },
  { pattern: /\b(?:uae|united arab emirates|dubai|abu dhabi)\b/i, country: 'AE' },
  { pattern: /\b(?:india|indian only|in[- ]?based)\b/i, country: 'IN' },
]

const EXPLICIT_PAKISTAN_ALLOWED = /\b(pakistan|pakistani|pkt)\b/i
const WORLDWIDE_REMOTE = /\b(?:work from anywhere|no location restriction|no geographic restriction|regardless of location|all countries|hire[sd]? (?:worldwide|globally)|(?:fully\s+)?remote(?:ly)?(?:\W+\w+){0,4}\W+(?:worldwide|globally|anywhere)|worldwide\s+remote)\b/i

// ── PKT Overlap Calculation ────────────────────────────────────────────────

interface TimezoneOffset {
  label: string
  offsetHours: number // from UTC
}

const TZ_OFFSETS: Record<string, TimezoneOffset> = {
  PST: { label: 'PST/PDT', offsetHours: -8 },
  PDT: { label: 'PST/PDT', offsetHours: -7 },
  EST: { label: 'EST/EDT', offsetHours: -5 },
  EDT: { label: 'EST/EDT', offsetHours: -4 },
  CST: { label: 'CST/CDT', offsetHours: -6 },
  CDT: { label: 'CST/CDT', offsetHours: -5 },
  GMT: { label: 'GMT/UTC', offsetHours: 0 },
  UTC: { label: 'GMT/UTC', offsetHours: 0 },
  CET: { label: 'CET/CEST', offsetHours: 1 },
  CEST: { label: 'CET/CEST', offsetHours: 2 },
  IST: { label: 'IST (India)', offsetHours: 5.5 },
  PKT: { label: 'PKT (Pakistan)', offsetHours: 5 },
  AEDT: { label: 'AEDT', offsetHours: 11 },
  ACST: { label: 'ACST', offsetHours: 9.5 },
  JST: { label: 'JST', offsetHours: 9 },
  SGT: { label: 'SGT', offsetHours: 8 },
  GST: { label: 'GST (UAE)', offsetHours: 4 },
}

function calculatePktOverlap(tzLabel: string): number {
  const tz = Object.values(TZ_OFFSETS).find((t) =>
    tzLabel.toLowerCase().includes(t.label.split('/')[0].toLowerCase())
  )
  if (!tz) return 50 // Unknown, assume moderate
  const pktOffset = 5 // PKT = UTC+5
  const diff = Math.abs(tz.offsetHours - pktOffset)
  if (diff <= 2) return 90 // Excellent overlap
  if (diff <= 4) return 70 // Good overlap
  if (diff <= 6) return 50 // Moderate overlap
  if (diff <= 8) return 30 // Poor overlap
  return 15 // Very poor overlap
}

// ── Main Assessment Function ───────────────────────────────────────────────

export interface RemoteEligibilityInput {
  /** Raw text to analyze (job description, profile, etc.) */
  rawText: string
  /** Explicitly stated workplace type if known */
  statedWorkplaceType?: WorkplaceType
  /** Explicitly stated remote scope if known */
  statedRemoteScope?: RemoteScope
  /** Company location (NOT worker location requirement) */
  companyLocation?: string | null
  /** Explicitly required worker geography */
  requiredWorkerLocation?: string | null
  /** Job title for context */
  title?: string | null
  /**
   * Source context determines how geography is interpreted.
   * - 'employer_post': geography = employer restriction (bad for scoring)
   * - 'job_seeker_profile': geography = person's preference (neutral/positive)
   * - 'unknown': auto-detect from text content
   */
  sourceContext?: 'employer_post' | 'job_seeker_profile' | 'unknown'
}

export function assessRemoteEligibility(input: RemoteEligibilityInput): RemoteEligibility {
  const text = input.rawText
  const evidence: string[] = []

  // ── Step 1: Determine Workplace Type ──────────────────────────────────
  let workplaceType: WorkplaceType = input.statedWorkplaceType ?? 'UNKNOWN'

  if (workplaceType === 'UNKNOWN') {
    if (ONSITE.test(text)) {
      workplaceType = 'ONSITE'
      evidence.push('On-site requirement detected in text.')
    } else if (HYBRID.test(text)) {
      workplaceType = 'HYBRID'
      evidence.push('Hybrid work arrangement detected.')
    } else if (REMOTE_FULL.test(text)) {
      workplaceType = 'REMOTE'
      evidence.push('Remote work indicated.')
    }
  }

  // Extract office location from text for hybrid/onsite roles
  if ((workplaceType === 'HYBRID' || workplaceType === 'ONSITE') && !input.requiredWorkerLocation) {
    const locationMatch = text.match(/\b(?:in|at|from)\s+(?:our\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?,\s*(?:[A-Z]{2}|[A-Z][A-Za-z]+))\b/)
    if (locationMatch) {
      input.requiredWorkerLocation = locationMatch[1]
      evidence.push(`Office location detected: ${locationMatch[1]}.`)
    }
  }

  // ── Step 2: Determine Remote Scope ────────────────────────────────────
  let remoteScope: RemoteScope = input.statedRemoteScope ?? 'UNKNOWN'
  const allowedCountries: string[] = []
  let restrictedCountries: string[] = []
  let timezoneRequirement: string | null = null

  // Detect job seeker context — geography in a job seeker profile means
  // "I want to work here", NOT "employer restricts to this location".
  const isJobSeeker = input.sourceContext === 'job_seeker_profile' ||
    (input.sourceContext !== 'employer_post' && JOB_SEEKER_MARKERS.test(text))

  if (remoteScope === 'UNKNOWN') {
    if (WORLDWIDE_REMOTE.test(text)) {
      remoteScope = 'WORLDWIDE'
      evidence.push('Position is explicitly worldwide/global.')
    } else if (!isJobSeeker && EMPLOYER_ONLY_HIRE.test(text)) {
      // Only treat as employer restriction if NOT a job seeker profile
      remoteScope = 'COUNTRY_RESTRICTED'
      for (const { pattern, country } of COUNTRY_RESTRICTIONS) {
        if (pattern.test(text)) restrictedCountries.push(country)
      }
      evidence.push(`Worker location restricted to: ${restrictedCountries.join(', ')}.`)
    } else if (!isJobSeeker && REMOTE_COUNTRY_RESTRICTED.test(text)) {
      remoteScope = 'COUNTRY_RESTRICTED'
      for (const { pattern, country } of COUNTRY_RESTRICTIONS) {
        if (pattern.test(text)) {
          restrictedCountries.push(country)
        }
      }
      evidence.push(`Worker location restricted to: ${restrictedCountries.join(', ')}.`)
    } else if (!isJobSeeker && REMOTE_EU_ONLY.test(text)) {
      remoteScope = 'REGION_RESTRICTED'
      restrictedCountries.push('EU')
      evidence.push('Restricted to EU/EEA workers.')
    } else if (TZ_OVERLAP.test(text) || TZ_FLEXIBLE.test(text)) {
      remoteScope = 'TIMEZONE_RESTRICTED'
      if (TZ_PST_PDT.test(text)) {
        timezoneRequirement = 'PST/PDT'
        evidence.push('Pacific timezone overlap required.')
      } else if (TZ_EST_EDT.test(text)) {
        timezoneRequirement = 'EST/EDT'
        evidence.push('Eastern timezone overlap required.')
      } else if (TZ_CST_CDT.test(text)) {
        timezoneRequirement = 'CST/CDT'
        evidence.push('Central timezone overlap required.')
      } else if (TZ_GMT_UTC.test(text)) {
        timezoneRequirement = 'GMT/UTC'
        evidence.push('GMT/UTC timezone overlap required.')
      } else if (TZ_CET.test(text)) {
        timezoneRequirement = 'CET/CEST'
        evidence.push('Central European timezone overlap required.')
      } else {
        timezoneRequirement = 'flexible'
        evidence.push('Flexible/async work indicated.')
      }
    } else if (workplaceType === 'REMOTE' && REMOTE_EU_ONLY.test(text) && !isJobSeeker) {
      remoteScope = 'REGION_RESTRICTED'
      restrictedCountries.push('EU')
      evidence.push('Remote but restricted to EU/EEA workers.')
    } else if (workplaceType === 'REMOTE') {
      remoteScope = 'ANYWHERE'
      evidence.push('Remote with no stated restrictions.')
    }
  }

  if (workplaceType === 'UNKNOWN' && remoteScope !== 'UNKNOWN') {
    workplaceType = 'REMOTE'
    evidence.push('Inferred remote workplace from explicit remote scope/restrictions.')
  }

  if (
    workplaceType === 'UNKNOWN' &&
    IMPLICIT_REMOTE_ASK.test(text) &&
    TECH_ROLE_HINT.test(text) &&
    !ONSITE.test(text) &&
    !HYBRID.test(text)
  ) {
    workplaceType = 'REMOTE'
    if (remoteScope === 'UNKNOWN') {
      remoteScope = 'ANYWHERE'
    }
    evidence.push('Inferred remote opportunity from explicit ask for external project help.')
  }

  // ── Defensive: Company location ≠ worker restriction ────────────────
  // If the text explicitly says remote work is OK but we somehow ended up
  // with a COUNTRY_RESTRICTED scope, override it. Company HQ location does
  // NOT constitute a worker location restriction.
  const EXPLICIT_REMOTE_OK = /\b(remote[- ]?(?:ok|friendly|only|work|first|allowed)|work from (?:home|anywhere|wherever)|fully remote|100% remote|distributed team|location[- ]?independent)\b/i
  if (remoteScope === 'COUNTRY_RESTRICTED' && EXPLICIT_REMOTE_OK.test(text)) {
    remoteScope = 'ANYWHERE'
    restrictedCountries = []
    evidence.push('Override: text explicitly says remote OK — company location is not a worker restriction.')
  }

  // ── Step 3: Check for explicit Pakistan allowance ────────────────────
  const pakistanAllowed = EXPLICIT_PAKISTAN_ALLOWED.test(text)

  // ── Step 4: Determine Eligibility ────────────────────────────────────
  let eligibility: EligibilityStatus
  let reason: string
  let pktOverlapFeasibility: number | undefined

  if (pakistanAllowed && restrictedCountries.length === 0) {
    eligibility = 'ELIGIBLE'
    reason = 'Explicitly open to Pakistan-based workers.'
  } else if (workplaceType === 'ONSITE' && input.requiredWorkerLocation && !pakistanAllowed) {
    // EVIDENCE OWNERSHIP: Job seeker location preference is NOT an employer restriction.
    // Only treat as INELIGIBLE if this is explicitly an employer post, not a person's profile.
    if (input.sourceContext === 'job_seeker_profile') {
      eligibility = 'ELIGIBLE'
      reason = 'Job seeker location preference — not an employer restriction. Candidate is open to opportunities.'
    } else {
      const onSiteLocation = input.requiredWorkerLocation.toLowerCase()
      const isPakistanOnsite = /\b(pakistan|karachi|lahore|islamabad|peshawar|quetta|faisalabad|multan|rawalpindi)\b/i.test(onSiteLocation)
      if (isPakistanOnsite) {
        eligibility = 'ELIGIBLE'
        reason = 'On-site role in Pakistan — local engagement possible.'
      } else {
        eligibility = 'INELIGIBLE'
        reason = `On-site role required in ${input.requiredWorkerLocation} — not compatible with Pakistan-based remote work.`
      }
    }
  } else if (workplaceType === 'HYBRID' && input.requiredWorkerLocation && !pakistanAllowed) {
    // EVIDENCE OWNERSHIP: Same guard for hybrid roles — person preference ≠ employer requirement.
    if (input.sourceContext === 'job_seeker_profile') {
      eligibility = 'ELIGIBLE'
      reason = 'Job seeker location preference — not an employer restriction. Candidate is open to opportunities.'
    } else {
      const hybridLocation = input.requiredWorkerLocation.toLowerCase()
      const isPakistanHybrid = /\b(pakistan|karachi|lahore|islamabad)\b/i.test(hybridLocation)
      if (isPakistanHybrid) {
        eligibility = 'LIKELY_ELIGIBLE'
        reason = `Hybrid role based in ${input.requiredWorkerLocation} — local presence possible.`
      } else {
        eligibility = 'INELIGIBLE'
        reason = `Hybrid role requires presence in ${input.requiredWorkerLocation} — not compatible with Pakistan-based remote work.`
      }
    }
  } else if (workplaceType === 'REMOTE' && remoteScope === 'WORLDWIDE') {
    eligibility = 'ELIGIBLE'
    reason = 'Remote worldwide — eligible from Pakistan.'
  } else if (workplaceType === 'REMOTE' && remoteScope === 'ANYWHERE') {
    eligibility = 'ELIGIBLE'
    reason = 'Remote with no geographic restrictions — eligible from Pakistan.'
  } else if (workplaceType === 'REMOTE' && remoteScope === 'COUNTRY_RESTRICTED') {
    // EVIDENCE OWNERSHIP: If this is a job seeker profile, "restricted" countries
    // are the person's own preferences, not employer requirements.
    if (input.sourceContext === 'job_seeker_profile') {
      eligibility = 'ELIGIBLE'
      reason = 'Job seeker is open to opportunities in these locations — Pakistan-based team can engage as a remote service provider.'
    } else if (restrictedCountries.includes('PK') || pakistanAllowed) {
      eligibility = 'ELIGIBLE'
      reason = 'Pakistan explicitly allowed.'
    } else if (restrictedCountries.some((c) => ['US', 'UK', 'CA', 'AU', 'DE', 'NL', 'CH'].includes(c))) {
      eligibility = 'INELIGIBLE'
      reason = `Restricted to ${restrictedCountries.join(', ')} — Pakistan-based workers excluded.`
    } else {
      eligibility = 'UNCLEAR'
      reason = `Restricted to ${restrictedCountries.join(', ')} — verify Pakistan eligibility.`
    }
  } else if (workplaceType === 'REMOTE' && remoteScope === 'REGION_RESTRICTED') {
    // EVIDENCE OWNERSHIP: Same guard — region restrictions from job seeker text are preferences.
    if (input.sourceContext === 'job_seeker_profile') {
      eligibility = 'ELIGIBLE'
      reason = 'Job seeker region preference — not an employer restriction.'
    } else if (restrictedCountries.includes('EU')) {
      eligibility = 'INELIGIBLE'
      reason = 'Restricted to EU/EEA workers — Pakistan is not in the EU/EEA.'
    } else {
      eligibility = 'UNCLEAR'
      reason = `Region-restricted — verify Pakistan eligibility.`
    }
  } else if (workplaceType === 'REMOTE' && remoteScope === 'TIMEZONE_RESTRICTED') {
    if (timezoneRequirement === 'flexible') {
      eligibility = 'LIKELY_ELIGIBLE'
      reason = 'Flexible/async schedule — timezone not a barrier.'
      pktOverlapFeasibility = 85
    } else if (timezoneRequirement) {
      pktOverlapFeasibility = calculatePktOverlap(timezoneRequirement)
      if (pktOverlapFeasibility >= 70) {
        eligibility = 'LIKELY_ELIGIBLE'
        reason = `${timezoneRequirement} timezone has good PKT overlap (~${pktOverlapFeasibility}%).`
      } else if (pktOverlapFeasibility >= 40) {
        eligibility = 'UNCLEAR'
        reason = `${timezoneRequirement} timezone has moderate PKT overlap (~${pktOverlapFeasibility}%) — partial overlap feasible.`
      } else {
        eligibility = 'INELIGIBLE'
        reason = `${timezoneRequirement} timezone has poor PKT overlap (~${pktOverlapFeasibility}%).`
      }
    } else {
      eligibility = 'UNCLEAR'
      reason = 'Timezone overlap required but specific timezone not stated.'
      pktOverlapFeasibility = 50
    }
  } else if (workplaceType === 'UNKNOWN') {
    eligibility = 'UNCLEAR'
    reason = 'No workplace information — cannot determine eligibility. Not automatic rejection.'
  } else {
    eligibility = 'UNCLEAR'
    reason = 'Insufficient information for a definitive eligibility determination.'
  }

  return {
    workplaceType,
    remoteScope,
    eligibility,
    allowedCountries: allowedCountries.length > 0 ? allowedCountries : undefined,
    restrictedCountries: restrictedCountries.length > 0 ? restrictedCountries : undefined,
    timezoneRequirement: timezoneRequirement ?? undefined,
    pktOverlapFeasibility,
    reason,
    evidence: evidence.length > 0 ? evidence : undefined,
  }
}

// ── Helper: Get eligibility score contribution ────────────────────────────

export function eligibilityScoreContribution(eligibility: RemoteEligibility): number {
  switch (eligibility.eligibility) {
    case 'ELIGIBLE':
      return 20
    case 'LIKELY_ELIGIBLE':
      return 14
    case 'UNCLEAR':
      return 8
    case 'INELIGIBLE':
      return -30 // Hard negative
    default:
      return 0
  }
}
