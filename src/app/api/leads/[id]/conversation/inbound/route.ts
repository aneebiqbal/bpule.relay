import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { safeErrorResponse } from '@/lib/errors'
import { loadConversation } from '@/lib/conversation/service'
import { captureClientReply, findLatestSampleForLead } from '@/lib/dataset/service'
import { createServiceSupabase } from '@/lib/supabase/service'
import { getAuthContext } from '@/lib/auth/organization'
import { validateThreadIdentity } from '@/lib/conversation/thread-integrity'

export const maxDuration = 60

/**
 * Add the client's message to the thread (pasted from LinkedIn), optionally
 * with when they actually sent it, then return the refreshed conversation —
 * memory analyzes the new message as part of the reload.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: { text?: string; receivedAt?: string | null; senderUrl?: string; senderEmail?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 8000) : ''
  if (!text) return NextResponse.json({ error: 'Paste the client\'s message.' }, { status: 400 })
  const receivedAt = typeof body.receivedAt === 'string' && body.receivedAt ? body.receivedAt : null
  if (receivedAt && Number.isNaN(new Date(receivedAt).getTime())) {
    return NextResponse.json({ error: 'Invalid time for the client\'s message.' }, { status: 400 })
  }
  const senderUrl = typeof body.senderUrl === 'string' ? body.senderUrl.trim() : ''
  const senderEmail = typeof body.senderEmail === 'string' ? body.senderEmail.trim().toLowerCase() : ''

  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  try {
    // Thread integrity: an inbound message must belong to this lead. If the
    // caller supplies a sender identity, a mismatch refuses to attach silently.
    if (senderUrl || senderEmail) {
      const lead = await store.getLead(id)
      const check = validateThreadIdentity({ senderUrl, senderEmail, leadUrl: lead?.url })
      if (!check.ok) {
        return NextResponse.json({ error: check.code, reason: check.reason }, { status: 409 })
      }
      // Identity verified against the lead.
      await store.recordProspectReply(id, text, { receivedAt, threadStatus: 'VERIFIED' })
    } else {
      // No identity supplied: mark the thread UNVERIFIED so it is never
      // treated as strongly linked.
      await store.recordProspectReply(id, text, { receivedAt, threadStatus: 'UNVERIFIED' })
    }

    // Dataset: capture CLIENT_REPLY event (uses service role for system capture).
    const datasetClient = createServiceSupabase()
    const auth = await getAuthContext()
    const sampleId = auth ? await findLatestSampleForLead(datasetClient, auth.orgId, id) : null
    if (sampleId) void captureClientReply(datasetClient, sampleId, text).catch(() => {})

    const loaded = await loadConversation(store, id)
    if (!loaded) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    return NextResponse.json(loaded.view)
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not add the client\'s message.', 'leads/conversation/inbound')
  }
}
