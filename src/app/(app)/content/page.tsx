import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { ContentDashboard } from '@/components/content-dashboard'
import { StudioIntro } from '@/components/studio-intro'
import { buildDailyDecision } from '@/lib/content/daily-decision'
import type { ContentPersona, TopicCluster, ContentDraft, ContentHistoryEntry } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

export type DailyStatus = 'asked' | 'drafted' | 'posted' | 'none'

interface PersonaWithExtras extends ContentPersona {
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
  recentPosts: ContentHistoryEntry[]
  dailyStatus: DailyStatus
}

export default async function ContentPage() {
  const user = await getCurrentUser()
  if (!user) return null

  let personas: PersonaWithExtras[] = []

  try {
    const store = await createScoutStore()
    const base = await store.listContentPersonas(user.rep.id)
    const resolved = await Promise.all(
      base.map(async (p) => {
        const topicClusters = await store.listTopicClusters(p.id)
        const drafts = await store.listContentDrafts(p.id)
        const history = await store.listContentHistory(p.id, 30)

        const cutoff = new Date().getTime() - 14 * 86_400_000
        const recentPosts = history.filter((h) => new Date(h.postedAt).getTime() >= cutoff)

        const today = new Date().toDateString()
        const postedToday = history.some((h) => new Date(h.postedAt).toDateString() === today)
        const draftedToday = drafts.some((d) => new Date(d.createdAt).toDateString() === today)

        let dailyStatus: DailyStatus = 'none'
        if (postedToday) {
          dailyStatus = 'posted'
        } else if (draftedToday) {
          dailyStatus = 'drafted'
        } else {
          const findings = await store.listResearchFindings(p.id, { unusedOnly: true, limit: 10 })
          const feedback = await store.listContentDraftFeedback(p.id, 100)
          const generatedToday = await store.countContentDraftsToday(p.id)
          const decision = buildDailyDecision({ persona: p, clusters: topicClusters, findings, feedback, generatedToday })
          dailyStatus = decision.decisionType === 'none' ? 'none' : 'asked'
        }

        return { ...p, topicClusters, drafts, recentPosts, dailyStatus }
      }),
    )
    personas = resolved
  } catch {
    // Migration 0018 not yet applied — render empty state
  }

  return (
    <StudioIntro>
      <ContentDashboard personas={personas} />
    </StudioIntro>
  )
}
