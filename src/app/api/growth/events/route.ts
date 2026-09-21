import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await assertGrowthAccessAPI()
    const store = await createScoutStore()
    const events = await store.listGrowthEvents(false)
    return NextResponse.json({ events })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load events.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.title || !body.rawContent) {
      return NextResponse.json({ error: 'Title and rawContent are required.' }, { status: 400 })
    }

    const store = await createScoutStore()
    const event = await store.createGrowthEvent({
      eventType: body.eventType || 'build_log_entry',
      title: body.title,
      rawContent: body.rawContent,
      sourceKind: body.sourceKind || 'build_log',
    })

    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create event.' }, { status: 500 })
  }
}
