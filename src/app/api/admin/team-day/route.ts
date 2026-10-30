import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadTeamDay } from '@/lib/rep-day/team'

export const dynamic = 'force-dynamic'

/**
 * The canonical team-day contract for the Command Centre.
 * A rep is refused here, not only in the navigation.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin && !ctx.isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const team = await loadTeamDay()
  return NextResponse.json({ team })
}
