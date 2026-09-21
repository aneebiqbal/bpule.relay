import type { RelayEditorialDecision, RelayContentPublication } from '@/lib/domain/types'

export interface WeeklyReview {
  weekStart: string
  weekEnd: string
  published: number
  approved: number
  rejected: number
  notToday: number
  heavyEditRate: number
  lightEditRate: number
  unchangedRate: number
  topTerritories: string[]
  topContentJobs: string[]
  repetitionRisk: string[]
  insights: string[]
  nextWeekHypothesis: string
}

export function generateWeeklyReview(
  decisions: RelayEditorialDecision[],
  publications: RelayContentPublication[],
  weekStart: string,
  weekEnd: string,
): WeeklyReview {
  const weekDecisions = decisions.filter(
    (d) => d.decisionDate >= weekStart && d.decisionDate <= weekEnd,
  )

  const published = weekDecisions.filter((d) => d.status === 'approved' || d.status === 'edited').length
  const rejected = weekDecisions.filter((d) => d.status === 'rejected').length
  const notToday = weekDecisions.filter((d) => d.status === 'not_today').length

  const approvedDecisions = weekDecisions.filter(
    (d) => d.status === 'approved' || d.status === 'edited',
  )

  const heavyEdits = approvedDecisions.filter((d) => d.adminFeedback === 'heavy_edit').length
  const lightEdits = approvedDecisions.filter((d) => d.adminFeedback === 'light_edit').length
  const unchanged = approvedDecisions.filter((d) => d.adminFeedback === 'approved_unchanged').length

  const heavyEditRate = approvedDecisions.length > 0 ? Math.round((heavyEdits / approvedDecisions.length) * 100) : 0
  const lightEditRate = approvedDecisions.length > 0 ? Math.round((lightEdits / approvedDecisions.length) * 100) : 0
  const unchangedRate = approvedDecisions.length > 0 ? Math.round((unchanged / approvedDecisions.length) * 100) : 0

  const territoryCounts = new Map<string, number>()
  const jobCounts = new Map<string, number>()

  for (const d of weekDecisions) {
    if (d.opportunityId) {
      // Territory would come from the opportunity, but we don't have it here
      // Using a placeholder based on decision content
    }
  }

  const topTerritories = [...territoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t.replace(/_/g, ' '))

  const topContentJobs = [...jobCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([j]) => j)

  const repetitionRisk: string[] = []
  const insights: string[] = []

  if (heavyEditRate > 50) {
    insights.push('High heavy-edit rate suggests drafts need more work before review.')
  }
  if (unchangedRate > 70) {
    insights.push('High unchanged approval rate — drafts are well-calibrated.')
  }
  if (rejected > published) {
    insights.push('More rejections than approvals — review opportunity selection criteria.')
  }
  if (notToday > published) {
    insights.push('Many "not today" decisions — consider generating more opportunities.')
  }

  if (insights.length === 0) {
    insights.push('No significant patterns detected this week.')
  }

  const nextWeekHypothesis = buildNextWeekHypothesis(insights, topTerritories, topContentJobs)

  return {
    weekStart,
    weekEnd,
    published,
    approved: published,
    rejected,
    notToday,
    heavyEditRate,
    lightEditRate,
    unchangedRate,
    topTerritories,
    topContentJobs,
    repetitionRisk,
    insights,
    nextWeekHypothesis,
  }
}

function buildNextWeekHypothesis(
  insights: string[],
  _topTerritories: string[],
  _topContentJobs: string[],
): string {
  if (insights.some((i) => i.includes('heavy-edit'))) {
    return 'Test whether more specific evidence in drafts reduces heavy-edit rate.'
  }
  if (insights.some((i) => i.includes('rejection'))) {
    return 'Test whether stricter opportunity filtering improves approval rate.'
  }
  if (insights.some((i) => i.includes('not today'))) {
    return 'Test whether generating more opportunities reduces "not today" decisions.'
  }
  return 'Continue current editorial strategy. No significant changes needed.'
}
