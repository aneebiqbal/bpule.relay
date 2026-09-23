import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

// A job scoring below this is not recommended for a Connect spend — see
// src/lib/score/upwork-rubric.ts's verdictFor() (6-10 apply, 3-5
// apply_if_connects, 0-2 skip). The client already disables "Mark as
// applied" below this score (see upwork-job-actions.tsx), but a disabled
// button is not a security/business-logic boundary — this route is the real
// enforcement point and must reject independently of what the client sent.
const MIN_SCORE_TO_APPLY = 6

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: pathJobId } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // jobId in the body is accepted for backward compatibility with existing
  // callers, but the route's own [id] segment is the source of truth.
  const jobId = pathJobId || (typeof body.jobId === 'string' ? body.jobId : '')
  const sentText = typeof body.sentText === 'string' ? body.sentText.trim() : ''
  const type = typeof body.type === 'string' ? body.type : 'cover'
  if (!jobId || !sentText) {
    return NextResponse.json(
      { error: 'jobId and sentText are required.' },
      { status: 400 },
    )
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  // Server-side score gate — reuses the score computed and stored at
  // job-creation time (computeUpworkScore), never recomputed here.
  const job = await store.getUpworkJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }
  if (job.score === null || job.score < MIN_SCORE_TO_APPLY) {
    return NextResponse.json(
      {
        error: `Score below ${MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.`,
      },
      { status: 400 },
    )
  }

  await store.markUpworkApplied(jobId, sentText, type as 'cover' | 'followup' | 'reply')
  return NextResponse.json({ ok: true })
}
