import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { ContentDashboard } from '@/components/content-dashboard'
import { StudioIntro } from '@/components/studio-intro'
import { buildDailyDecision } from '@/lib/content/daily-decision'
import type { ContentPersona, ContentProfile, TopicCluster, ContentDraft, ContentHistoryEntry } from '@/lib/domain/types'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export type DailyStatus = 'asked' | 'drafted' | 'posted' | 'none'

interface PersonaWithExtras extends ContentPersona {
  topicClusters: TopicCluster[]
  drafts: ContentDraft[]
  recentPosts: ContentHistoryEntry[]
  dailyStatus: DailyStatus
  contentProfile: ContentProfile | null
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ manage?: string }>
}) {
  const params = await searchParams
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
        const contentProfile = p.contentProfileId ? await store.getContentProfile(p.contentProfileId) : null

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

        return { ...p, topicClusters, drafts, recentPosts, dailyStatus, contentProfile }
      }),
    )
    personas = resolved
  } catch (err) {
    console.error('[content] Failed to load personas:', err)
  }

  if (personas.length > 0 && params.manage !== '1') {
    const ordered = [...personas].sort((a, b) => {
      const score = (persona: PersonaWithExtras) => {
        if (persona.dailyStatus === 'asked') return 3
        if (persona.dailyStatus === 'drafted') return 2
        if (persona.dailyStatus === 'none') return 1
        return 0
      }
      return score(b) - score(a)
    })
    redirect(`/content/${ordered[0].id}/today`)
  }

  return (
    <StudioIntro>
      <ContentDashboard personas={personas} />
    </StudioIntro>
  )
}
