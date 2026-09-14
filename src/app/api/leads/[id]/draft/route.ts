import type { ExtractedLead, OutreachStrategy, SafeFact, MatchedProof } from '@/lib/domain/types'
import { computeScore } from '@/lib/score/rubric'
import { streamDraft } from '@/lib/ai/draft-stream'
import type { DraftMessageType } from '@/lib/ai/draft'
import { selectFewShotExamples } from '@/lib/ai/few-shot'
import { embedText } from '@/lib/ai/embed'
import { mergeProofMatches } from '@/lib/ai/proof-match'
import { createScoutStore } from '@/lib/store'
import { sseStream } from '@/lib/sse/sse'
import { buildProfileIntelligence, matchProofToLead, classifyLeadFact } from '@/lib/relay/profile-intelligence'
import { createOutreachStrategy } from '@/lib/relay/outreach-strategy'
import { analyzeReply, buildReplyStrategy, buildConversationContext } from '@/lib/relay/conversation-engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { type?: string; profileId?: string; proofId?: string; replyToMessageId?: string; replyText?: string }
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

  // Reply requires either a message ID to reply to or explicit reply text
  if (type === 'reply' && !body.replyToMessageId && !body.replyText?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Reply drafting requires replyToMessageId or replyText.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
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

  const rulebook = await store.getRulebook()

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
      titleRaw: detail.titleRaw ?? detail.contactTitle,
      company: detail.company,
      url: detail.url,
      locationRaw: detail.locationRaw ?? null,
      roleCategory: detail.roleCategory ?? undefined,
      marketRegion: detail.marketRegion ?? undefined,
      extractionConfidence: detail.extractionConfidence ?? undefined,
      confidenceNotes:
        ((detail.extractionProfile as { confidenceNotes?: string[] } | null)
          ?.confidenceNotes as string[] | undefined) ?? [],
      signalType: detail.signalType ?? 7,
      signalEvidence: detail.signalEvidence ?? '',
      verbatimQuote: detail.verbatimQuote,
      tags: detail.tags ?? [],
    }

    const score = computeScore(extracted, rulebook!)

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

    // Build outreach strategy using Revenue Intelligence
    let strategy: OutreachStrategy | null = null
    let safeFacts: SafeFact[] = []
    let matchedProofCards: MatchedProof[] = []
    let conversationContext: string | null = null

    if (profile) {
      const profileIntelligence = buildProfileIntelligence(profile, [])
      matchedProofCards = matchProofToLead(profileIntelligence, detail.tags ?? [], 3)
      safeFacts = [classifyLeadFact(detail.signalEvidence ?? '', detail.signalEvidence ?? '', detail.signalType ?? null)]
      void profileIntelligence

      if (type === 'reply') {
        // For replies: analyze the prospect's message and build a reply strategy
        const prospectReplyMsg = body.replyToMessageId && body.replyToMessageId !== 'manual'
          ? detail.messages.find((m) => m.id === body.replyToMessageId)
          : null
        const prospectReply = body.replyText?.trim() || prospectReplyMsg?.sentText || prospectReplyMsg?.draftText || ''

        if (prospectReply) {
          const priorMessages = detail.messages.filter((m) => m.sentAt && m.sentAt < (prospectReplyMsg?.sentAt ?? ''))
          const convStage = detail.status === 'followed_up' ? 'contacted' : detail.status === 'new' ? 'new' : detail.status === 'contacted' ? 'contacted' : detail.status === 'replied' ? 'replied' : detail.status === 'no' ? 'lost' : detail.status === 'dead' ? 'lost' : 'contacted'
          const replyAnalysis = analyzeReply(prospectReply, {
            leadId: detail.id,
            leadCompany: detail.company,
            contactName: detail.contactName,
            replyText: prospectReply,
            priorMessages,
            conversationStage: convStage,
            senderProfileId: profile.id,
          })
          const replyStrategy = buildReplyStrategy(replyAnalysis, {
            leadId: detail.id,
            leadCompany: detail.company,
            contactName: detail.contactName,
            replyText: prospectReply,
            priorMessages,
            conversationStage: convStage,
            senderProfileId: profile.id,
          }, null)
          conversationContext = buildConversationContext({
            leadId: detail.id,
            leadCompany: detail.company,
            contactName: detail.contactName,
            replyText: prospectReply,
            priorMessages,
            conversationStage: convStage,
            senderProfileId: profile.id,
          }, replyAnalysis)
          void replyStrategy
        } else {
          conversationContext = `Write a helpful, direct reply to the prospect. Answer any questions. Advance the conversation naturally.`
        }
      } else {
        // For first-touch and followups: use the standard outreach strategy
        strategy = createOutreachStrategy({
          leadCompany: detail.company,
          contactName: detail.contactName,
          contactTitle: detail.contactTitle,
          signalType: detail.signalType ?? null,
          signalEvidence: detail.signalEvidence ?? '',
          verbatimQuote: detail.verbatimQuote,
          tags: detail.tags ?? [],
          safeFacts,
          senderProfile: profile,
          matchedProof: matchedProofCards,
          channel: type === 'upwork' ? 'upwork' : type === 'connection' ? 'connection' : 'dm',
          relationshipStage: type === 'followup' ? 'followup' : 'first_touch',
        })
      }
    }

    const draftStarted = Date.now()
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
        strategy,
        safeFacts,
        matchedProofCards,
        conversationContext: conversationContext ?? undefined,
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

    // Persist sender profile on the lead
    if (profile) {
      try {
        await store.updateLeadSenderProfile(detail.id, profile.id)
      } catch {
        // Non-fatal: profile persistence must not break drafting
      }
    }

    // Log one entry per model call actually made (best-of-two, plus an
    // escalation pass if one ran), so cost-by-tier reflects real spend.
    const draftLatencyMs = Date.now() - draftStarted
    for (const call of draftResult.callLog) {
      try {
        await store.logExtractionRun({
          task: 'draft',
          success: true,
          latencyMs: draftLatencyMs,
          model: call.host,
          costTier: call.costTier,
          host: call.host,
          costUsd: call.estimatedCostUsd,
        })
      } catch {
        // Metrics logging must never break drafting.
      }
    }
  })
}
