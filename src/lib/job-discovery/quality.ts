/**
 * Conservative, deterministic job quality screen.
 *
 * Rules are evidence-based and never flag a role for being remote, well-paid or
 * salary-silent. A single hard signal (payment + sensitive data) can quarantine;
 * ambiguous signals combine into `needs_review`. Nothing here deletes a job.
 */

export type QualityClassification = 'eligible' | 'needs_review' | 'suspected_duplicate' | 'suspected_scam'

export interface QualityInput {
  title: string
  company: string | null
  description: string
  applyUrl: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  sourceId?: string | null
}

export interface QualityResult {
  classification: QualityClassification
  reasons: string[]
  /** True when the listing should leave the active feed. */
  quarantined: boolean
}

// Request-shaped phrases only: "payments platform" must never read as a scam.
const UPFRONT_PAYMENT =
  /\b(upfront|up-front|application fee|training fee|starter kit|processing fee|wire transfer|send money|send a gift card|pay (?:a|an) (?:fee|deposit|starter)|registration fee)\b/i
const SENSITIVE_DATA =
  /\b(ssn|social security|national id|passport (copy|photo)|bank account (number|details)|credit card (number|details)|date of birth|home address)\b/i
const CONTRADICTORY = /\b(no experience needed|must have [0-9]+\+? years)\b/i

function hasPrivateOrInvalidApplyHost(url: string | null): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host.startsWith('localhost') ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host)
    )
  } catch {
    return true
  }
}

export function screenJobQuality(job: QualityInput): QualityResult {
  const reasons: string[] = []
  const text = `${job.title} ${job.description}`.toLowerCase()

  const paymentRequested = UPFRONT_PAYMENT.test(text)
  const sensitiveRequested = SENSITIVE_DATA.test(text)
  if (paymentRequested) reasons.push('upfront_payment_requested')
  if (sensitiveRequested) reasons.push('sensitive_data_requested')

  let hardHits = 0
  if (paymentRequested && sensitiveRequested) hardHits += 1

  // Contradictory compensation is a credibility problem; high pay alone is not.
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin > job.salaryMax) {
    reasons.push('contradictory_compensation')
    hardHits += 1
  }

  if (hasPrivateOrInvalidApplyHost(job.applyUrl)) {
    reasons.push('invalid_application_url')
    hardHits += 1
  }

  const employerMissing = !job.company || job.company.trim().length === 0
  const vague = job.description.trim().length < 80
  if (employerMissing && vague) {
    reasons.push('missing_employer_and_details')
  }
  if (CONTRADICTORY.test(text) && vague) {
    reasons.push('contradictory_requirements')
  }

  let classification: QualityClassification = 'eligible'
  if (hardHits >= 1 || reasons.length >= 2) {
    classification = 'suspected_scam'
  } else if (reasons.length === 1) {
    classification = 'needs_review'
  }

  return {
    classification,
    reasons,
    quarantined: classification === 'suspected_scam',
  }
}
