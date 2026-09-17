import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { sseStream } from '@/lib/sse/sse'

export const maxDuration = 30

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { outcome: 'won' | 'lost'; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!['won', 'lost'].includes(body.outcome)) {
    return NextResponse.json({ error: 'Outcome must be "won" or "lost".' }, { status: 400 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const detail = await store.getLead(id)
  if (!detail) {
    return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
  }

  const result = await sseStream(async (emit) => {
    emit({ type: 'status', message: `Marking as ${body.outcome}` })

    const conversationState = await store.getConversationState(id)
    if (!conversationState) {
      emit({ type: 'error', message: 'No conversation state found for this lead.' })
      return
    }

    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      stage: body.outcome,
    }

    if (body.outcome === 'won') {
      updates.won_at = now
    } else {
      updates.lost_at = now
      if (body.reason?.trim()) {
        updates.lost_reason = body.reason.trim()
      }
    }

    await store.upsertConversationState({
      leadId: id,
      stage: body.outcome,
      wonAt: body.outcome === 'won' ? now : undefined,
      lostAt: body.outcome === 'lost' ? now : undefined,
      lostReason: body.reason?.trim() || null,
    })

    await store.updateLeadStatus(id, body.outcome)

    emit({ type: 'status', message: `Outcome recorded: ${body.outcome}` })
    emit({ type: 'done', outcome: body.outcome, stage: body.outcome })
  })

  return result
}
