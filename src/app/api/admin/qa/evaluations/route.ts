import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  MESSAGE_CLASSIFICATIONS,
  THESIS_RATINGS,
  recordMessageEvaluation,
  recordThesisEvaluation,
  recordRoutingEvaluation,
} from '@/lib/admin/evaluations'

export const dynamic = 'force-dynamic'

const isOneOf = <T extends readonly string[]>(v: unknown, allowed: T): v is T[number] =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v)

/**
 * POST /api/admin/qa/evaluations
 * body: { kind: 'message' | 'thesis' | 'routing', ... }
 * Persists a reviewer judgment. Never overwrites the original artefact.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(auth, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const client = await createServerSupabase()
  const kind = body.kind

  try {
    if (kind === 'message') {
      const score = Number(body.score)
      if (!Number.isInteger(score) || score < 1 || score > 5) return NextResponse.json({ error: 'score must be 1-5.' }, { status: 400 })
      if (!isOneOf(body.classification, MESSAGE_CLASSIFICATIONS)) {
        return NextResponse.json({ error: 'Invalid classification.' }, { status: 400 })
      }
      await recordMessageEvaluation(client, {
        organizationId: auth.orgId,
        messageId: String(body.messageId),
        reviewerRepId: auth.repId,
        score,
        classification: body.classification,
        dimensions: (body.dimensions as Record<string, number>) ?? {},
        reasons: Array.isArray(body.reasons) ? (body.reasons as string[]) : [],
        note: typeof body.note === 'string' ? body.note : null,
      })
      return NextResponse.json({ ok: true }, { status: 201 })
    }

    if (kind === 'thesis') {
      if (!isOneOf(body.rating, THESIS_RATINGS)) return NextResponse.json({ error: 'Invalid rating.' }, { status: 400 })
      await recordThesisEvaluation(client, {
        organizationId: auth.orgId,
        leadId: String(body.leadId),
        reviewerRepId: auth.repId,
        rating: body.rating,
        reasons: Array.isArray(body.reasons) ? (body.reasons as string[]) : [],
        note: typeof body.note === 'string' ? body.note : null,
      })
      return NextResponse.json({ ok: true }, { status: 201 })
    }

    if (kind === 'routing') {
      await recordRoutingEvaluation(client, {
        organizationId: auth.orgId,
        leadId: String(body.leadId),
        reviewerRepId: auth.repId,
        bestSenderProfileId: typeof body.bestSenderProfileId === 'string' ? body.bestSenderProfileId : null,
        v1Correct: typeof body.v1Correct === 'boolean' ? body.v1Correct : null,
        v2Correct: typeof body.v2Correct === 'boolean' ? body.v2Correct : null,
      })
      return NextResponse.json({ ok: true }, { status: 201 })
    }

    if (kind === 'thread') {
      // Thread identity actions persist on the message itself.
      const action = typeof body.action === 'string' ? body.action : ''
      const messageId = String(body.messageId ?? '')
      if (!messageId) return NextResponse.json({ error: 'messageId is required.' }, { status: 400 })
      if (action === 'confirm') {
        const { error: e } = await client.from('messages').update({ thread_status: 'VERIFIED' }).eq('id', messageId).eq('organization_id', auth.orgId)
        if (e) throw e
        return NextResponse.json({ ok: true, persisted: 'thread_status=VERIFIED' }, { status: 201 })
      }
      if (action === 'dismiss') {
        const { error: e } = await client.from('messages').update({ thread_status: 'DISMISSED' }).eq('id', messageId).eq('organization_id', auth.orgId)
        if (e) throw e
        return NextResponse.json({ ok: true, persisted: 'thread_status=DISMISSED' }, { status: 201 })
      }
      return NextResponse.json({ error: 'Reassign needs a target identity; use the lead page.', persisted: false }, { status: 400 })
    }

    return NextResponse.json({ error: 'Unknown evaluation kind.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Evaluation failed.' }, { status: 500 })
  }
}
