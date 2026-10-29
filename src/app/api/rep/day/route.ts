import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { currentInstant } from '@/lib/org-clock'
import { loadRepDay } from '@/lib/rep-day/load'
import { checkInRepDay } from '@/lib/rep-day/persist'

export const dynamic = 'force-dynamic'

/** The canonical rep-day view — the same data Today renders. */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const day = await loadRepDay()
  return NextResponse.json({ day })
}

/** "Start my day" — explicit, idempotent check-in. */
export async function POST() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const before = await loadRepDay()
  const result = await checkInRepDay({
    organizationId: ctx.orgId,
    repId: ctx.repId,
    businessDate: before.businessDate,
    now: currentInstant(),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  const day = await loadRepDay()
  return NextResponse.json({ ok: true, checkInAt: result.checkInAt, day })
}
