import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { currentInstant } from '@/lib/org-clock'
import { loadRepDay } from '@/lib/rep-day/load'
import { closeRepDay, type CloseMode } from '@/lib/rep-day/persist'

export const dynamic = 'force-dynamic'

/**
 * Close the day.
 *
 *   { mode: 'complete' }    → only when nothing is required, or an exception is approved
 *   { mode: 'incomplete' }  → always allowed; the shortfall is recorded, never erased
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const mode: CloseMode = body.mode === 'incomplete' ? 'incomplete' : 'complete'

  const view = await loadRepDay()
  const result = await closeRepDay({
    view,
    mode,
    now: currentInstant(),
    exceptionReason: typeof body.exceptionReason === 'string' ? body.exceptionReason : null,
    exceptionNote: typeof body.exceptionNote === 'string' ? body.exceptionNote : null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  const day = await loadRepDay()
  return NextResponse.json({ ok: true, closedAt: result.closedAt, shortfall: result.shortfall, day })
}
