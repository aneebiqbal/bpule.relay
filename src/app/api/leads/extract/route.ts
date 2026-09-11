import { extractLead } from '@/lib/ai/extract'
import { hasProvider } from '@/lib/ai/config'
import { scanForSecrets } from '@/lib/ai/secrets'
import { sseStream } from '@/lib/sse/sse'

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
    emit({ type: 'status', message: 'Scanning the paste' })
    const scanned = scanForSecrets(rawText)
    if (scanned.blocked) {
      emit({ type: 'error', message: scanned.reason })
      return
    }

    emit({ type: 'status', message: 'Reading the profile' })
    emit({ type: 'status', message: 'Extracting fields' })

    const extracted = await extractLead(rawText)
    emit({
      type: 'done',
      extracted,
      demoMode: !hasProvider(),
    })
  })
}