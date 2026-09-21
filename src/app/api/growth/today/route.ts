import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'
import { prepareTodaysPost } from '@/lib/growth/prepare-today'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await assertGrowthAccessAPI()
    const store = await createScoutStore()
    const prepared = await prepareTodaysPost(store)

    if (!prepared.decision) {
      return NextResponse.json({
        decision: null,
        draft: null,
        opportunities: prepared.opportunities,
        alreadySelected: false,
        message: prepared.opportunities.length === 0
          ? 'No opportunities generated yet. Run POST /api/growth/opportunities/generate first.'
          : 'No suitable opportunity found today.',
      })
    }

    return NextResponse.json({
      decision: prepared.decision,
      draft: prepared.draft,
      opportunities: prepared.opportunities,
      alreadySelected: true,
    })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[growth/today] failed:', error)
    return NextResponse.json({ error: 'Failed to load today\'s post.' }, { status: 500 })
  }
}
