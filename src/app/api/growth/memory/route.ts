import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { orgId } = await assertGrowthAccessAPI()
    const store = await createScoutStore()
    const memory = await store.listGrowthMemory(true)
    return NextResponse.json({ memory })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load memory.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await assertGrowthAccessAPI()
    const body = await request.json()

    if (!body.title || !body.content) {
      return NextResponse.json({ error: 'Title and content are required.' }, { status: 400 })
    }

    const store = await createScoutStore()
    const memory = await store.createGrowthMemory({
      memoryType: body.memoryType || 'product_fact',
      title: body.title,
      content: body.content,
      source: body.source || 'manual',
      claimSafety: body.claimSafety,
      territories: body.territories || [],
      audienceSegments: body.audienceSegments || [],
    })

    return NextResponse.json({ memory }, { status: 201 })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create memory.' }, { status: 500 })
  }
}
