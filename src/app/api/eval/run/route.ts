import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { runEval } from '@/lib/ai/eval'
import type { DraftInput } from '@/lib/ai/draft'
import { computeScore } from '@/lib/score/rubric'

export async function GET() {
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  try {
    const runs = await store.listEvalRuns()
    return NextResponse.json({ runs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load eval runs.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const promptVersion = typeof body.promptVersion === 'string' ? body.promptVersion : 'unknown'

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  try {
    const goldenCases = await store.listGoldenSet()
    const [facts, plays, profiles] = await Promise.all([
      store.listFacts(),
      store.listPlays(),
      store.listProfiles(),
    ])

    const cases = await Promise.all(
      goldenCases.map(async (c) => {
        const lead = await store.getLead(c.leadId)
        if (!lead) return null
        const profile = profiles[0] ?? null
        const voiceProfile = await store.getVoiceProfile()
        const extracted = {
          name: lead.contactName,
          title: lead.contactTitle,
          company: lead.company,
          url: lead.url,
          signalType: lead.signalType ?? 7,
          signalEvidence: lead.signalEvidence ?? '',
          verbatimQuote: lead.verbatimQuote,
          tags: lead.tags ?? [],
        }
        const score = computeScore(extracted)
        const matched = await store.matchProofItems(lead.tags ?? [], 2)

        const input: DraftInput = {
          leadId: lead.id,
          lead,
          extracted,
          score,
          type: 'dm',
          styleCard: voiceProfile?.styleCard ?? null,
          facts,
          plays,
          history: lead.messages,
          profile,
          matchedProof: matched[0] ?? null,
        }

        return {
          id: c.id,
          leadId: c.leadId,
          knownReplied: c.knownReplied,
          sentText: c.sentText,
          leadCompany: lead.company,
          leadEvidence: lead.signalEvidence ?? '',
          input,
        }
      }),
    )

    const validCases = cases.filter(Boolean) as Parameters<typeof runEval>[0]
    const result = await runEval(validCases, promptVersion)

    const saved = await store.saveEvalRun({
      promptVersion: result.promptVersion,
      goldenSetSize: result.goldenSetSize,
      replyRateScore: result.replyRateScore,
      selfCheckPassRate: result.selfCheckPassRate,
      companyMentionRate: result.companyMentionRate,
      evidenceMentionRate: result.evidenceMentionRate,
      overallScore: result.overallScore,
      details: result.caseResults,
    })

    return NextResponse.json({ run: saved, result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Eval run failed.' },
      { status: 500 },
    )
  }
}
