import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { refinePersonaFromFeedback } from '@/lib/ai/persona-refinement'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/personas/[id]/refine — run a lightweight personality
 * refinement pass based on accumulated accept/reject signals. Intended to
 * be called after a batch of reactions or on a weekly cadence, whichever
 * comes first.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const feedback = await store.listContentDraftFeedback(id, 80)
  const accepted = feedback.filter((f) => f.reaction === 'posting' || f.reaction === 'posting_after_edit').length
  const rejected = feedback.filter((f) => f.reaction === 'not_for_me').length
  const totalDecisions = accepted + rejected

  // Need enough signal to justify a refinement pass.
  if (totalDecisions < 6) {
    return NextResponse.json({ refined: false, reason: 'Not enough signal yet.', totalDecisions })
  }

  const clusters = await store.listTopicClusters(id)
  const clusterNames = new Map(clusters.map((c) => [c.id, c.clusterName]))

  try {
    const refinement = await refinePersonaFromFeedback({
      currentHumorStyle: persona.humorStyle,
      currentValuesAndOpinions: persona.valuesAndOpinions,
      currentAdmiredExamples: persona.admiredExamples,
      topicClusterNames: clusters.map((c) => c.clusterName),
      recentFeedback: feedback.map((f) => ({
        topicClusterName: f.topicClusterId ? (clusterNames.get(f.topicClusterId) ?? null) : null,
        sourceKind: f.sourceKind,
        reaction: f.reaction,
        edited: f.edited,
        editSignals: f.editSignals,
      })),
    })

    const changed =
      refinement.humorStyle !== persona.humorStyle ||
      JSON.stringify(refinement.valuesAndOpinions) !== JSON.stringify(persona.valuesAndOpinions) ||
      JSON.stringify(refinement.admiredExamples) !== JSON.stringify(persona.admiredExamples)

    if (!changed) {
      return NextResponse.json({ refined: false, reason: 'No clear shift detected.', totalDecisions })
    }

    const updated = await store.updateContentPersonaProfile({
      personaId: id,
      humorStyle: refinement.humorStyle,
      valuesAndOpinions: refinement.valuesAndOpinions,
      admiredExamples: refinement.admiredExamples,
    })

    return NextResponse.json({ refined: true, persona: updated, focusShiftNote: refinement.focusShiftNote, totalDecisions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refinement failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
