import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export async function GET() {
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  try {
    const cases = await store.listGoldenSet()
    return NextResponse.json({ cases })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load golden set.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const leadId = typeof body.leadId === 'string' ? body.leadId : ''
  const knownReplied = Boolean(body.knownReplied)
  if (!leadId) {
    return NextResponse.json(
      { error: 'leadId is required.' },
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

  try {
    const c = await store.addGoldenCase({
      leadId,
      messageId: typeof body.messageId === 'string' ? body.messageId : undefined,
      knownReplied,
      sentText: typeof body.sentText === 'string' ? body.sentText : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    })
    return NextResponse.json({ case: c })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to add golden case.' },
      { status: 500 },
    )
  }
}
