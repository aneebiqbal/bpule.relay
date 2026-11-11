import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Dismiss a candidate. Discovery history is preserved (§43). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { id } = await params
  const store = await createScoutStore()
  await store.updateCapturedProspectStatus(id, 'discarded')
  return NextResponse.json({ ok: true })
}
