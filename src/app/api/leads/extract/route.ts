import { extractLeadBundle } from '@/lib/ai/extract'
import { hasProvider } from '@/lib/ai/config'
import { scanForSecrets } from '@/lib/ai/secrets'
import { sseStream } from '@/lib/sse/sse'
import { createScoutStore } from '@/lib/store'

export async function POST(request: Request) {
  let body: { rawText?: string }
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

    emit({ type: 'status', message: 'Reading the profile' })
    emit({ type: 'status', message: 'Extracting fields' })

    try {
      const bundle = await extractLeadBundle(rawText, {
        onStatus(message) {
          emit({ type: 'status', message })
        },
      })
      // One log entry per model call actually made (fast pass, plus an
      // escalation pass if one ran), so cost-by-tier reflects real spend.
      const latencyMs = Date.now() - started
      if (bundle.callLog.length === 0) {
        void safeLog({ success: true, latencyMs, model: 'demo' })
      } else {
        for (const call of bundle.callLog) {
          void safeLog({
            success: true,
            latencyMs,
            model: call.host,
            costTier: call.costTier,
            host: call.host,
            costUsd: call.estimatedCostUsd,
          })
        }
      }
      emit({
        type: 'done',
        extracted: bundle.primary,
        candidates: bundle.candidates,
        demoMode: !hasProvider(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.'
      void safeLog({
        success: false,
        latencyMs: Date.now() - started,
        model: 'n/a',
        error: message,
      })
      throw err
    }
  })
}
