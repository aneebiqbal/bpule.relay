import { extractLeadBundle } from '@/lib/ai/extract'
import { hasProvider } from '@/lib/ai/config'
import { scanForSecrets } from '@/lib/ai/secrets'
import { createScoutStore } from '@/lib/store'
import { sseStream } from '@/lib/sse/sse'
import { buildProfileIntelligence, matchProofToLead } from '@/lib/relay/profile-intelligence'
import { createOutreachStrategy } from '@/lib/relay/outreach-strategy'
import { streamDraft } from '@/lib/ai/draft-stream'
import { type DraftMessageType } from '@/lib/ai/draft'
import { selectFewShotExamples } from '@/lib/ai/few-shot'
import { mergeProofMatches } from '@/lib/ai/proof-match'
import { classifyLeadFact } from '@/lib/relay/profile-intelligence'
import { scoreProspect } from '@/lib/prospect/intelligence'
import { buildConnectionNoteStrategy } from '@/lib/prospect/strategy'
import { validateAndRepair, CONNECTION_NOTE_MAX_CHARS } from '@/lib/prospect/connection-note'
import type { ExtractedLead, Profile, MatchedProof } from '@/lib/domain/types'

/**
 * Prospect Analyze API
 *
 * Pipeline: paste → extract → score → match best sender → generate connection note.
 *
 * Ephemeral by default. Nothing is persisted unless the client explicitly
 * calls POST /api/leads with the extracted data (via the "Save as Lead" flow).
 */

export async function POST(request: Request) {
  let body: { rawText?: string; profileId?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rawText = body.rawText?.trim()
  if (!rawText) {
    return new Response(JSON.stringify({ error: 'Paste some profile text first.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (rawText.length > 30_000) {
    return new Response(JSON.stringify({ error: 'Paste is too long. Try a single profile at a time.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const explicitProfileId = body.profileId ?? null

  return sseStream(async (emit) => {
    let store = null
    try {
      store = await createScoutStore()
    } catch {
      // Continue without store — ephemeral analysis still works without persistence
      store = null
    }

    emit({ type: 'status', message: 'Scanning the paste' })
    const scanned = scanForSecrets(rawText)
    if (scanned.blocked) {
      emit({ type: 'error', message: scanned.reason })
      return
    }

    // ── Step 1: Extract ──
    emit({ type: 'status', message: 'Reading the profile' })
    let extracted: ExtractedLead
    try {
      const bundle = await extractLeadBundle(rawText, {
        onStatus: (msg) => emit({ type: 'status', message: msg }),
        task: 'extract',
      })
      extracted = bundle.primary
    } catch (err) {
      emit({ type: 'error', message: 'Extraction failed.' })
      return
    }

    // ── Step 2: Load profiles + match best sender ──
    emit({ type: 'status', message: 'Matching sender profiles' })
    let profiles: Profile[] = []
    let fewShotPool: Array<{ id: string; messageId: string; leadId: string; playId: string | null; signalType: number | null; sentText: string; company: string; signalEvidence: string | null; tags: string[]; createdAt: string }> = []
    try {
      if (store) {
        const [p, fs] = await Promise.all([
          store.listProfiles(),
          store.listFewShotWins(50),
        ])
        profiles = p
        fewShotPool = fs
      }
    } catch {
      // Profiles/ephemeral — continue without them
    }

    // Score each assigned profile and pick the best match
    const profileMatches: Array<{ profile: Profile; matchedProof: MatchedProof[]; totalScore: number }> = []
    for (const profile of profiles) {
      const intelligence = buildProfileIntelligence(profile, [])
      const matched = matchProofToLead(intelligence, extracted.tags ?? [], 3)
      const totalScore = matched.reduce((s, m) => s + m.relevanceScore, 0)
      profileMatches.push({ profile, matchedProof: matched, totalScore })
    }
    profileMatches.sort((a, b) => b.totalScore - a.totalScore)

    const explicitMatch = explicitProfileId
      ? profileMatches.find((pm) => pm.profile.id === explicitProfileId) ?? null
      : null
    const bestMatch = explicitMatch ?? profileMatches[0] ?? null
    const bestSender = bestMatch?.profile ?? null
    const bestSenderProof = bestMatch?.matchedProof ?? []

    if (explicitProfileId && !explicitMatch && profiles.length > 0) {
      // Explicit profile requested but not found — fall back to best
      emit({ type: 'status', message: 'Requested profile unavailable, using best match.' })
    }

    // ── Step 3: Score prospect ──
    emit({ type: 'status', message: 'Scoring the prospect' })
    const prospectScore = scoreProspect({
      extracted,
      assignedProfiles: profiles,
      profileIntelligences: profileMatches,
      bestSender,
      bestSenderProof,
    })

    // ── Step 4: Build connection note strategy ──
    const connectionStrategy = buildConnectionNoteStrategy(
      extracted,
      bestSender,
      bestSenderProof,
    )

    // ── Step 5: Generate connection note ──
    emit({ type: 'status', message: 'Drafting the connection note' })

    // Build outreach strategy for the draft pipeline
    const safeFact = classifyLeadFact(
      extracted.signalEvidence ?? '',
      extracted.signalEvidence ?? '',
      extracted.signalType ?? null,
    )

    let outreachStrategy: ReturnType<typeof createOutreachStrategy> | null = null
    if (bestSender) {
      outreachStrategy = createOutreachStrategy({
        leadCompany: extracted.company,
        contactName: extracted.name,
        contactTitle: extracted.title,
        signalType: extracted.signalType,
        signalEvidence: extracted.signalEvidence,
        verbatimQuote: extracted.verbatimQuote,
        tags: extracted.tags ?? [],
        safeFacts: [safeFact],
        senderProfile: bestSender,
        matchedProof: bestSenderProof,
        channel: 'connection',
        relationshipStage: 'first_touch',
      })
    }

    // Enhance strategy with connection note specific guidance
    let conversationContext: string | null = null
    if (connectionStrategy.candidateAngles.length > 0) {
      const angle = connectionStrategy.candidateAngles[0]
      conversationContext = [
        `## Connection Note Strategy`,
        ``,
        `**Goal:** ${angle.label} — ${angle.approach}`,
        `**Tone:** ${connectionStrategy.tone}`,
        connectionStrategy.strongestSafeSignal ? `**Relevant signal:** ${connectionStrategy.strongestSafeSignal}` : null,
        connectionStrategy.forbidden.length > 0 ? `**DO NOT mention:** ${connectionStrategy.forbidden.join('; ')}` : null,
        ``,
        `**Direction:** ${angle.systemDirective}`,
        ``,
        `**Hard rules:**`,
        `- Max ${CONNECTION_NOTE_MAX_CHARS} characters for LinkedIn connection notes`,
        `- Short, natural, no pitch, no praise, no sales language`,
        `- Sound like one professional reaching out to another`,
        `- No em dashes, no emojis, no exclamation marks`,
      ].filter(Boolean).join('\n')
    }

    // Few-shot selection
    let fewShotSelection: { examples: Array<{ company: string; signalEvidence: string; sentText: string }> } = { examples: [] }
    try {
      const leadForFewShot = {
        id: 'prospect-ephemeral',
        organizationId: '',
        ownerRepId: null,
        company: extracted.company,
        companyKey: extracted.company.toLowerCase().replace(/[^a-z0-9]/g, ''),
        contactName: extracted.name,
        contactTitle: extracted.title,
        url: extracted.url,
        rawInput: null,
        signalType: extracted.signalType,
        signalEvidence: extracted.signalEvidence,
        verbatimQuote: extracted.verbatimQuote,
        score: prospectScore.total > 70 ? 10 : prospectScore.total > 55 ? 7 : 4,
        verdict: prospectScore.recommendation === 'connect' ? 'send' as const : prospectScore.recommendation === 'maybe' ? 'research_more' as const : 'skip' as const,
        status: 'new' as const,
        playId: null,
        tags: extracted.tags ?? [],
        createdAt: new Date().toISOString(),
      }
      const fewShotResult = selectFewShotExamples(fewShotPool as Parameters<typeof selectFewShotExamples>[0], {
        leadId: 'prospect-ephemeral',
        lead: leadForFewShot,
        extracted,
        score: { total: prospectScore.total, verdict: prospectScore.recommendation === 'connect' ? 'send' as const : prospectScore.recommendation === 'maybe' ? 'research_more' as const : 'skip' as const, breakdown: prospectScore.dimensions as unknown as { category: string; label: string; points: number; max: number; note: string }[] },
        type: 'connection' as DraftMessageType,
        styleCard: null,
        facts: [],
        plays: [],
        history: [],
        profile: bestSender,
         matchedProof: null,
       }, [])
      fewShotSelection = {
        examples: fewShotResult.examples.map((e) => ({
          company: e.company,
          signalEvidence: e.signalEvidence ?? '',
          sentText: e.sentText,
        })),
      }
    } catch {
      // Few-shot is optional
    }

    // Proof matching for draft
    let matchedProofItem: import('@/lib/domain/types').ProofItem | null = null
    try {
      if (store) {
        const tagMatches = await store.matchProofItems(extracted.tags ?? [], 5, bestSender?.id ?? null)
        const leadEmbedding = await embedTextSafe(`${extracted.company} ${extracted.signalEvidence} ${(extracted.tags ?? []).join(' ')}`)
        let semanticMatches: Array<{ item: Parameters<typeof mergeProofMatches>[1][0]; similarity: number }> = []
        if (leadEmbedding) {
          semanticMatches = await store.matchProofItemsByEmbedding(leadEmbedding, 5, bestSender?.id ?? null) as typeof semanticMatches
        }
        const merged = mergeProofMatches(semanticMatches, tagMatches, 5)
        matchedProofItem = merged[0] ?? null
      }
    } catch {
      // Proof matching optional
    }

    // Generate the draft
    let draftText = ''
    let draftFailed = false
    let qualityResult: ReturnType<typeof validateAndRepair> | null = null

    const leadForDraft = {
      id: 'prospect-ephemeral',
      organizationId: '',
      ownerRepId: null,
      company: extracted.company,
      companyKey: extracted.company.toLowerCase().replace(/[^a-z0-9]/g, ''),
      contactName: extracted.name,
      contactTitle: extracted.title,
      url: extracted.url,
      rawInput: null,
      signalType: extracted.signalType,
      signalEvidence: extracted.signalEvidence,
      verbatimQuote: extracted.verbatimQuote,
      score: prospectScore.total > 70 ? 10 : prospectScore.total > 55 ? 7 : 4,
      verdict: prospectScore.recommendation === 'connect' ? 'send' as const : 'research_more' as const,
      status: 'new' as const,
      playId: null,
      tags: extracted.tags ?? [],
      createdAt: new Date().toISOString(),
    }

    try {
      const draftResult = await streamDraft(
        {
          leadId: 'prospect-ephemeral',
          lead: leadForDraft,
          extracted,
          score: { total: prospectScore.total, verdict: prospectScore.recommendation === 'connect' ? 'send' as const : 'research_more' as const, breakdown: prospectScore.dimensions as unknown as { category: string; label: string; points: number; max: number; note: string }[] },
          type: 'connection' as DraftMessageType,
          styleCard: null,
          facts: [],
          plays: [],
          history: [],
          profile: bestSender,
          matchedProof: matchedProofItem,
          fewShotExamples: fewShotSelection.examples,
          strategy: outreachStrategy,
          safeFacts: [safeFact],
          matchedProofCards: bestSenderProof,
          conversationContext: conversationContext ?? undefined,
        },
        emit,
        matchedProofItem,
        bestSender,
      )
      draftText = draftResult.draftText
    } catch {
      draftFailed = true
    }

    // Quality gate for connection notes
    qualityResult = validateAndRepair({
      text: draftText || 'Hi, came across your profile and would love to connect.',
      profile: bestSender,
      prospectName: extracted.name,
      prospectCompany: extracted.company,
      matchedProof: bestSenderProof,
    })

    // ── Emit final result ──
    emit({
      type: 'done',
      extracted,
      score: prospectScore,
      bestSender,
      bestSenderProof,
      connectionNote: qualityResult.text,
      charCount: qualityResult.charCount,
      maxChars: CONNECTION_NOTE_MAX_CHARS,
      quality: {
        passed: qualityResult.passed,
        failures: qualityResult.failures,
        wasRepaired: qualityResult.repaired !== null,
      },
      strategy: {
        whyConnect: connectionStrategy.whyConnect,
        relevantObservation: connectionStrategy.relevantObservation,
        forbidden: connectionStrategy.forbidden,
        candidateAngles: connectionStrategy.candidateAngles.map((a) => a.label),
      },
      draftFailed,
      demoMode: !hasProvider(),
      alternativeSenders: profileMatches
        .filter((pm) => pm.profile.id !== bestSender?.id)
        .slice(0, 3)
        .map((pm) => ({
          profile: pm.profile,
          matchScore: pm.totalScore,
          topProof: pm.matchedProof[0]?.safeClaim ?? null,
        })),
    })
  })
}

async function embedTextSafe(text: string): Promise<number[] | null> {
  try {
    const { embedText } = await import('@/lib/ai/embed')
    return await embedText(text)
  } catch {
    return null
  }
}
