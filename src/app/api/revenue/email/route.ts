import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createScoutStore } from '@/lib/store'
import { mapPreparedEmailDraft, mapEmailMessage } from '@/lib/email/mappers'
import { safeErrorResponse } from '@/lib/errors'

type Row = Record<string, unknown>

export const dynamic = 'force-dynamic'

function bucketForDraft(status: string): 'TO_SEND' | 'DRAFTS' | 'FAILED' {
  if (status === 'READY') return 'TO_SEND'
  if (status === 'FAILED') return 'FAILED'
  return 'DRAFTS'
}

function bucketForMessage(status: string): 'WAITING' | 'REPLIES' | 'FAILED' {
  if (status === 'REPLIED') return 'REPLIES'
  if (status === 'FAILED' || status === 'BOUNCED' || status === 'SUPPRESSED') return 'FAILED'
  return 'WAITING'
}

export async function GET() {
  try {
    const store = await createScoutStore()
    const client = await createServerSupabase()
    const repId = store.getCurrentRepId()

    const { data: assignmentRows, error: assignmentError } = await client
      .from('identity_assignments')
      .select('revenue_identity_id')
      .eq('organization_id', store.organizationId)
      .eq('rep_id', repId)
    if (assignmentError) throw assignmentError

    const identityIds = (assignmentRows ?? []).map((r) => r.revenue_identity_id as string)
    if (identityIds.length === 0) {
      return NextResponse.json({
        tabs: { TO_SEND: [], DRAFTS: [], WAITING: [], REPLIES: [], FAILED: [] },
        summary: { TO_SEND: 0, DRAFTS: 0, WAITING: 0, REPLIES: 0, FAILED: 0 },
      })
    }

    const [draftsResult, messagesResult, leadsResult, identitiesResult] = await Promise.all([
      client
        .from('prepared_email_drafts')
        .select('*')
        .eq('organization_id', store.organizationId)
        .in('revenue_identity_id', identityIds)
        .order('updated_at', { ascending: false })
        .limit(300),
      client
        .from('email_messages')
        .select('*')
        .eq('organization_id', store.organizationId)
        .in('revenue_identity_id', identityIds)
        .order('updated_at', { ascending: false })
        .limit(300),
      client
        .from('leads')
        .select('id, company, contact_name')
        .eq('organization_id', store.organizationId)
        .limit(1000),
      client
        .from('revenue_identities')
        .select('id, identity_name')
        .eq('organization_id', store.organizationId)
        .in('id', identityIds),
    ])

    if (draftsResult.error) throw draftsResult.error
    if (messagesResult.error) throw messagesResult.error
    if (leadsResult.error) throw leadsResult.error
    if (identitiesResult.error) throw identitiesResult.error

    const leadMap = new Map((leadsResult.data ?? []).map((r) => [r.id as string, { company: r.company as string, contactName: (r.contact_name as string) ?? null }]))
    const identityMap = new Map((identitiesResult.data ?? []).map((r) => [r.id as string, r.identity_name as string]))

    const tabs: Record<'TO_SEND' | 'DRAFTS' | 'WAITING' | 'REPLIES' | 'FAILED', Array<Record<string, unknown>>> = {
      TO_SEND: [],
      DRAFTS: [],
      WAITING: [],
      REPLIES: [],
      FAILED: [],
    }

    for (const row of (draftsResult.data ?? []) as Row[]) {
      const draft = mapPreparedEmailDraft(row)
      const lead = leadMap.get(draft.leadId)
      const identityName = identityMap.get(draft.revenueIdentityId) ?? 'Unknown identity'
      tabs[bucketForDraft(draft.draftStatus)].push({
        kind: 'draft',
        id: draft.id,
        leadId: draft.leadId,
        company: lead?.company ?? 'Unknown company',
        contactName: lead?.contactName,
        identityName,
        status: draft.draftStatus,
        subject: draft.subject,
        updatedAt: draft.updatedAt,
        blockedReason: draft.blockedReason,
      })
    }

    for (const row of (messagesResult.data ?? []) as Row[]) {
      const message = mapEmailMessage(row)
      const lead = leadMap.get(message.leadId)
      const identityName = identityMap.get(message.revenueIdentityId) ?? 'Unknown identity'
      tabs[bucketForMessage(message.deliveryStatus)].push({
        kind: 'message',
        id: message.id,
        leadId: message.leadId,
        company: lead?.company ?? 'Unknown company',
        contactName: lead?.contactName,
        identityName,
        status: message.deliveryStatus,
        subject: message.subject,
        updatedAt: message.updatedAt,
      })
    }

    return NextResponse.json({
      tabs,
      summary: {
        TO_SEND: tabs.TO_SEND.length,
        DRAFTS: tabs.DRAFTS.length,
        WAITING: tabs.WAITING.length,
        REPLIES: tabs.REPLIES.length,
        FAILED: tabs.FAILED.length,
      },
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load revenue email workspace.', 'revenue/email')
  }
}
