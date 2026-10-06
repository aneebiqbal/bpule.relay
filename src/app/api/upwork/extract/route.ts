import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { extractUpworkJob } from '@/lib/upwork-v2'
import { emitAction } from '@/lib/action-ledger'

export const maxDuration = 120

/**
 * POST /api/upwork/extract
 * Extract structured job data from pasted Upwork job text.
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

  const job = await extractUpworkJob({ rawText: body.rawText, url: body.url })
  if (!job) {
    return NextResponse.json({ error: 'Failed to extract job data.' }, { status: 500 })
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

  return NextResponse.json({ job: { ...job, id: savedJob.id }, duplicate: false })
}

function hashContent(text: string): string {
  let hash = 0
  const normalized = text.replace(/\s+/g, ' ').trim().slice(0, 1000)
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}
