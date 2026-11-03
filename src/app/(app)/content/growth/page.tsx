import { requireProductAdmin } from '@/lib/auth/admin-page'
import { createScoutStore } from '@/lib/store'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import { RELAY_TREND_PROFILE } from '@/lib/growth/v2/relay-brand-profile'
import { V3PageHeader } from '@/components/v3/primitives'
import { GrowthV3, type GrowthTrend } from '@/components/content-v3/growth-v3'

export const dynamic = 'force-dynamic'

/**
 * Content → Growth. Admin/owner brand-account workspace. Trends come from the
 * canonical ranked trend pool; the post comes from the canonical growth brief.
 */
export default async function ContentGrowthPage() {
  await requireProductAdmin()

  const store = await createScoutStore()
  const trendItems = await store.listTrendItems({ limit: 50 }).catch(() => [])
  const candidates = rankTrendsForPersona(trendItems, RELAY_TREND_PROFILE)
  const trends: GrowthTrend[] = candidates.slice(0, 8).map((candidate) => ({
    id: candidate.item.id,
    title: candidate.item.title,
    url: candidate.item.url ?? null,
    topics: candidate.item.topics ?? [],
    evidenceQuality: candidate.item.evidenceQuality ?? null,
    whyNow: candidate.whyNow,
    phase: candidate.trendPhase ?? null,
  }))

  return (
    <div className="space-y-6 pb-10">
      <V3PageHeader title="Growth" subtitle="Relay brand content and the trends behind it." />
      <GrowthV3 trends={trends} />
    </div>
  )
}
