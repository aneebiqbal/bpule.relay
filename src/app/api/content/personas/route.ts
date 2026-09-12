import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/content/personas — list current rep's personas
 * POST /api/content/personas — create a new persona
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const personas = await store.listContentPersonas(user.rep.id)
  return NextResponse.json({ personas })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { displayName, platforms } = body as { displayName: string; platforms: string[] }
  if (!displayName?.trim()) return NextResponse.json({ error: 'displayName is required' }, { status: 400 })
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return NextResponse.json({ error: 'platforms must be a non-empty array' }, { status: 400 })
  }

  const validPlatforms = ['linkedin', 'x']
  const filtered = platforms.filter((p) => validPlatforms.includes(p))
  if (filtered.length === 0) return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.createContentPersona({
    repId: user.rep.id,
    displayName: displayName.trim(),
    platforms: filtered as ('linkedin' | 'x')[],
  })

  return NextResponse.json({ persona })
}
