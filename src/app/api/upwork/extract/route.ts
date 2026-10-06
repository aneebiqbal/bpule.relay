import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { extractUpworkJob } from '@/lib/upwork-v2'

export const maxDuration = 120

/**
 * POST /api/upwork/extract
 * Extract structured job data from pasted Upwork job text.
 * Returns SSE stream for compatibility with the upwork/new page.
 * Uses createScoutStore() for proper user-session auth (not service role).
 */
export async function POST(request: Request) {
  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { rawText?: string; url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (!body.rawText || body.rawText.length < 50) {
    return NextResponse.json({ error: 'Job text too short.' }, { status: 400 })
  }

  const rawText = body.rawText
  const rawUrl = body.url
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      try {
        send({ type: 'status', message: 'Extracting job data...' })

        const job = await extractUpworkJob({ rawText, url: rawUrl })
        if (!job) {
          send({ type: 'error', message: 'Failed to extract job data.' })
          controller.close()
          return
        }

        const savedJob = await store.createUpworkJob({
          title: job.title,
          description: job.description,
          budgetMin: job.budget ?? null,
          budgetMax: null,
          hourlyRateMin: job.hourlyRateMin ?? null,
          hourlyRateMax: job.hourlyRateMax ?? null,
          connectsCost: 0,
          requiredSkills: job.skills ?? [],
          urgencySignal: null,
          rawInput: body.rawText,
          tags: [],
        })

        send({
          type: 'done',
          extracted: {
            title: job.title,
            description: job.description,
            budgetMin: job.budget?.toString() ?? '',
            budgetMax: '',
            hourlyRateMin: job.hourlyRateMin?.toString() ?? '',
            hourlyRateMax: job.hourlyRateMax?.toString() ?? '',
            proposalCount: '',
            connectsCost: '0',
            requiredSkills: (job.skills ?? []).join(', '),
            urgencySignal: '',
            tags: [],
          },
          demoMode: false,
        })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Extraction failed.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
