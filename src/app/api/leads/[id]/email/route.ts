import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { listLeadContactPoints } from '@/lib/email/service'
import { mapEmailMessage, mapPreparedEmailDraft } from '@/lib/email/mappers'
import { safeErrorResponse } from '@/lib/errors'

type Row = Record<string, unknown>

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const store = await createScoutStore()
    const lead = await store.getLead(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    const client = await createServerSupabase()

    const [contacts, draftsResult, messagesResult] = await Promise.all([
      listLeadContactPoints(client, store.organizationId, id),
      client
        .from('prepared_email_drafts')
        .select('*')
        .eq('organization_id', store.organizationId)
        .eq('lead_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      client
        .from('email_messages')
        .select('*')
        .eq('organization_id', store.organizationId)
        .eq('lead_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (draftsResult.error) throw draftsResult.error
    if (messagesResult.error) throw messagesResult.error

    return NextResponse.json({
      lead,
      contacts,
      drafts: (draftsResult.data ?? []).map((r) => mapPreparedEmailDraft(r as Row)),
      messages: (messagesResult.data ?? []).map((r) => mapEmailMessage(r as Row)),
    })
  } catch (error) {
    if (error instanceof Error && /not the owner/i.test(error.message)) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }
    return safeErrorResponse(error, 500, 'Failed to load lead email workspace.', 'leads/[id]/email')
  }
}
