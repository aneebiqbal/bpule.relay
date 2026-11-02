import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The lead's canonical message timeline for the drawer's Conversation tab.
 * Narrow columns only — no drafts, no model traces. Loaded on demand, so the
 * drawer itself stays light.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  try {
    const client = await createServerSupabase()
    const { data, error } = await client
      .from('messages')
      .select('id, type, direction, sent_text, thread_status, sent_at, created_at')
      .eq('lead_id', id)
      .eq('organization_id', authCtx.orgId)
      .not('sent_text', 'is', null)
      .order('sent_at', { ascending: true })
      .limit(200)

    if (error) {
      return NextResponse.json({ messages: [], available: false })
    }

    return NextResponse.json({ messages: data ?? [], available: true })
  } catch (err) {
    return safeErrorResponse(err, 500, 'Failed to load the conversation.', 'leads/[id]/messages')
  }
}
