import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadRepDayDetail } from '@/lib/rep-day/team'

export const dynamic = 'force-dynamic'

/** One rep's operational day. Scope is enforced by the loader. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ repId: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin && !ctx.isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { repId } = await params
  try {
    const detail = await loadRepDayDetail(repId)
    return NextResponse.json({ detail })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message === 'Forbidden' ? 403 : message === 'Not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
