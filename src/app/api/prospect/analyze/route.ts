import { hasProvider } from '@/lib/ai/config'
import { scanForSecrets } from '@/lib/ai/secrets'
import { deduplicated } from '@/lib/ai/dedup'
import { createScoutStore } from '@/lib/store'
import { sseStream } from '@/lib/sse/sse'
import { buildProfileIntelligence, matchProofToLead } from '@/lib/relay/profile-intelligence'
import { createOutreachStrategy } from '@/lib/relay/outreach-strategy'
import { streamDraft } from '@/lib/ai/draft-stream'
import { type DraftMessageType } from '@/lib/ai/draft'
import { selectFewShotExamples } from '@/lib/ai/few-shot'
import { mergeProofMatches } from '@/lib/ai/proof-match'
import { classifyLeadFact } from '@/lib/relay/profile-intelligence'
import { buildConnectionNoteStrategy } from '@/lib/prospect/strategy'
import { validateAndRepair, normalizeGreeting, CONNECTION_NOTE_MAX_CHARS } from '@/lib/prospect/connection-note'
import { evaluateProspectQualification } from '@/lib/prospect/qualification-gate'
import { classifyRoleFromTitle } from '@/lib/leads/targeting-pure'
import { isLinkedInChromeText } from '@/lib/intelligence-v2/role-signals'
import type { ExtractedLead, Profile, MatchedProof } from '@/lib/domain/types'
import { produceCanonicalIntelligence, getDisplayScore } from '@/lib/intelligence-v2/orchestrator'
import { resolveTimezoneFromLocation } from '@/lib/timezone/resolve'

/**
 * Prospect Analyze API — Intelligence V2
 *
 * Pipeline: paste → canonical intelligence (multi-pass extraction → completeness gate → canonical score) → match sender → connection note.
 *
 * Ephemeral by default. Nothing is persisted unless the client explicitly
 * calls POST /api/leads with the extracted data (via the "Save as Lead" flow).
 *
 * The canonical score is produced ONCE and never independently recomputed.
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

  const minimumExtracted: ExtractedLead = {
    name: null,
    title: null,
    titleRaw: null,
    company: 'Unknown company',
    url: null,
    locationRaw: null,
    aboutSummary: null,
    experienceSummary: null,
    recentPosts: [],
    roleCategory: 'other',
    marketRegion: 'unknown',
    signalType: 7,
    signalEvidence: rawText,
    extractionConfidence: 0,
    confidenceNotes: [],
    verbatimQuote: null,
    tags: [],
  }
  const precheck = evaluateProspectQualification({ rawText, extracted: minimumExtracted })

  return sseStream(async (emit) => {
    if (precheck.inputHardFail) {
      const isIrrelevant = precheck.inputClassification.classification === 'IRRELEVANT'
      emit({
        type: 'status',
        message: isIrrelevant
          ? 'Couldn\'t identify a prospect — this looks like a login/product page rather than a person, company, job, or business opportunity.'
          : 'Not enough context for a reliable qualification score.',
      })
      emitInsufficientDone(emit, minimumExtracted, precheck)
      return
    }

    let store = null
    try {
      store = await createScoutStore()
    } catch {
      store = null
    }

    emit({ type: 'status', message: 'Scanning the paste' })
    const scanned = scanForSecrets(rawText)
    if (scanned.blocked) {
      emit({ type: 'error', message: scanned.reason })
      return
    }

    // ── Step 1: Produce Canonical Intelligence ──
    emit({ type: 'status', message: 'Extracting prospect intelligence' })
    let canonicalResult: Awaited<ReturnType<typeof produceCanonicalIntelligence>>
    try {
      // Dedup: same rawText within 30s window reuses in-flight extraction
      const dedupKey = `analyze:${rawText.slice(0, 200)}`
      canonicalResult = await deduplicated(dedupKey, () =>
        produceCanonicalIntelligence(rawText, {
          onStatus: (msg) => emit({ type: 'status', message: msg }),
        }),
      )
    } catch {
      emit({ type: 'error', message: 'Intelligence extraction failed.' })
      return
    }

    const canonical = canonicalResult.intelligence
    const extracted: ExtractedLead = {
      name: canonical.intelligence.person.fullName,
      title: canonical.intelligence.person.title,
      titleRaw: canonical.intelligence.person.title,
      company: canonical.intelligence.company.name ?? 'Unknown company',
      url: canonical.intelligence.person.linkedinUrl ?? canonical.rawSource.sourceUrl,
      locationRaw: canonical.intelligence.person.location,
      aboutSummary: null,
      experienceSummary: null,
      recentPosts: canonical.intelligence.content.recentPosts
        .filter((p) => !isLinkedInChromeText(p.paraphrase) && !isLinkedInChromeText(p.verbatimQuote))
        .map((p) => ({
          paraphrase: p.paraphrase,
          verbatimQuote: p.verbatimQuote,
        })),
      roleCategory: classifyRoleFromTitle(canonical.intelligence.person.title),
      marketRegion: 'unknown',
      signalType: 7,
      signalEvidence: canonical.intelligence.opportunity.description ?? canonical.intelligence.opportunityTrigger ?? rawText.slice(0, 200),
      extractionConfidence: canonical.extractionCompleteness.score,
      confidenceNotes: canonical.scoreBreakdown.missingInfo,
      verbatimQuote: canonical.intelligence.content.recentPosts.find((p) => !isLinkedInChromeText(p.verbatimQuote))?.verbatimQuote ?? null,
      tags: [
        ...canonical.intelligence.content.topics,
        ...canonical.intelligence.content.technicalSignals,
        ...(canonical.intelligence.company.industry ? [canonical.intelligence.company.industry] : []),
      ],
    }

    if (canonical.qualification === 'skip') {
      emit({
        type: 'done',
        extracted,
        canonical,
        score: {
          total: canonical.canonicalScore,
          displayScore: getDisplayScore(canonical),
          label: canonical.scoreBreakdown.label,
          qualification: canonical.qualification,
          reasons: canonical.scoreBreakdown.reasons,
          watchOut: canonical.scoreBreakdown.watchOut,
          dimensions: canonical.scoreBreakdown.dimensions,
          missingInfo: canonical.scoreBreakdown.missingInfo,
        },
        remoteEligibility: canonical.remoteEligibility,
        evidenceLedger: canonical.evidenceLedger,
        sources: {
          rawSource: canonical.rawSource,
          urls: canonical.extractionCompleteness.urlsPreserved,
          sourceUrlsFound: canonical.extractionCompleteness.sourceUrlsFound,
        },
        extractionCompleteness: canonical.extractionCompleteness,
        bestSender: null,
        bestSenderProof: [],
        connectionNote: '',
        charCount: 0,
        maxChars: CONNECTION_NOTE_MAX_CHARS,
        quality: { passed: true, failures: [], wasRepaired: false },
        strategy: {
          whyConnect: '',
          relevantObservation: '',
          forbidden: [],
          candidateAngles: [],
        },
        draftFailed: false,
        demoMode: !hasProvider(),
        alternativeSenders: [],
        qualification: evaluateProspectQualification({ rawText, extracted }),
        gateNotes: canonicalResult.gateNotes,
        repairAttempted: canonicalResult.repairAttempted,
        repairImproved: canonicalResult.repairImproved,
      })
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
    const tagsForMatching = [
      ...canonical.intelligence.content.topics,
      ...canonical.intelligence.content.technicalSignals,
      ...(canonical.intelligence.company.industry ? [canonical.intelligence.company.industry] : []),
    ]

    const profileMatches: Array<{ profile: Profile; matchedProof: MatchedProof[]; totalScore: number }> = []
    for (const profile of profiles) {
      const intelligence = buildProfileIntelligence(profile, [])
      const matched = matchProofToLead(intelligence, tagsForMatching, 3)
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

    if (store) {
      try {
        const captured = await store.captureProspect({
          rawInput: rawText,
          extractedName: canonical.intelligence.person.fullName,
          extractedCompany: canonical.intelligence.company.name ?? null,
          extractedTitle: canonical.intelligence.person.title,
          extractedLocation: canonical.intelligence.person.location,
          linkedinUrl: canonical.intelligence.person.linkedinUrl ?? canonical.rawSource.sourceUrl ?? null,
          companyUrl: canonical.rawSource.companyUrl ?? null,
          canonicalScore: canonical.canonicalScore,
          canonicalIntelligence: canonical as unknown as Record<string, unknown>,
          scoreBreakdown: canonical.scoreBreakdown as unknown as Record<string, unknown>,
          revenueIdentityId: bestSender ? (bestSender as Profile & { revenueIdentityId?: string | null }).revenueIdentityId ?? null : null,
          senderProfileId: bestSender?.id ?? null,
        })
        await store.emitRelayEvent({
          eventType: 'PROSPECT_CAPTURED',
          entityType: 'captured_prospect',
          entityId: captured.id,
          actorType: 'rep',
          actorId: store.getCurrentRepId(),
          revenueIdentityId: captured.revenueIdentityId,
          source: 'app',
          sourceEventId: `prospect_captured:${captured.id}`,
          payload: {
            company: captured.extractedCompany,
            score: captured.canonicalScore,
          },
        })
      } catch {
        // Non-fatal: captured prospect must not block analysis
      }
    }

    if (explicitProfileId && !explicitMatch && profiles.length > 0) {
      emit({ type: 'status', message: 'Requested profile unavailable, using best match.' })
    }

    // ── Step 3: Build connection note strategy ──
    const connectionStrategy = buildConnectionNoteStrategy(
      extracted,
      bestSender,
      bestSenderProof,
    )

    // ── Step 4: Generate connection note ──
    emit({ type: 'status', message: 'Drafting the connection note' })

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
        score: getDisplayScore(canonical) ?? 5,
        verdict: canonical.qualification === 'strong' || canonical.qualification === 'worth_pursuing' ? 'send' as const : canonical.qualification === 'maybe' ? 'research_more' as const : 'skip' as const,
        status: 'new' as const,
        playId: null,
        tags: extracted.tags ?? [],
        createdAt: new Date().toISOString(),
      }
      const fewShotResult = selectFewShotExamples(fewShotPool as Parameters<typeof selectFewShotExamples>[0], {
        leadId: 'prospect-ephemeral',
        lead: leadForFewShot,
        extracted,
        score: { total: canonical.canonicalScore, verdict: canonical.qualification === 'strong' || canonical.qualification === 'worth_pursuing' ? 'send' as const : 'research_more' as const, breakdown: canonical.scoreBreakdown.dimensions as unknown as { category: string; label: string; points: number; max: number; note: string }[] },
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
        const tagMatches = await store.matchProofItems(tagsForMatching, 5, bestSender?.id ?? null)
        const leadEmbedding = await embedTextSafe(`${extracted.company} ${extracted.signalEvidence} ${tagsForMatching.join(' ')}`)
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
      score: getDisplayScore(canonical) ?? 5,
      verdict: canonical.qualification === 'strong' || canonical.qualification === 'worth_pursuing' ? 'send' as const : 'research_more' as const,
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
          score: { total: canonical.canonicalScore, verdict: canonical.qualification === 'strong' || canonical.qualification === 'worth_pursuing' ? 'send' as const : 'research_more' as const, breakdown: canonical.scoreBreakdown.dimensions as unknown as { category: string; label: string; points: number; max: number; note: string }[] },
          canonicalScore: canonical.canonicalScore,
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

    if (qualityResult.text) {
      qualityResult = {
        ...qualityResult,
        text: normalizeGreeting(qualityResult.text, extracted.name),
        charCount: normalizeGreeting(qualityResult.text, extracted.name).length,
      }
    }

    // ── Emit final result with canonical intelligence ──
    emit({
      type: 'done',
      extracted,
      canonical,
      score: {
        total: canonical.canonicalScore,
        displayScore: getDisplayScore(canonical),
        label: canonical.scoreBreakdown.label,
        qualification: canonical.qualification,
        reasons: canonical.scoreBreakdown.reasons,
        watchOut: canonical.scoreBreakdown.watchOut,
        dimensions: canonical.scoreBreakdown.dimensions,
        missingInfo: canonical.scoreBreakdown.missingInfo,
      },
      remoteEligibility: canonical.remoteEligibility,
      evidenceLedger: canonical.evidenceLedger,
      sources: {
        rawSource: canonical.rawSource,
        urls: canonical.extractionCompleteness.urlsPreserved,
        sourceUrlsFound: canonical.extractionCompleteness.sourceUrlsFound,
      },
      extractionCompleteness: canonical.extractionCompleteness,
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
      qualification: evaluateProspectQualification({ rawText, extracted }),
      gateNotes: canonicalResult.gateNotes,
      repairAttempted: canonicalResult.repairAttempted,
      repairImproved: canonicalResult.repairImproved,
    })
  })
}

function emitInsufficientDone(
  emit: (event: object) => void,
  extracted: ExtractedLead,
  qualification: ReturnType<typeof evaluateProspectQualification>,
): void {
  const isIrrelevant = qualification.inputClassification.classification === 'IRRELEVANT'
  emit({
    type: 'done',
    extracted,
    canonical: null,
    score: isIrrelevant ? 'N/A' : null,
    scoreNA: isIrrelevant,
    scoreReason: isIrrelevant
      ? 'Couldn\'t identify a prospect. This looks like a login/product page rather than a person, company, job, or business opportunity. Paste a LinkedIn profile, company page, job post, conversation, or other prospect information.'
      : null,
    remoteEligibility: null,
    evidenceLedger: [],
    sources: null,
    extractionCompleteness: null,
    bestSender: null,
    bestSenderProof: [],
    connectionNote: '',
    charCount: 0,
    maxChars: CONNECTION_NOTE_MAX_CHARS,
    quality: {
      passed: false,
      failures: ['qualification_blocked'],
      wasRepaired: false,
    },
    strategy: {
      whyConnect: '',
      relevantObservation: '',
      forbidden: [],
      candidateAngles: [],
    },
    draftFailed: false,
    demoMode: !hasProvider(),
    alternativeSenders: [],
    qualification,
    gateNotes: [],
    repairAttempted: false,
    repairImproved: false,
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
