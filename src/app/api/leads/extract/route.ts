import { hasProvider } from '@/lib/ai/config'
import { scanForSecrets } from '@/lib/ai/secrets'
import { sseStream } from '@/lib/sse/sse'
import { createScoutStore } from '@/lib/store'
import { produceCanonicalIntelligence, getDisplayScore } from '@/lib/intelligence-v2/orchestrator'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'
import type { ExtractedLead } from '@/lib/domain/types'

export const maxDuration = 120

export async function POST(request: Request) {
  let body: { rawText?: string; forceReanalyze?: boolean }
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
    return new Response(JSON.stringify({ error: 'Paste some raw research first.' }), {
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

  return sseStream(async (emit) => {
    const started = Date.now()
    let store = null
    try {
      store = await createScoutStore()
    } catch {
      store = null
    }

    const safeLog = async (input: {
      success: boolean
      latencyMs: number
      model: string
      costTier?: 'tier1' | 'tier2' | 'tier3' | 'tier4'
      host?: string
      costUsd?: number
      error?: string | null
    }) => {
      try {
        await store?.logExtractionRun({ task: 'extract', ...input })
      } catch {
        // Metrics logging must never break extraction.
      }
    }

    emit({ type: 'status', message: 'Scanning the paste' })
    const scanned = scanForSecrets(rawText)
    if (scanned.blocked) {
      void safeLog({
        success: false,
        latencyMs: Date.now() - started,
        model: 'n/a',
        error: scanned.reason,
      })
      emit({ type: 'error', message: scanned.reason })
      return
    }

    emit({ type: 'status', message: 'Extracting prospect intelligence' })

    try {
      const canonicalResult = await produceCanonicalIntelligence(rawText, {
        onStatus: (msg) => emit({ type: 'status', message: msg }),
        forceReanalyze: body.forceReanalyze === true,
        reuseIfUnchanged: store
          ? async (hash) => {
              const existing = await store!.findLeadByIntelligenceInputHash(hash)
              const canonical = existing?.canonicalIntelligence as CanonicalProspectIntelligence | null | undefined
              return canonical ?? null
            }
          : undefined,
      })

      const canonical = canonicalResult.intelligence
      const latencyMs = Date.now() - started

      if (canonical.extractionCallLog.length === 0) {
        void safeLog({ success: true, latencyMs, model: 'demo' })
      } else {
        for (const call of canonical.extractionCallLog) {
          void safeLog({
            success: true,
            latencyMs,
            model: call.provider,
          })
        }
      }

      const extracted: ExtractedLead = {
        name: canonical.intelligence.person.fullName,
        title: canonical.intelligence.person.title,
        titleRaw: canonical.intelligence.person.title,
        company: canonical.intelligence.company.name ?? 'Unknown company',
        url: canonical.intelligence.person.linkedinUrl ?? canonical.rawSource.sourceUrl ?? null,
        locationRaw: canonical.intelligence.person.location,
        aboutSummary: null,
        experienceSummary: null,
        recentPosts: canonical.intelligence.content.recentPosts.map((p) => ({
          paraphrase: p.paraphrase,
          verbatimQuote: p.verbatimQuote,
        })),
        roleCategory: 'other',
        marketRegion: 'unknown',
        signalType: 7,
        signalEvidence: canonical.intelligence.opportunity.description ?? canonical.intelligence.opportunityTrigger ?? rawText.slice(0, 200),
        extractionConfidence: canonical.extractionCompleteness.score,
        confidenceNotes: canonical.scoreBreakdown.missingInfo,
        verbatimQuote: canonical.intelligence.content.recentPosts[0]?.verbatimQuote ?? null,
        tags: [
          ...canonical.intelligence.content.topics,
          ...canonical.intelligence.content.technicalSignals,
          ...(canonical.intelligence.company.industry ? [canonical.intelligence.company.industry] : []),
        ],
      }

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
        demoMode: !hasProvider(),
        gateNotes: canonicalResult.gateNotes,
        repairAttempted: canonicalResult.repairAttempted,
        repairImproved: canonicalResult.repairImproved,
        reused: canonicalResult.reused,
      })
    } catch (err) {
      void safeLog({
        success: false,
        latencyMs: Date.now() - started,
        model: 'n/a',
        error: 'Extraction failed.',
      })
      throw err
    }
  }, 90_000)
}
