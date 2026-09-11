import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { computeUpworkScore } from '@/lib/score/upwork-rubric'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!title || !description) {
    return NextResponse.json(
      { error: 'Title and description are required.' },
      { status: 400 },
    )
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  const requiredSkills = Array.isArray(body.requiredSkills)
    ? (body.requiredSkills as unknown[]).filter((t): t is string => typeof t === 'string')
    : []

  const job = await store.createUpworkJob({
    title,
    description,
    budgetMin: typeof body.budgetMin === 'number' ? body.budgetMin : null,
    budgetMax: typeof body.budgetMax === 'number' ? body.budgetMax : null,
    hourlyRateMin: typeof body.hourlyRateMin === 'number' ? body.hourlyRateMin : null,
    hourlyRateMax: typeof body.hourlyRateMax === 'number' ? body.hourlyRateMax : null,
    proposalCount: typeof body.proposalCount === 'number' ? body.proposalCount : null,
    connectsCost: typeof body.connectsCost === 'number' ? body.connectsCost : 0,
    requiredSkills,
    urgencySignal: typeof body.urgencySignal === 'string' ? body.urgencySignal : null,
    rawInput: typeof body.rawInput === 'string' ? body.rawInput : null,
    tags: Array.isArray(body.tags)
      ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
  })

  const score = computeUpworkScore({
    budgetMin: job.budgetMin,
    budgetMax: job.budgetMax,
    hourlyRateMin: job.hourlyRateMin,
    hourlyRateMax: job.hourlyRateMax,
    proposalCount: job.proposalCount,
    requiredSkills: job.requiredSkills,
    urgencySignal: job.urgencySignal,
    description: job.description,
  })

  await store.updateUpworkJobScore(job.id, score)

  return NextResponse.json({ job: { ...job, score: score.total, verdict: score.verdict }, score }, { status: 201 })
}

export async function GET() {
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  const jobs = await store.listUpworkJobs()
  return NextResponse.json({ jobs })
}
