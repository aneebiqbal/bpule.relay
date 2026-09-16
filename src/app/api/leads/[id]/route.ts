import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Lightweight lead re-fetch for targeted UI synchronization.
 * Returns just the lead + messages + outcomes (no scoring, profiles, or proof matching).
 * Used by LeadWorkspace after mutations to update timeline/status without full reload.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const store = await createScoutStore()
    const lead = await store.getLead(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    return NextResponse.json({ lead })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch lead.' }, { status: 500 })
  }
}
