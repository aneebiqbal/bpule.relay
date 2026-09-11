import type {
  ScoreBreakdownItem,
  UpworkJobVerdict,
} from '@/lib/domain/types'

export interface UpworkScoreResult {
  total: number
  verdict: UpworkJobVerdict
  breakdown: ScoreBreakdownItem[]
}

/**
 * Upwork job qualification rubric (published, version 1).
 *
 * Pure arithmetic. No model is ever consulted here. The score is the sum of
 * four groups, out of 10 total:
 *
 *   Budget adequacy (max 3 points)
 *     3: fixed budget >= $3k or hourly >= $50/hr
 *     2: fixed budget $1k-$3k or hourly $30-$50/hr
 *     1: fixed budget $500-$1k or hourly $15-$30/hr
 *     0: below that or no budget stated
 *
 *   Proposal competition (max 2 points)
 *     2: 0-5 proposals (early, low competition)
 *     1: 6-15 proposals (moderate)
 *     0: 16+ proposals (high competition)
 *
 *   Skill match (max 2 points)
 *     2: >= 3 required skills overlap team stack
 *     1: 1-2 overlaps
 *     0: no overlap
 *
 *   Urgency / takeover signal (max 3 points)
 *     3: explicit takeover signal ("previous dev left", "inherited codebase")
 *     2: urgency language without explicit takeover
 *     1: some timeline pressure
 *     0: no urgency at all
 *
 * Verdicts
 *    6-10  apply
 *    3-5   apply_if_connects
 *    0-2   skip
 */

const TEAM_STACK = new Set([
  'react',
  'nextjs',
  'typescript',
  'node',
  'nodejs',
  'python',
  'django',
  'rails',
  'ruby on rails',
  'postgresql',
  'postgres',
  'aws',
  'docker',
  'kubernetes',
  'mobile',
  'ios',
  'android',
  'flutter',
  'react native',
])

export function computeUpworkScore(input: {
  budgetMin: number | null
  budgetMax: number | null
  hourlyRateMin: number | null
  hourlyRateMax: number | null
  proposalCount: number | null
  requiredSkills: string[]
  urgencySignal: string | null
  description: string
}): UpworkScoreResult {
  const budgetScore = scoreBudget(
    input.budgetMin,
    input.budgetMax,
    input.hourlyRateMin,
    input.hourlyRateMax,
  )
  const competitionScore = scoreCompetition(input.proposalCount)
  const skillScore = scoreSkills(input.requiredSkills)
  const urgencyScore = scoreUrgency(input.urgencySignal, input.description)

  const items: ScoreBreakdownItem[] = [
    {
      category: 'budget',
      label: 'Budget adequacy',
      points: budgetScore,
      max: 3,
      note: budgetNote(budgetScore),
    },
    {
      category: 'competition',
      label: 'Proposal competition',
      points: competitionScore,
      max: 2,
      note: competitionNote(competitionScore),
    },
    {
      category: 'skills',
      label: 'Skill match',
      points: skillScore,
      max: 2,
      note: skillNote(skillScore),
    },
    {
      category: 'urgency',
      label: 'Urgency / takeover signal',
      points: urgencyScore,
      max: 3,
      note: urgencyNote(urgencyScore),
    },
  ]

  const total = items.reduce((s, i) => s + i.points, 0)
  const verdict = verdictFor(total)

  return { total, verdict, breakdown: items }
}

function scoreBudget(
  budgetMin: number | null,
  budgetMax: number | null,
  hourlyMin: number | null,
  hourlyMax: number | null,
): number {
  const fixed = budgetMax ?? budgetMin ?? 0
  if (fixed > 0) {
    if (fixed >= 3000) return 3
    if (fixed >= 1000) return 2
    if (fixed >= 500) return 1
    return 0
  }
  const hourly = hourlyMax ?? hourlyMin ?? 0
  if (hourly > 0) {
    if (hourly >= 50) return 3
    if (hourly >= 30) return 2
    if (hourly >= 15) return 1
    return 0
  }
  return 0
}

function budgetNote(score: number): string {
  if (score === 3) return 'Budget is strong.'
  if (score === 2) return 'Budget is acceptable.'
  if (score === 1) return 'Budget is tight.'
  return 'No budget stated or too low.'
}

function scoreCompetition(proposalCount: number | null): number {
  if (proposalCount === null) return 1 // unknown = moderate
  if (proposalCount <= 5) return 2
  if (proposalCount <= 15) return 1
  return 0
}

function competitionNote(score: number): string {
  if (score === 2) return 'Low competition (0-5 proposals).'
  if (score === 1) return 'Moderate competition (6-15).'
  return 'High competition (16+ proposals).'
}

function scoreSkills(requiredSkills: string[]): number {
  const normalized = requiredSkills.map((s) => s.toLowerCase().trim())
  const overlap = normalized.filter((s) => TEAM_STACK.has(s)).length
  if (overlap >= 3) return 2
  if (overlap >= 1) return 1
  return 0
}

function skillNote(score: number): string {
  if (score === 2) return 'Strong skill overlap with team stack.'
  if (score === 1) return 'Some skill overlap.'
  return 'No overlap with team stack.'
}

function scoreUrgency(
  urgencySignal: string | null,
  description: string,
): number {
  if (urgencySignal && urgencySignal.trim().length > 0) {
    const u = urgencySignal.toLowerCase()
    if (
      u.includes('previous developer left') ||
      u.includes('inherited codebase') ||
      u.includes('developer left') ||
      u.includes('take over') ||
      u.includes('rescue')
    ) {
      return 3
    }
    return 2
  }
  const d = description.toLowerCase()
  if (
    d.includes('asap') ||
    d.includes('urgent') ||
    d.includes('immediately') ||
    d.includes('deadline') ||
    d.includes('previous developer')
  ) {
    return 2
  }
  if (
    d.includes('soon') ||
    d.includes('this week') ||
    d.includes('next week') ||
    d.includes('timeline')
  ) {
    return 1
  }
  return 0
}

function urgencyNote(score: number): string {
  if (score === 3) return 'Explicit takeover signal.'
  if (score === 2) return 'Urgency language present.'
  if (score === 1) return 'Some timeline pressure.'
  return 'No urgency signal.'
}

function verdictFor(total: number): UpworkJobVerdict {
  if (total >= 6) return 'apply'
  if (total >= 3) return 'apply_if_connects'
  return 'skip'
}
