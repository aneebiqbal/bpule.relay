import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await assertGrowthAccessAPI()
    const store = await createScoutStore()
    const publications = await store.listPublications()
    return NextResponse.json({ publications })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load publications.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.caption || !body.territory || !body.audienceSegment || !body.contentJob) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const store = await createScoutStore()
    const publication = await store.createPublication({
      draftId: body.draftId,
      platform: body.platform || 'linkedin',
      caption: body.caption,
      territory: body.territory,
      audienceSegment: body.audienceSegment,
      contentJob: body.contentJob,
      campaign: body.campaign,
    })

    return NextResponse.json({ publication }, { status: 201 })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create publication.' }, { status: 500 })
  }
}
