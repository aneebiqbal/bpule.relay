import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Decision ID is required.' }, { status: 400 })
    }

    const store = await createScoutStore()
    await store.updateEditorialDecision(body.id, {
      status: body.status,
      adminFeedback: body.adminFeedback,
      adminEdits: body.adminEdits,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to update decision.' }, { status: 500 })
  }
}
