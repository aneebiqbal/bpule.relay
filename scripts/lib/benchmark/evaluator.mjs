/**
 * Relay Intelligence Benchmark — Core Evaluator
 *
 * Evaluates a candidate intelligence pipeline against the golden dataset.
 * Checks automatic invariants and produces scored results.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load golden dataset ──────────────────────────────────────────────────────

export function loadGoldenDataset() {
  const path = join(__dirname, 'golden-dataset.json')
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw)
}

// ── Invariant checks ─────────────────────────────────────────────────────────

/**
 * Check automatic invariants that must never be violated.
 * Returns array of failure descriptions (empty = all pass).
 */
export function checkInvariants(caseObj, extraction, scoring) {
  const failures = []

  // 1. Source URL lost
  if (caseObj.source_urls?.length > 0 && extraction) {
    const extractionStr = JSON.stringify(extraction ?? {}).toLowerCase()
    const urlPreserved = caseObj.source_urls.some((url) => {
      // Check full URL, normalized URL, and domain+path fragments
      const normalized = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '')
      const domainPath = normalized.split('?')[0] // strip query params
      return extractionStr.includes(domainPath) ||
             extractionStr.includes(normalized) ||
             extractionStr.includes(url.toLowerCase())
    })
    if (!urlPreserved) {
      failures.push(`FAIL: Source URL lost. Expected one of: ${caseObj.source_urls.join(', ')}`)
    }
  }

  // 2. Supplied company/person lost
  if (caseObj.must_preserve_fields?.length > 0) {
    const extractionStr = JSON.stringify(extraction ?? {}).toLowerCase()
    for (const field of caseObj.must_preserve_fields) {
      if (field.includes(',')) {
        // Location fields: check components
        const parts = field.split(',').map((s) => s.trim().toLowerCase())
        const allPresent = parts.every((p) => extractionStr.includes(p))
        if (!allPresent && extraction) {
          failures.push(`FAIL: Required field lost: "${field}"`)
        }
      } else {
        if (!extractionStr.includes(field.toLowerCase()) && extraction) {
          failures.push(`FAIL: Required field lost: "${field}"`)
        }
      }
    }
  }

  // 3. Fabricated fact (check must_not_invent)
  if (caseObj.must_not_invent?.length > 0) {
    const extractionStr = JSON.stringify(extraction ?? {}).toLowerCase()
    for (const field of caseObj.must_not_invent) {
      // Check if the extraction invented a specific value for something marked unknown
      const fieldLower = field.toLowerCase()
      if (fieldLower === 'revenue' && /\$?\d{4,}/.test(extractionStr)) {
        failures.push(`FAIL: Possible fabrication — revenue value invented`)
      }
      if (fieldLower === 'team_size' && /team of \d+|\d+ engineers|\d+ person team/.test(extractionStr)) {
        failures.push(`FAIL: Possible fabrication — team size invented`)
      }
      if (fieldLower === 'funding_amount' && /raised \$\d+m|seed round \$\d+/i.test(extractionStr)) {
        failures.push(`FAIL: Possible fabrication — funding amount invented`)
      }
    }
  }

  // 4. Worldwide remote marked ineligible because company is abroad
  if (caseObj.expected_remote_eligibility === 'worldwide' && extraction?.remoteEligibility) {
    if (extraction.remoteEligibility === 'ineligible' || extraction.remoteEligibility === 'restricted') {
      const companyLocation = extraction.companyLocation?.toLowerCase() ?? ''
      const foreignLocation = !companyLocation.includes('usa') && !companyLocation.includes('united states') && companyLocation.length > 0
      if (foreignLocation) {
        failures.push(`FAIL: Worldwide remote marked ineligible solely because company is abroad (${extraction.companyLocation})`)
      }
    }
  }

  // 5. Explicit US-only remote marked worldwide
  if (caseObj.expected_remote_eligibility === 'us_only' && extraction?.remoteEligibility) {
    if (extraction.remoteEligibility === 'worldwide') {
      failures.push(`FAIL: Explicit US-only restriction marked as worldwide remote`)
    }
  }

  // 6. On-site international treated as normal remote opportunity
  if (['onsite_manhattan', 'hybrid_london'].includes(caseObj.expected_remote_eligibility)) {
    if (extraction?.remoteEligibility === 'worldwide' || extraction?.remoteEligibility === 'remote_friendly') {
      failures.push(`FAIL: ${caseObj.expected_remote_eligibility} opportunity treated as remote-friendly`)
    }
  }

  // 7. Malformed output
  if (extraction && typeof extraction !== 'object') {
    failures.push(`FAIL: Extraction output is not an object`)
  }
  // For Upwork jobs, client name is in a different field — don't flag missing company
  if (extraction && !extraction.company && !extraction.name && caseObj.type !== 'upwork_job') {
    failures.push(`FAIL: Extraction missing both company and name`)
  }

  // 8. Missing raw input (case itself)
  if (!caseObj.raw_input || caseObj.raw_input.trim().length === 0) {
    failures.push(`FAIL: Golden case missing raw_input`)
  }

  return failures
}

// ── Remote eligibility evaluation ────────────────────────────────────────────

export function evaluateRemoteEligibility(caseObj, extraction) {
  const expected = caseObj.expected_remote_eligibility
  const actual = extraction?.remoteEligibility ?? 'unknown'

  // Always accept exact match
  if (actual === expected) return { expected, actual, matches: true, severity: 'ok' }

  const eligibilityMatrix = {
    worldwide: ['worldwide', 'remote_friendly', 'remote_anywhere', 'remote'],
    us_only: ['us_only', 'us_remote', 'restricted_us', 'restricted'],
    eu_only: ['eu_only', 'eu_remote', 'restricted_eu', 'restricted'],
    hybrid_london: ['hybrid', 'hybrid_london', 'office_required', 'hybrid_anywhere'],
    onsite_manhattan: ['onsite', 'onsite_ny', 'office_required', 'onsite_anywhere'],
    not_applicable: ['not_applicable', 'none', 'ineligible', 'no'],
    unknown: ['unknown', 'unspecified'],
  }

  const acceptable = eligibilityMatrix[expected] ?? [expected]
  const matches = acceptable.includes(actual)

  return {
    expected,
    actual,
    matches,
    severity: matches ? 'ok' : getSeverityForMismatch(expected, actual),
  }
}

function getSeverityForMismatch(expected, actual) {
  if (expected === 'worldwide' && (actual === 'ineligible' || actual === 'restricted')) return 'critical'
  if ((expected === 'us_only' || expected === 'eu_only') && actual === 'worldwide') return 'high'
  if ((expected === 'hybrid_london' || expected === 'onsite_manhattan') && actual === 'worldwide') return 'critical'
  return 'medium'
}

// ── Extraction completeness ──────────────────────────────────────────────────

export function evaluateExtractionCompleteness(caseObj, extraction) {
  if (!extraction) return { score: 0, max: 0, details: 'No extraction output' }

  const expected = caseObj.expected_key_facts ?? {}
  let found = 0
  let total = 0
  const missing = []

  // Check company name
  if (expected.company) {
    total++
    if (extraction.company?.toLowerCase().includes(expected.company.toLowerCase()) ||
        extraction.company?.toLowerCase().includes(expected.company.split(' ')[0].toLowerCase())) {
      found++
    } else {
      missing.push(`company: expected "${expected.company}"`)
    }
  }

  // Check person name
  if (expected.person) {
    total++
    const nameParts = expected.person.toLowerCase().split(' ')
    if (extraction.name?.toLowerCase().includes(nameParts[0])) {
      found++
    } else {
      missing.push(`person: expected "${expected.person}"`)
    }
  }

  // Check signal type
  if (expected.signal) {
    total++
    const signalFromExtraction =
      typeof extraction.signalType === 'string'
        ? extraction.signalType.toLowerCase()
        : typeof extraction.signal === 'string'
          ? extraction.signal.toLowerCase()
          : mapNumericSignalToName(extraction.signalType)
    if (signalFromExtraction === expected.signal.toLowerCase()) {
      found++
    } else {
      missing.push(`signal: expected "${expected.signal}"`)
    }
  }

  // Check location
  if (expected.location) {
    total++
    const locationParts = expected.location.toLowerCase().split(',').map(s => s.trim())
    const extractionLocation = (extraction.locationRaw ?? extraction.location ?? '').toLowerCase()
    if (locationParts.some(p => extractionLocation.includes(p))) {
      found++
    } else {
      missing.push(`location: expected "${expected.location}"`)
    }
  }

  // Check tech stack (at least 2 of expected)
  if (expected.tech_stack?.length > 0) {
    total++
    const extractionStr = JSON.stringify(extraction).toLowerCase()
    const stackMatches = expected.tech_stack.filter(t =>
      extractionStr.includes(t.toLowerCase())
    ).length
    if (stackMatches >= 2) {
      found++
    } else {
      missing.push(`tech_stack: only ${stackMatches}/${expected.tech_stack.length} found`)
    }
  }

  return {
    score: found,
    max: total,
    fraction: total > 0 ? found / total : 0,
    missing,
  }
}

function mapNumericSignalToName(signalType) {
  const n = typeof signalType === 'number' ? signalType : Number(signalType)
  if (!Number.isFinite(n)) return null
  if (n === 1) return 'hiring'
  if (n === 2) return 'understaffed'
  if (n === 3) return 'funding'
  if (n === 4) return 'stale'
  if (n === 5) return 'weak_stack'
  if (n === 6) return 'pain'
  if (n === 7) return 'asking'
  return null
}

// ── Scoring alignment ────────────────────────────────────────────────────────

export function evaluateScoring(caseObj, scoring) {
  if (!scoring) return { evaluated: false }

  const outcome = caseObj.known_outcome
  const score = scoring.total ?? scoring.score ?? 0
  const verdict = scoring.verdict ?? 'unknown'

  let alignment = 'unknown'
  let notes = ''

  switch (outcome) {
    case 'WON':
      // Known wins should NOT be skipped. Lower score is acceptable but skip is wrong.
      if (verdict === 'skip') {
        alignment = 'misaligned'
        notes = `Known WON case scored as "skip" (score: ${score}). Real win was underrated.`
      } else if (verdict === 'research_more') {
        alignment = 'acceptable'
        notes = `Known WON case scored as "research_more" (score: ${score}). Could be higher.`
      } else if (verdict === 'send') {
        alignment = 'aligned'
        notes = `Known WON case correctly scored as "send" (score: ${score}).`
      }
      break
    case 'STRONG_OPPORTUNITY':
      if (verdict === 'skip') {
        alignment = 'misaligned'
        notes = `Strong opportunity scored as "skip" (score: ${score}).`
      } else {
        alignment = 'aligned'
      }
      break
    case 'BAD_PROSPECT':
      if (verdict === 'send') {
        alignment = 'misaligned'
        notes = `Bad prospect scored as "send" (score: ${score}).`
      } else {
        alignment = 'aligned'
      }
      break
    case 'INELIGIBLE':
      // Ineligible should not be scored as send
      if (verdict === 'send') {
        alignment = 'misaligned'
        notes = `Ineligible opportunity scored as "send" (score: ${score}).`
      } else {
        alignment = 'aligned'
      }
      break
    default:
      alignment = 'unknown'
  }

  return {
    evaluated: true,
    score,
    verdict,
    alignment,
    notes,
  }
}

// ── Actionability assertion ─────────────────────────────────────────────────

export function evaluateActionability(caseObj, scoring) {
  if (caseObj.expected_actionability !== 'high_priority_actionable_unless_evidence_backed_reason') {
    return { evaluated: false }
  }

  const verdict = scoring?.verdict ?? 'unknown'
  const qualification = scoring?.qualification ?? null

  if (verdict === 'send' || qualification === 'strong' || qualification === 'worth_pursuing') {
    return {
      evaluated: true,
      recognizedAsActionable: true,
      evidenceBackedDowngrade: false,
      notes: 'High-priority actionable opportunity recognized.',
      blockingDimensions: [],
    }
  }

  const breakdown = Array.isArray(scoring?.breakdown) ? scoring.breakdown : []
  const hardNegatives = Array.isArray(scoring?.hardNegatives) ? scoring.hardNegatives : []
  const blockingDimensions = []

  for (const dim of breakdown) {
    const points = Number(dim?.points)
    const max = Number(dim?.max)
    if (!Number.isFinite(points) || !Number.isFinite(max) || max <= 0) continue

    if (points / max <= 0.4) {
      const label = typeof dim?.label === 'string' ? dim.label : (dim?.key ?? 'Unknown dimension')
      const note = typeof dim?.note === 'string' ? dim.note : 'No note provided'
      blockingDimensions.push(`${label} ${points}/${max}: ${note}`)
    }
  }

  for (const negative of hardNegatives) {
    blockingDimensions.push(`Hard negative: ${negative}`)
  }

  if (blockingDimensions.length > 0) {
    return {
      evaluated: true,
      recognizedAsActionable: false,
      evidenceBackedDowngrade: true,
      notes: 'Downgraded from high-priority with explicit scored blockers.',
      blockingDimensions,
    }
  }

  return {
    evaluated: true,
    recognizedAsActionable: false,
    evidenceBackedDowngrade: false,
    notes: 'Expected high-priority actionable opportunity, but no specific evidence-backed downgrade reason was returned.',
    blockingDimensions: [],
  }
}

// ── Overall case evaluation ──────────────────────────────────────────────────

export function evaluateCase(caseObj, pipelineResult) {
  const { extraction, scoring, outreach } = pipelineResult

  const invariantFailures = checkInvariants(caseObj, extraction, scoring)
  const remote = evaluateRemoteEligibility(caseObj, extraction)
  const completeness = evaluateExtractionCompleteness(caseObj, extraction)
  const scoreEval = evaluateScoring(caseObj, scoring)
  const actionabilityEval = evaluateActionability(caseObj, scoring)

  // Determine overall case status
  let status = 'PASS'
  const reasons = []

  if (invariantFailures.length > 0) {
    status = 'FAIL'
    reasons.push(...invariantFailures)
  }

  if (remote.severity === 'critical') {
    status = 'FAIL'
    reasons.push(`CRITICAL: Remote eligibility mismatch — expected ${remote.expected}, got ${remote.actual}`)
  } else if (remote.severity === 'high') {
    status = status === 'FAIL' ? 'FAIL' : 'WARN'
    reasons.push(`HIGH: Remote eligibility mismatch — expected ${remote.expected}, got ${remote.actual}`)
  }

  if (completeness.fraction < 0.4 && completeness.max > 0) {
    status = status === 'FAIL' ? 'FAIL' : 'WARN'
    reasons.push(`Low extraction completeness: ${completeness.score}/${completeness.max}`)
  }

  if (scoreEval.alignment === 'misaligned') {
    status = status === 'FAIL' ? 'FAIL' : 'WARN'
    reasons.push(scoreEval.notes)
  }

  if (actionabilityEval.evaluated && !actionabilityEval.recognizedAsActionable) {
    if (actionabilityEval.evidenceBackedDowngrade) {
      status = status === 'FAIL' ? 'FAIL' : 'WARN'
      reasons.push(
        `Actionability assertion: case was downgraded with blockers — ${actionabilityEval.blockingDimensions.join(' | ')}`,
      )
    } else {
      status = 'FAIL'
      reasons.push(
        'Actionability assertion failed: expected high-priority actionable opportunity or explicit evidence-backed downgrade.',
      )
    }
  }

  return {
    caseId: caseObj.id,
    type: caseObj.type,
    knownOutcome: caseObj.known_outcome,
    status,
    reasons,
    remote,
    completeness,
    scoring: scoreEval,
    actionability: actionabilityEval,
    invariantFailures,
  }
}
