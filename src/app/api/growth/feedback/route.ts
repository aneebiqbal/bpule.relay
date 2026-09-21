import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.decisionId) {
      return NextResponse.json({ error: 'Decision ID is required.' }, { status: 400 })
    }

    const store = await createScoutStore()

    await store.updateEditorialDecision(body.decisionId, {
      status: body.status,
      adminFeedback: body.adminFeedback,
      adminEdits: body.adminEdits,
    })

    if (body.status === 'approved' || body.status === 'edited') {
      const draft = await store.getGrowthDraftByDecision(body.decisionId)
      if (draft) {
        await store.updateGrowthDraft(draft.id, {
          status: 'approved',
          caption: body.finalCaption || draft.caption,
        })

        await store.createPublication({
          draftId: draft.id,
          platform: draft.platform || 'linkedin',
          caption: body.finalCaption || draft.caption,
          territory: body.territory || 'building_relay',
          audienceSegment: body.audienceSegment || 'technical_founder',
          contentJob: body.contentJob || 'teach',
        })
      }
    }

    if (body.status === 'rejected') {
      const draft = await store.getGrowthDraftByDecision(body.decisionId)
      if (draft) {
        await store.updateGrowthDraft(draft.id, { status: 'rejected' })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to record feedback.' }, { status: 500 })
  }
}
