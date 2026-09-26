import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import type { MessageType } from '@/lib/domain/types'
import { computeEditDelta, classifySendDisposition, inferFeedbackReasons } from '@/lib/relay/edit-learning'
import { safeErrorResponse } from '@/lib/errors'

const TYPES: MessageType[] = ['dm', 'connection', 'upwork', 'followup', 'reply']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { sentText?: string; type?: string; originalDraft?: string; rejected?: boolean; rejectReasons?: string[]; idempotencyKey?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const sentText = body.sentText?.trim() ?? ''
  if (!sentText && body.rejected !== true) {
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
      { error: 'Not signed in.' },
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
    const originalDraft = body.originalDraft?.trim() || sentText
    const disposition = classifySendDisposition(originalDraft, sentText, body.rejected === true)
    const inferredReasons = inferFeedbackReasons(originalDraft, sentText, disposition)
    const rejectReasons = [
      ...inferredReasons,
      ...((body.rejectReasons ?? []).filter((r): r is typeof inferredReasons[number] =>
        [
          'TOO_LONG', 'GENERIC', 'FAKE_PERSONALIZATION', 'UNSUPPORTED', 'TOO_SALESY',
          'WRONG_OBJECTIVE', 'BAD_CTA', 'UNNATURAL', 'WRONG_PROOF', 'WRONG_TIMING',
        ].includes(r),
      )),
    ]

    if (body.rejected === true) {
      try {
        const delta = computeEditDelta(originalDraft, sentText)
        await store.logEditLearning({
          messageId: null,
          originalText: originalDraft,
          editedText: sentText,
          editDistance: delta.editDistance,
          lengthDelta: delta.lengthDelta,
          greetingChanged: delta.greetingChanged,
          ctaChanged: delta.ctaChanged,
          proofRemoved: delta.proofRemoved,
          madeShorter: delta.madeShorter,
          madeLonger: delta.madeLonger,
          formalityShift: delta.formalityShift,
          sendDisposition: disposition,
          rejectReasons,
        })
      } catch {
        // Rejection telemetry must not break the UI.
      }
      return NextResponse.json({ ok: true, disposition, rejectReasons })
    }

    const result = await store.markContacted(id, sentText, type, {
      originalDraft,
      sendDisposition: disposition,
      rejectReasons,
      idempotencyKey: body.idempotencyKey?.trim() || null,
    })
    if (result.idempotent) {
      // Duplicate call for the same logical send (double-click, retry) —
      // return the already-recorded result as a success, but skip the
      // learning/memory/event side effects below, which already ran on the
      // original call. Re-running them would be harmless for most (they're
      // themselves best-effort/non-fatal) but pointless and would blur
      // "how many times was this send attempted" telemetry.
      return NextResponse.json({
        ok: true,
        todaySends: result.todaySends,
        type,
        disposition,
        idempotent: true,
      })
    }
    if (!result.allowed) {
      return NextResponse.json(
        { error: result.message ?? 'Send ceiling reached.' },
        { status: 429 },
      )
    }

    try {
      const delta = computeEditDelta(originalDraft, sentText)
      await store.logEditLearning({
        messageId: null,
        originalText: originalDraft,
        editedText: sentText,
        editDistance: delta.editDistance,
        lengthDelta: delta.lengthDelta,
        greetingChanged: delta.greetingChanged,
        ctaChanged: delta.ctaChanged,
        proofRemoved: delta.proofRemoved,
        madeShorter: delta.madeShorter,
        madeLonger: delta.madeLonger,
        formalityShift: delta.formalityShift === 'more_formal' ? 'more_formal' : delta.formalityShift === 'less_formal' ? 'less_formal' : delta.formalityShift === 'same' ? 'same' : null,
        sendDisposition: disposition,
        rejectReasons,
      })
    } catch {
      // Non-fatal: learning must not break the send
    }

    if (type === 'followup') {
      try {
        await store.emitRelayEvent({
          eventType: 'FOLLOWUP_RECORDED',
          entityType: 'lead',
          entityId: id,
          actorType: 'rep',
          payload: { type, disposition },
          source: 'app',
          // Stable key across retries (mirrors OUTREACH_RECORDED pattern).
          // Date.now() would make every call unique and defeat dedup.
          sourceEventId: `followup_recorded:${id}:${body.idempotencyKey ?? 'none'}`,
        })
      } catch {
        // Non-fatal
      }
    }

    // Record sales memory for this send
    try {
      await store.addSalesMemory({
        memoryType: 'angle_used',
        content: `Sent ${type} to ${lead.company}: ${sentText.slice(0, 120)}`,
        leadId: id,
        channel: type,
        stage: lead.status,
        outcome: null,
      })
    } catch {
      // Non-fatal: memory must not break the send
    }

    return NextResponse.json({
      ok: true,
      todaySends: result.todaySends,
      type,
      disposition,
    })
  } catch (err) {
    if (err instanceof Error && /locked|owner|unavailable/i.test(err.message)) {
      return NextResponse.json({ error: 'This lead is locked or not assigned to you.' }, { status: 409 })
    }
    return safeErrorResponse(err, 500, 'Failed to log send.', 'leads/[id]/contact')
  }
}
