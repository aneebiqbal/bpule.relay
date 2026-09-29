import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import type { TrendRelevanceProfile } from '@/lib/trends/types'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import { generateDailyGrowthBrief } from '@/lib/growth/v2/daily-growth-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const RELAY_TREND_PROFILE: TrendRelevanceProfile = {
  primaryTerritories: ['sales technology', 'revenue operations', 'ai', 'b2b saas', 'outreach'],
  secondaryTerritories: ['startups', 'product', 'data', 'automation', 'founder'],
  technologies: ['ai', 'crm', 'automation', 'analytics', 'llm'],
  industries: ['saas', 'b2b', 'sales'],
  excludedTerritories: [],
}

function getLocalDate(timezone: string): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const store = await createScoutStore()
  const localDate = getLocalDate(user.rep.timezone ?? 'UTC')

  const existing = await store.getDailyGrowthBrief(localDate)
  if (existing && existing.status === 'ready') {
    return NextResponse.json({ brief: existing, fromCache: true })
  }

  return generateAndRespond(store, user.organization.id, localDate, user.rep.timezone ?? 'UTC')
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user || user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const store = await createScoutStore()
  const localDate = getLocalDate(user.rep.timezone ?? 'UTC')
  return generateAndRespond(store, user.organization.id, localDate, user.rep.timezone ?? 'UTC')
}

async function generateAndRespond(
  store: Awaited<ReturnType<typeof createScoutStore>>,
  orgId: string,
  localDate: string,
  timezone: string,
) {
  try {
    const trendItems = await store.listTrendItems({ limit: 50 })
    const trendCandidates = rankTrendsForPersona(trendItems, RELAY_TREND_PROFILE)

    const recentTopics: string[] = []
    const recentHooks: string[] = []
    const recentAngles: string[] = []

    const brief = await generateDailyGrowthBrief(store, orgId, {
      trendCandidates,
      recentTopics,
      recentHooks,
      recentAngles,
      localDate,
    })

    return NextResponse.json({ brief })
  } catch (err) {
    return NextResponse.json(
      { error: 'Generation failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
