import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendPreparedEmail } from '@/lib/email/service'
import { safeErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: {
    draftId?: string
    idempotencyKey?: string
    subject?: string | null
    body?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const draftId = body.draftId?.trim() ?? ''
  if (!draftId) return NextResponse.json({ error: 'draftId is required.' }, { status: 400 })

  const idempotencyKey = body.idempotencyKey?.trim() || `email:${id}:${draftId}`

  try {
    const store = await createScoutStore()
    const client = await createServerSupabase()

    const result = await sendPreparedEmail({
      client,
      store,
      orgId: store.organizationId,
      repId: store.getCurrentRepId(),
      leadId: id,
      draftId,
      idempotencyKey,
      subject: body.subject ?? null,
      body: body.body ?? null,
    })

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      todaySends: result.todaySends,
      emailMessage: result.emailMessage,
    })
  } catch (error) {
    if (error instanceof Error) {
      if (/suppressed/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (/invalid or bounced/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (/UNAUTHORIZED_REVENUE_IDENTITY/i.test(error.message)) {
        return NextResponse.json({ error: 'Revenue Identity is not assigned to you.' }, { status: 403 })
      }
      if (/Daily send cap/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 429 })
      }
      if (/Lead not found|not the owner/i.test(error.message)) {
        return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
      }
      if (/Claim safety/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 422 })
      }
      if (/mailbox/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (/artifact/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
    }
    return safeErrorResponse(error, 500, 'Failed to send email.', 'leads/[id]/email/send')
  }
}
