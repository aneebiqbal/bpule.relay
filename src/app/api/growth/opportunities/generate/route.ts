import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'
import { generateDailyOpportunities } from '@/lib/growth/opportunity-engine'
import { prepareTodaysPost } from '@/lib/growth/prepare-today'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { orgId } = await assertGrowthAccessAPI()
    const store = await createScoutStore()
    const today = new Date().toISOString().slice(0, 10)

    const [memory, events, existingToday] = await Promise.all([
      store.listGrowthMemory(true),
      store.listGrowthEvents(false),
      store.listOpportunities(today),
    ])

    const opportunities = await generateDailyOpportunities({
      memory,
      events,
      existing: existingToday,
      orgId,
    })

    const created = []
    for (const opp of opportunities) {
      const result = await store.createOpportunity(opp)
      created.push(result)
    }

    const prepared = await prepareTodaysPost(store)

    if (!prepared.decision && prepared.opportunities.length === 0) {
      return NextResponse.json({
        created: created.length,
        opportunities: created,
        decision: null,
        draft: null,
        message: 'No opportunities could be generated. Add product memory or a build-log entry, then try again.',
      })
    }

    return NextResponse.json({
      created: created.length,
      opportunities: prepared.opportunities,
      decision: prepared.decision,
      draft: prepared.draft,
    })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[growth/opportunities/generate] failed:', error)
    return NextResponse.json({ error: 'Failed to generate opportunities.' }, { status: 500 })
  }
}
