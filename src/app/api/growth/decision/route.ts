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
    return NextResponse.json({ decision })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load decision.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.opportunityId) {
      return NextResponse.json({ error: 'Opportunity ID is required.' }, { status: 400 })
    }

    const store = await createScoutStore()
    const today = new Date().toISOString().slice(0, 10)

    const decision = await store.createEditorialDecision({
      decisionDate: today,
      opportunityId: body.opportunityId,
      primaryReason: body.primaryReason || 'Strong editorial opportunity',
      audienceReason: body.audienceReason || 'Relevant to target audience',
      timelinessReason: body.timelinessReason || 'Timely given recent product work',
      evidenceReason: body.evidenceReason || 'Grounded in actual product evidence',
      takeaway: body.takeaway || '',
    })

    return NextResponse.json({ decision }, { status: 201 })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create decision.' }, { status: 500 })
  }
}
