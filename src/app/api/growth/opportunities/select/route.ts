import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Opportunity ID is required.' }, { status: 400 })
    }

    const store = await createScoutStore()
    const today = new Date().toISOString().slice(0, 10)
    await store.selectOpportunity(body.id, today)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to select opportunity.' }, { status: 500 })
  }
}
