import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'
import { generateWeeklyReview } from '@/lib/growth/weekly-review'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await assertGrowthAccessAPI()
    const store = await createScoutStore()

    const today = new Date()
    const weekEnd = today.toISOString().slice(0, 10)
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [publications] = await Promise.all([
      store.listPublications(),
    ])

    const decisions: any[] = []

    const review = generateWeeklyReview(decisions, publications, weekStart, weekEnd)

    return NextResponse.json({ review })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to generate weekly review.' }, { status: 500 })
  }
}
