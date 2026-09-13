import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me/rulebook — returns the current rep's organization scoring rulebook,
 * for use in client components (live preview on new-lead page, etc.).
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const rulebook = await store.getRulebook()
  if (!rulebook) return NextResponse.json({ error: 'Rulebook not found' }, { status: 404 })

  return NextResponse.json({ rulebook })
}
