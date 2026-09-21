import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await assertGrowthAccessAPI()
    const store = await createScoutStore()
    const today = new Date().toISOString().slice(0, 10)
    const decision = await store.getEditorialDecision(today)

    if (!decision) {
      return NextResponse.json({ draft: null })
    }

    const draft = await store.getGrowthDraftByDecision(decision.id)
    return NextResponse.json({ draft, decision })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load draft.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.decisionId) {
      return NextResponse.json({ error: 'Decision ID is required.' }, { status: 400 })
    }

    const store = await createScoutStore()
    const draft = await store.createGrowthDraft({
      decisionId: body.decisionId,
      opportunityId: body.opportunityId,
      postPlan: body.postPlan || {},
      platform: body.platform || 'linkedin',
    })

    return NextResponse.json({ draft }, { status: 201 })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create draft.' }, { status: 500 })
  }
}
