import type { ContentDraftFeedback, ContentPersona, ContentResearchFinding, TopicCluster } from '@/lib/domain/types'

export type DailyDecision = {
  decisionType: 'question' | 'react' | 'ready' | 'none'
  prompt?: string
  reason?: string
  contextId?: string | null
  topicLabel?: string
  fieldUpdate?: {
    id: string
    text: string
    sourceLabel: string
    sourceUrl: string
  }
}

export function buildDailyDecision(input: {
  persona: ContentPersona
  clusters: TopicCluster[]
  findings: ContentResearchFinding[]
  feedback: ContentDraftFeedback[]
  generatedToday: number
}): DailyDecision {
  if (input.generatedToday >= 2) {
    return { decisionType: 'none', reason: 'Daily cap reached for this persona.' }
  }

  const nowMs = Date.now()
  const preferredCluster = pickPreferredCluster(input.clusters, input.feedback)
  const staleCluster = input.clusters
    .filter((c) => c.lastInputAt)
    .sort((a, b) => (a.lastInputAt ?? '').localeCompare(b.lastInputAt ?? ''))[0] ?? null

  const recentFinding = input.findings.find((f) => {
    const ageDays = (nowMs - new Date(f.createdAt).getTime()) / 86_400_000
    return ageDays <= 5
  })

  const finding = preferredCluster
    ? input.findings.find((f) => f.topicClusterId === preferredCluster.id) ?? recentFinding
    : recentFinding

  const fieldUpdateAcceptance = acceptanceBySourceKind(input.feedback, 'field_update')

  if (finding && fieldUpdateAcceptance >= 0) {
    const cluster = input.clusters.find((c) => c.id === finding.topicClusterId) ?? preferredCluster ?? null
    return {
      decisionType: 'react',
      contextId: cluster?.id ?? null,
      topicLabel: cluster?.clusterName ?? 'your field',
      fieldUpdate: {
        id: finding.id,
        text: finding.finding,
        sourceLabel: finding.sourceLabel,
        sourceUrl: finding.sourceUrl,
      },
      prompt: `Here is something happening in your field right now: ${finding.finding}`,
    }
  }

  if (staleCluster) {
    const gapDays = Math.floor((nowMs - new Date(staleCluster.lastInputAt as string).getTime()) / 86_400_000)
    if (gapDays >= 4) {
      return {
        decisionType: 'question',
        contextId: staleCluster.id,
        topicLabel: staleCluster.clusterName,
        prompt: `Quick one: what happened recently around ${staleCluster.clusterName}?`,
      }
    }
  }

  if (input.persona.valuesAndOpinions.length >= 2 && input.clusters.length > 0) {
    return {
      decisionType: 'ready',
      contextId: preferredCluster?.id ?? input.clusters[0].id,
      topicLabel: preferredCluster?.clusterName ?? input.clusters[0].clusterName,
      prompt: 'Want me to draft one from what you have already shared?',
    }
  }

  return { decisionType: 'none', reason: 'Nothing worth surfacing today.' }
}

function pickPreferredCluster(clusters: TopicCluster[], feedback: ContentDraftFeedback[]) {
  if (clusters.length === 0) return null
  const score = new Map<string, number>()
  for (const row of feedback) {
    if (!row.topicClusterId) continue
    const delta = row.reaction === 'not_for_me' ? -1 : 1
    score.set(row.topicClusterId, (score.get(row.topicClusterId) ?? 0) + delta)
  }
  return [...clusters]
    .sort((a, b) => {
      const sa = score.get(a.id) ?? 0
      const sb = score.get(b.id) ?? 0
      if (sa !== sb) return sb - sa
      return (a.lastInputAt ?? '').localeCompare(b.lastInputAt ?? '')
    })[0]
}

function acceptanceBySourceKind(
  feedback: ContentDraftFeedback[],
  kind: 'answer' | 'conviction' | 'field_update',
): number {
  const rows = feedback.filter((f) => f.sourceKind === kind)
  if (rows.length === 0) return 0
  return rows.reduce((acc, row) => acc + (row.reaction === 'not_for_me' ? -1 : 1), 0)
}
