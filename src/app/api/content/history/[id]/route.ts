import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

const METRIC_KEYS = ['likes', 'reach', 'comments', 'reposts', 'saves', 'profileVisits', 'followerDelta'] as const

function parseMetric(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
}

/**
 * PATCH /api/content/history/[id] — tag a past post with a real outcome
 * (a DM, an inquiry, a follow-up conversation), and/or log real, manually
 * entered performance numbers (likes, reach, comments, reposts, saves,
 * profile visits, follower delta). Every field optional; whatever the
 * platform doesn't expose is simply left blank.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const store = await createScoutStore()

  const entry = await store.getContentHistoryEntry(id)
  if (!entry) return NextResponse.json({ error: 'History entry not found' }, { status: 404 })

  const persona = await store.getContentPersona(entry.personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  let updated = entry

  if (typeof body.ledToRealOutcome === 'boolean') {
    updated = await store.markContentHistoryOutcome(id, body.ledToRealOutcome)
  }

  const metricsPatch: Record<string, number | null> = {}
  for (const key of METRIC_KEYS) {
    const parsed = parseMetric(body[key])
    if (parsed !== undefined) metricsPatch[key] = parsed
  }
  if (Object.keys(metricsPatch).length > 0) {
    updated = await store.logContentMetrics(id, metricsPatch)
  }

  return NextResponse.json({ entry: updated })
}
