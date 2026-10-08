import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { extractUpworkJob, type ExtractedUpworkJob } from '@/lib/upwork-v2'

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

        const result = await extractUpworkJob({ rawText, url: rawUrl })
        if (result.error || !result.job) {
          const errorMessages: Record<string, string> = {
            INVALID_INPUT: 'Job text is too short or invalid.',
            AI_PROVIDER_FAILED: 'AI service temporarily unavailable. Please retry.',
            SCHEMA_FAILURE: 'Could not parse job structure. Please try again or enter manually.',
            TIMEOUT: 'Extraction timed out. Please try with shorter text.',
          }
          send({
            type: 'error',
            message: errorMessages[result.error ?? ''] ?? 'Extraction failed. Please retry.',
            errorCode: result.error,
            degraded: result.degraded,
          })
          controller.close()
          return
        }

        const job = result.job
        const tags = buildTags(job)
        const urgencySignal = deriveUrgency(job)
        const savedJob = await store.createUpworkJob({
          title: job.title,
          description: job.description,
          budgetMin: job.budget ?? null,
          budgetMax: null,
          hourlyRateMin: job.hourlyRateMin ?? null,
          hourlyRateMax: job.hourlyRateMax ?? null,
          connectsCost: 0,
          requiredSkills: job.skills ?? [],
          urgencySignal,
          rawInput: body.rawText,
          tags,
          screeningQuestions: job.screeningQuestions ?? [],
          applicationRequirements: job.applicationRequirements ?? [],
          engagementType: job.engagementType ?? null,
          weeklyHours: job.weeklyHours ?? null,
          duration: job.duration ?? null,
          experienceLevel: job.experienceLevel ?? null,
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
            urgencySignal,
            tags,
            screeningQuestions: job.screeningQuestions ?? [],
            applicationRequirements: job.applicationRequirements ?? [],
            engagementType: job.engagementType ?? '',
            weeklyHours: job.weeklyHours ?? '',
            duration: job.duration ?? '',
            experienceLevel: job.experienceLevel ?? '',
          },
          degraded: result.degraded,
          demoMode: false,
        })
      } catch (err) {
        console.error('[upwork-extract] Unexpected error:', err instanceof Error ? err.message : String(err))
        send({ type: 'error', message: 'Unexpected error. Please retry.' })
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

function buildTags(job: ExtractedUpworkJob): string[] {
  const tags: string[] = []
  const text = job.description.toLowerCase()

  // Domain tags
  if (/\b(mobile|ios|android|react native|flutter)\b/.test(text)) tags.push('mobile')
  if (/\b(web|frontend|backend|full[- ]?stack)\b/.test(text)) tags.push('web')
  if (/\b(devops|ci\/cd|cloud|aws|gcp|azure)\b/.test(text)) tags.push('devops')
  if (/\b(erp|crm|admin|dashboard)\b/.test(text)) tags.push('enterprise')
  if (/\b(maintenance|support|troubleshoot|bug fix)\b/.test(text)) tags.push('maintenance')
  if (/\b(launch|mvp|beta|pre[- ]?launch)\b/.test(text)) tags.push('launch')

  // Engagement tags
  if (job.engagementType) tags.push(job.engagementType.toLowerCase().replace(/[\s-]/g, '_'))
  if (job.experienceLevel?.toLowerCase().includes('expert')) tags.push('senior')

  return [...new Set(tags)]
}

function deriveUrgency(job: ExtractedUpworkJob): string {
  const text = job.description.toLowerCase()
  if (/\b(urgent|asap|immediately|right now|this week)\b/.test(text)) return 'urgent'
  if (/\b(incident response|emergency|production (?:down|issue|problem))\b/.test(text)) return 'high'
  if (/\b(pre[- ]?launch|commercial launch|going live|production (?:ready|preparation))\b/.test(text)) return 'high'
  if (/\b(ongoing|maintenance|support)\b/.test(text)) return 'medium'
  return 'medium'
}
