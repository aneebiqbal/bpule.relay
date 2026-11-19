/**
 * Job Intelligence v2 — deterministic profile matching.
 *
 * Reuses the existing transparent ranker (`scoreJob`) so a score still
 * decomposes into visible factors. Hard eligibility is applied first: a
 * semantically similar job cannot become a high-confidence recommendation
 * when the seeker is confidently ineligible.
 */

import type { Job, JobMatch, JobSearchParams, JobSource, CvProfile, SalaryInfo } from '@/lib/jobs/types'
import { scoreJob } from '@/lib/jobs/rank-jobs'
import { estimateSeniority } from '@/lib/jobs/search-query'
import type { ProfileEvidence } from '@/lib/generation/sales-context'
import { countryFromLocation, evaluateEligibility, type JobEligibility, type SeekerPreferences } from './eligibility'
import type { DiscoveryJob } from './types'

export const MATCH_SCORE_VERSION = 2

export interface MatchProfile {
  profileId: string
  headline?: string | null
  location?: string | null
  timezone?: string | null
  preferredEngagementTypes?: string[]
  evidence: ProfileEvidence
}

export interface ComputedMatch {
  score: number
  category: 'excellent' | 'strong' | 'possible' | 'stretch' | 'not_eligible' | 'requires_verification'
  breakdown: JobMatch['breakdown']
  evidence: {
    matchedSkills: string[]
    missingSkills: string[]
    eligibility: JobEligibility | null
    eligibilityReasons: string[]
    proofUsed: Array<{ id: string; title: string; claim: string }>
  }
  explanation: string
}

function toJob(job: DiscoveryJob): Job {
  return {
    id: job.sourceJobId,
    source: job.sourceId as JobSource,
    sourceJobId: job.sourceJobId,
    title: job.title,
    company: job.company ?? '',
    companyLogo: job.companyLogo,
    location: job.locationRaw ?? '',
    country: job.locationRaw ?? undefined,
    locations: job.locationRaw ? [job.locationRaw] : [],
    remote: job.remote,
    hybrid: job.hybrid ?? false,
    onsite: job.onsite ?? false,
    employmentType: job.employmentType,
    seniority: job.seniority,
    salary: job.salaryMin || job.salaryMax
      ? {
          min: job.salaryMin,
          max: job.salaryMax,
          currency: job.salaryCurrency,
          period: job.salaryPeriod as SalaryInfo['period'],
          raw: job.salaryRaw,
          normalizable: Boolean(job.salaryMin && job.salaryCurrency),
        }
      : null,
    description: job.description,
    excerpt: job.excerpt,
    skills: job.skills,
    categories: job.categories,
    postedAt: job.postedAt,
    expiresAt: job.expiresAt,
    applyUrl: job.applyUrl ?? job.sourceUrl ?? '',
    sourceUrl: job.sourceUrl,
    attribution: job.attribution,
  }
}

function buildCv(profile: MatchProfile): CvProfile {
  const evidence = profile.evidence
  const skills = [
    ...evidence.proofCards.flatMap((card) => card.tags),
    ...evidence.proofCards.map((card) => card.capability),
    ...evidence.portfolioProjects.flatMap((project) => project.technologies ?? []),
    ...evidence.experience.map((experience) => experience.role).filter((role): role is string => Boolean(role)),
  ]
  const primaryRole = profile.headline?.trim() || evidence.proofCards[0]?.capability || 'Professional'
  return {
    primaryRole,
    alternativeRoles: evidence.experience.map((experience) => experience.role).filter((role): role is string => Boolean(role)).slice(0, 4),
    skills: [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))].slice(0, 30),
    seniority: estimateSeniority(profile.headline ?? undefined),
    location: profile.location ?? undefined,
    country: countryFromLocation(profile.location) ?? undefined,
  }
}

function parseEligibility(value: unknown): JobEligibility | null {
  if (!value || typeof value !== 'object') return null
  return value as JobEligibility
}

export function computeJobMatch(job: DiscoveryJob, profile: MatchProfile, verificationStatus?: string): ComputedMatch {
  const cv = buildCv(profile)
  const params: JobSearchParams = { query: '', remote: true }
  const base = scoreJob(toJob(job), cv, params)
  const eligibility = parseEligibility((job as DiscoveryJob & { eligibility?: unknown }).eligibility)
  const prefs: SeekerPreferences = {
    country: cv.country,
    location: profile.location ?? undefined,
    timezone: profile.timezone ?? undefined,
    employmentPreference: profile.preferredEngagementTypes?.join(', '),
  }
  const verdict = eligibility ? evaluateEligibility(eligibility, prefs) : { eligible: true, confidence: 'unknown' as const, reasons: ['Eligibility was not classified.'] }

  const proofUsed = profile.evidence.proofCards
    .filter((card) => card.verified || card.strength === 'strong')
    .slice(0, 4)
    .map((card) => ({ id: card.id, title: card.capability, claim: card.safeClaim }))

  let score = base.score
  let category: ComputedMatch['category']
  const reasons: string[] = []

  if (!verdict.eligible && verdict.confidence === 'confirmed') {
    score = Math.min(score, 15)
    category = 'not_eligible'
    reasons.push(...verdict.reasons)
  } else if (!verdict.eligible && verdict.confidence === 'unknown') {
    score = Math.min(score, 45)
    category = 'requires_verification'
    reasons.push(...verdict.reasons)
  } else if (verificationStatus === 'verification_needed' || verificationStatus === 'source_unavailable') {
    score = Math.min(score, 55)
    category = 'requires_verification'
    reasons.push('The listing has not been verified at its original source yet.')
  } else if (score >= 80) {
    category = 'excellent'
  } else if (score >= 65) {
    category = 'strong'
  } else if (score >= 50) {
    category = 'possible'
  } else {
    category = 'stretch'
  }

  if (category !== 'not_eligible' && verdict.reasons.length > 0 && verdict.eligible) {
    reasons.push(...verdict.reasons)
  }

  const explanation = [
    base.summary,
    eligibility?.explanation ?? 'Eligibility was not classified.',
    ...reasons,
  ].filter(Boolean).join(' ')

  return {
    score: Math.round(score),
    category,
    breakdown: base.breakdown,
    evidence: {
      matchedSkills: base.matchedSkills,
      missingSkills: base.missingSkills,
      eligibility,
      eligibilityReasons: verdict.reasons,
      proofUsed,
    },
    explanation,
  }
}

