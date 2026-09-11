import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const jobId = typeof body.jobId === 'string' ? body.jobId : ''
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
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  await store.markUpworkApplied(jobId, sentText, type as 'cover' | 'followup' | 'reply')
  return NextResponse.json({ ok: true })
}
