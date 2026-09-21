import type { AdminFeedback, RelayEditorialDecision } from '@/lib/domain/types'

export interface LearningSignal {
  feedback: AdminFeedback
  originalCaption: string
  editedCaption: string | null
  territory: string
  contentJob: string
  audienceSegment: string
  timestamp: string
}

export function recordLearningSignal(
  decision: RelayEditorialDecision,
  originalCaption: string,
  editedCaption: string | null,
  territory: string,
  contentJob: string,
  audienceSegment: string,
): LearningSignal {
  return {
    feedback: decision.adminFeedback || 'approved_unchanged',
    originalCaption,
    editedCaption,
    territory,
    contentJob,
    audienceSegment,
    timestamp: new Date().toISOString(),
  }
}

export function classifyEditSeverity(
  original: string,
  edited: string | null,
): 'unchanged' | 'light' | 'heavy' {
  if (!edited || edited === original) return 'unchanged'

  const originalWords = original.split(/\s+/).length
  const editedWords = edited.split(/\s+/).length
  const wordDiff = Math.abs(originalWords - editedWords)
  const changeRatio = wordDiff / Math.max(originalWords, 1)

  if (changeRatio < 0.15) return 'light'
  return 'heavy'
}

export function generateTasteInsights(signals: LearningSignal[]): string[] {
  const insights: string[] = []

  const territoryCounts = new Map<string, number>()
  const jobCounts = new Map<string, number>()
  const feedbackCounts = new Map<string, number>()

  for (const signal of signals) {
    territoryCounts.set(signal.territory, (territoryCounts.get(signal.territory) || 0) + 1)
    jobCounts.set(signal.contentJob, (jobCounts.get(signal.contentJob) || 0) + 1)
    feedbackCounts.set(signal.feedback, (feedbackCounts.get(signal.feedback) || 0) + 1)
  }

  const topTerritory = [...territoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topTerritory) {
    insights.push(`Most active territory: ${topTerritory[0].replace(/_/g, ' ')} (${topTerritory[1]} posts)`)
  }

  const topJob = [...jobCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topJob) {
    insights.push(`Most used content job: ${topJob[0]} (${topJob[1]} posts)`)
  }

  const heavyEditCount = signals.filter((s) => s.feedback === 'heavy_edit').length
  const totalApproved = signals.filter((s) =>
    s.feedback === 'approved_unchanged' || s.feedback === 'light_edit' || s.feedback === 'heavy_edit',
  ).length

  if (totalApproved > 0) {
    const heavyEditRate = Math.round((heavyEditCount / totalApproved) * 100)
    insights.push(`Heavy edit rate: ${heavyEditRate}% (${heavyEditCount}/${totalApproved})`)
  }

  const rejectedCount = signals.filter((s) => s.feedback === 'rejected').length
  if (rejectedCount > 0) {
    insights.push(`Rejection rate: ${Math.round((rejectedCount / signals.length) * 100)}%`)
  }

  return insights
}
