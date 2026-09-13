import { NextResponse } from 'next/server'
import type { ScoutStore } from '@/lib/store/types'
import { createScoutStore } from '@/lib/store'
import { runEval } from '@/lib/ai/eval'
import type { DraftInput } from '@/lib/ai/draft'
import { computeScore } from '@/lib/score/rubric'

function errorText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  if (err && typeof err === 'object') {
    const x = err as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
      error?: unknown
    }
    const parts = [x.message, x.details, x.hint, x.code, x.error]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    if (parts.length > 0) return parts.join(' | ')
  }
  return fallback
}

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

/** Shared by this route's POST and the off-peak cron trigger at /api/eval/cron-run. */
export async function runEvalHarness(store: ScoutStore, promptVersion: string) {
  const goldenCases = await store.listGoldenSet()
  if (goldenCases.length === 0) {
    throw new Error('Golden set is empty. Add at least one case before running eval.')
  }

  const [rulebook, facts, plays, profiles] = await Promise.all([
    store.getRulebook(),
    store.listFacts(),
    store.listPlays(),
    store.listProfiles(),
  ])
  if (!rulebook) {
    throw new Error('Organization rulebook not found. Apply migrations and seed rulebook first.')
  }
  const voiceProfile = await store.getVoiceProfile()

  const cases = await Promise.all(
    goldenCases.map(async (c) => {
      const lead = await store.getLead(c.leadId)
      if (!lead) return null
      const profile = profiles[0] ?? null
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
      const score = computeScore(extracted, rulebook)
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
  if (validCases.length === 0) {
    throw new Error('Golden set cases reference leads that are missing. Rebuild the golden set from existing leads.')
  }
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

  return { run: saved, result }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  let promptVersion = 'manual'
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      body = await request.json()
      promptVersion =
        typeof body.promptVersion === 'string' && body.promptVersion.trim()
          ? body.promptVersion
          : 'manual'
    } else {
      const form = await request.formData()
      const raw = form.get('promptVersion')
      promptVersion = typeof raw === 'string' && raw.trim() ? raw : 'manual'
      body = {}
    }
  } catch {
    body = {}
  }

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
    const { run, result } = await runEvalHarness(store, promptVersion)
    return NextResponse.json({ run, result })
  } catch (err) {
    const message = errorText(err, 'Eval run failed.')
    const status = /golden set is empty|rulebook not found|missing\.|apply migrations|rebuild the golden set/i.test(message)
      ? 409
      : 500
    return NextResponse.json(
      { error: message },
      { status },
    )
  }
}
