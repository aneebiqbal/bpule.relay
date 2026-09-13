import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

type DecisionType = 'question' | 'react' | 'ready' | 'none'

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

  const clusters = await store.listTopicClusters(personaId)
  const findings = await store.listResearchFindings(personaId, { unusedOnly: true, limit: 10 })
  const generatedToday = await store.countContentDraftsToday(personaId)

  if (generatedToday >= 2) {
    return NextResponse.json({
      decisionType: 'none' as DecisionType,
      reason: 'Daily cap reached for this persona.',
    })
  }

  const nowMs = Date.now()
  const staleCluster = clusters
    .filter((c) => c.lastInputAt)
    .sort((a, b) => (a.lastInputAt ?? '').localeCompare(b.lastInputAt ?? ''))[0]

  const finding = findings.find((f) => {
    const ageDays = (nowMs - new Date(f.createdAt).getTime()) / 86_400_000
    return ageDays <= 5
  })

  if (finding) {
    const cluster = clusters.find((c) => c.id === finding.topicClusterId) ?? null
    return NextResponse.json({
      decisionType: 'react' as DecisionType,
      topicCluster: cluster,
      finding,
      prompt: 'Fresh, source-linked finding on one of your themes. Want to react to it?',
    })
  }

  if (staleCluster) {
    const gapDays = Math.floor((nowMs - new Date(staleCluster.lastInputAt as string).getTime()) / 86_400_000)
    if (gapDays >= 6) {
      return NextResponse.json({
        decisionType: 'question' as DecisionType,
        topicCluster: staleCluster,
        prompt: `What happened recently around ${staleCluster.clusterName} that changed your view?`,
      })
    }
  }

  if (persona.valuesAndOpinions.length >= 2 && clusters.length > 0) {
    return NextResponse.json({
      decisionType: 'ready' as DecisionType,
      topicCluster: clusters[0],
      prompt: 'Enough real opinion is already stored. Generate from existing material today?',
    })
  }

  return NextResponse.json({
    decisionType: 'none' as DecisionType,
    reason: 'Nothing worth surfacing today.',
  })
}
