import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { safeErrorResponse } from '@/lib/errors'

/**
 * Explicit rep confirmation that a LinkedIn connection request was
 * accepted. This is the one legitimate way Relay learns a connection was
 * accepted — never inferred from a reply or elapsed time. Gates DM
 * eligibility in the lead workspace when a connection note was sent first.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  try {
    await store.markConnectionAccepted(id)
    const detail = await store.getLead(id)
    return NextResponse.json({ ok: true, lead: detail })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not mark the connection as accepted.', 'leads/connection-accepted')
  }
}
