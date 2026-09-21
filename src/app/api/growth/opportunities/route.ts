import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await assertGrowthAccessAPI()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || undefined

    const store = await createScoutStore()
    const opportunities = await store.listOpportunities(date)
    return NextResponse.json({ opportunities })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load opportunities.' }, { status: 500 })
  }
}
