import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import type { MessageType } from '@/lib/domain/types'

const TYPES: MessageType[] = ['dm', 'connection', 'upwork', 'followup', 'reply']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { sentText?: string; type?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const sentText = body.sentText?.trim()
  if (!sentText) {
    return NextResponse.json(
      { error: 'Paste the message text you actually sent.' },
      { status: 400 },
    )
  }

  const type: MessageType = TYPES.includes(body.type as MessageType)
    ? (body.type as MessageType)
    : 'dm'

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  const lead = await store.getLead(id)
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
  }
  if (lead.status === 'no' || lead.status === 'dead') {
    return NextResponse.json(
      { error: 'This lead is no or dead. It is locked.' },
      { status: 409 },
    )
  }

  try {
    const result = await store.markContacted(id, sentText, type)
    if (!result.allowed) {
      return NextResponse.json(
        { error: result.message ?? 'Send ceiling reached.' },
        { status: 429 },
      )
    }
    return NextResponse.json({
      ok: true,
      todaySends: result.todaySends,
      type,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to log send.'
    if (/locked|owner|unavailable/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
