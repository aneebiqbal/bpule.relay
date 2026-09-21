import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'
import { prepareTodaysPost } from '@/lib/growth/prepare-today'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Opportunity ID is required.' }, { status: 400 })
    }

    const store = await createScoutStore()
    const prepared = await prepareTodaysPost(store, { opportunityId: body.id })

    return NextResponse.json({
      ok: true,
      decision: prepared.decision,
      draft: prepared.draft,
    })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[growth/opportunities/select] failed:', error)
    return NextResponse.json({ error: 'Failed to select opportunity.' }, { status: 500 })
  }
}
