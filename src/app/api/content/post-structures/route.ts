import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/content/post-structures — the curated structure library, used as
 * generation scaffolding only. Never implies any structure performs better.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const structures = await store.listPostStructures()
  return NextResponse.json({ structures })
}
