import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'
import { generateDailyOpportunities } from '@/lib/growth/opportunity-engine'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { orgId } = await assertGrowthAccessAPI()
    const store = await createScoutStore()

    const memory = await store.listGrowthMemory(true)
    const events = await store.listGrowthEvents(false)
    const existing = await store.listOpportunities()

    const opportunities = await generateDailyOpportunities({
      memory,
      events,
      existing,
      orgId,
    })

    const created = []
    for (const opp of opportunities) {
      const result = await store.createOpportunity(opp)
      created.push(result)
    }

    return NextResponse.json({ created: created.length, opportunities: created })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[growth/opportunities/generate] failed:', error)
    return NextResponse.json({ error: 'Failed to generate opportunities.' }, { status: 500 })
  }
}
