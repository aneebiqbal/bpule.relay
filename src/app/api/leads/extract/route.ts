import { extractLeadBundle } from '@/lib/ai/extract'
import { hasProvider } from '@/lib/ai/config'
import { pickModel } from '@/lib/ai/routing'
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
    const model = pickModel('extract').model
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
      error?: string | null
    }) => {
      try {
        await store?.logExtractionRun(input)
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
        model,
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
      void safeLog({
        success: true,
        latencyMs: Date.now() - started,
        model,
      })
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
        model,
        error: message,
      })
      throw err
    }
  })
}
