import type { ExtractedLead } from '@/lib/domain/types'
import { computeScore } from '@/lib/score/rubric'
import { streamDraft } from '@/lib/ai/draft-stream'
import type { DraftMessageType } from '@/lib/ai/draft'
import { selectFewShotExamples } from '@/lib/ai/few-shot'
import { embedText } from '@/lib/ai/embed'
import { mergeProofMatches } from '@/lib/ai/proof-match'
import { createScoutStore } from '@/lib/store'
import { sseStream } from '@/lib/sse/sse'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { type?: string; profileId?: string; proofId?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const type = body.type ?? 'dm'
  const profileId = body.profileId ?? null
  const proofId = body.proofId ?? null

  if (!['dm', 'connection', 'upwork', 'followup', 'reply'].includes(type)) {
    return new Response(JSON.stringify({ error: 'Unknown message type.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Not signed in.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const detail = await store.getLead(id)
  if (!detail) {
    return new Response(JSON.stringify({ error: 'Lead not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (detail.status === 'no' || detail.status === 'dead') {
    return new Response(
      JSON.stringify({ error: 'This lead is no or dead. It is locked.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return sseStream(async (emit) => {
    const [facts, plays, profiles, fewShotPool] = await Promise.all([
      store.listFacts(),
      store.listPlays(),
      store.listProfiles(),
      store.listFewShotWins(50),
    ])
    const profile =
      profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null
    const voiceProfile = await store.getVoiceProfile()

    const extracted: ExtractedLead = {
      name: detail.contactName,
      title: detail.contactTitle,
      company: detail.company,
      url: detail.url,
      signalType: detail.signalType ?? 7,
      signalEvidence: detail.signalEvidence ?? '',
      verbatimQuote: detail.verbatimQuote,
      tags: detail.tags ?? [],
    }

    const score = computeScore(extracted)

    // Proof matching: tag overlap + semantic embedding merge.
    const tagMatches = await store.matchProofItems(detail.tags ?? [], 8)
    let semanticMatches: Array<{ item: import('@/lib/domain/types').ProofItem; similarity: number }> = []
    try {
      const leadEmbedding = await embedText(
        `${detail.company} ${detail.signalEvidence ?? ''} ${detail.tags.join(' ')}`,
      )
      semanticMatches = await store.matchProofItemsByEmbedding(leadEmbedding, 8)
    } catch {
      // If embedding fails, fall back to tag-only matching.
    }
    let matched = mergeProofMatches(semanticMatches, tagMatches, 8)

    if (proofId) {
      const explicit = matched.find((p) => p.id === proofId) ?? null
      if (explicit) matched = [explicit, ...matched.filter((p) => p.id !== proofId)]
    }
    if (matched.length > 0) emit({ type: 'proof', items: matched })

    // Few-shot injection from real wins.
    const fewShotSelection = selectFewShotExamples(fewShotPool, { leadId: detail.id, lead: detail, extracted, score, type: type as DraftMessageType, styleCard: voiceProfile?.styleCard ?? null, facts, plays, history: detail.messages, profile, matchedProof: matched[0] ?? null }, plays)

    const draftResult = await streamDraft(
      {
        leadId: detail.id,
        lead: detail,
        extracted,
        score,
        type: type as DraftMessageType,
        styleCard: voiceProfile?.styleCard ?? null,
        facts,
        plays,
        history: detail.messages,
        profile,
        matchedProof: matched[0] ?? null,
        fewShotExamples: fewShotSelection.examples.map((e) => ({
          company: e.company,
          signalEvidence: e.signalEvidence ?? '',
          sentText: e.sentText,
        })),
      },
      emit,
      matched[0] ?? null,
      profile ?? null,
    )

    await store.saveDraft({
      leadId: detail.id,
      type: draftResult.type,
      draftText: draftResult.draftText,
      modelUsed: draftResult.modelUsed,
    })
  })
}
