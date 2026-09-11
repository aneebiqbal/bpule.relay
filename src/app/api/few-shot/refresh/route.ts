import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export async function POST() {
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  try {
    const count = await store.refreshFewShotWins()
    return NextResponse.json({ refreshed: count })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed.' },
      { status: 500 },
    )
  }
}
