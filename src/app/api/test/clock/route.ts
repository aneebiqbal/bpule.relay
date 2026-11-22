import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { clearTestNow, currentInstant, setTestNow, testClockEnabled } from '@/lib/org-clock'

export const dynamic = 'force-dynamic'

/**
 * Test-only clock control.
 *
 * Inert unless `RELAY_TEST_CLOCK=1` *and* the build is not production — the same
 * guard `setTestNow` enforces. It exists so an end-to-end suite can walk a full
 * synthetic day across local midnight without waiting for it.
 */
export async function POST(request: Request) {
  if (!testClockEnabled()) {
    return NextResponse.json({ error: 'Test clock is disabled.' }, { status: 403 })
  }
  const auth = await getAuthContext().catch(() => null)
  if (!auth?.isAdmin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { iso?: string | null }
  try {
    setTestNow(body.iso ?? null)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid instant.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, now: currentInstant().toISOString() })
}

export async function DELETE() {
  if (!testClockEnabled()) {
    return NextResponse.json({ error: 'Test clock is disabled.' }, { status: 403 })
  }
  clearTestNow()
  return NextResponse.json({ ok: true, now: currentInstant().toISOString() })
}
