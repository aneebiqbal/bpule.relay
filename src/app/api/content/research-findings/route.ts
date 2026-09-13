import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const personaId = req.nextUrl.searchParams.get('personaId')
  if (!personaId) return NextResponse.json({ error: 'personaId is required' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const findings = await store.listResearchFindings(personaId, { unusedOnly: false, limit: 30 })
  return NextResponse.json({ findings })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { personaId, topicClusterId, finding, sourceLabel, sourceUrl, sourcePublishedAt } = body as {
    personaId: string
    topicClusterId: string
    finding: string
    sourceLabel: string
    sourceUrl: string
    sourcePublishedAt?: string | null
  }

  if (!personaId?.trim()) return NextResponse.json({ error: 'personaId is required' }, { status: 400 })
  if (!topicClusterId?.trim()) return NextResponse.json({ error: 'topicClusterId is required' }, { status: 400 })
  if (!finding?.trim()) return NextResponse.json({ error: 'finding is required' }, { status: 400 })
  if (!sourceLabel?.trim()) return NextResponse.json({ error: 'sourceLabel is required' }, { status: 400 })
  if (!sourceUrl?.trim() || !/^https?:\/\//i.test(sourceUrl.trim())) {
    return NextResponse.json({ error: 'A valid sourceUrl is required' }, { status: 400 })
  }

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const clusters = await store.listTopicClusters(personaId)
  if (!clusters.some((c) => c.id === topicClusterId)) {
    return NextResponse.json({ error: 'Topic cluster not found for this persona' }, { status: 404 })
  }

  const created = await store.createResearchFinding({
    personaId,
    topicClusterId,
    finding: finding.trim(),
    sourceLabel: sourceLabel.trim(),
    sourceUrl: sourceUrl.trim(),
    sourcePublishedAt: sourcePublishedAt ?? null,
  })

  await store.touchTopicCluster({
    topicClusterId,
    lastResearchAt: new Date().toISOString(),
  })

  return NextResponse.json({ finding: created })
}
