import { NextResponse } from 'next/server'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { ARCHIVE_POLICY, resolveArchiveReview } from '@/lib/leads/archive-policy'
import { emitAction } from '@/lib/action-ledger'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Bounded batch per run — safe to re-run (idempotent: only touches rows
// still archived = false and still eligible; a lead already archived, or
// one that gets a reply before the next run, is simply skipped next time).
const BATCH_SIZE = 500

/**
 * Daily lead archival sweep (approved product design).
 *
 * A lead becomes archive-eligible when BOTH hold:
 *   1. ConversationState.followupCount >= 3 (all 3 follow-ups used)
 *   2. At least 3 full calendar days since the last outbound send, with no
 *      reply received since.
 *
 * This is a soft-archive (archived = true, archived_at = now()) — never a
 * hard delete. Archived leads remain fully findable via the /archive search
 * page (archive_search has no opinion on the archived column). A reply
 * later auto-restores the lead (see markContacted / recordProspectReply in
 * supabase-store.ts).
 *
 * Follows the exact conventions of src/app/api/relay/reconcile/route.ts:
 * service-role client, requireCronSecret auth, bounded batch, one failure
 * doesn't stop the whole run, no sensitive data logged.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  const supabase = createServiceSupabase()
  const startedAt = Date.now()
  const diagnostics: string[] = []
  let archived = 0
  let failed = 0
  let skipped = 0

  try {
    // Candidate leads: active, not already archived, not terminal (no/dead).
    // sat untouched for 30+ days are archive-eligible).
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, organization_id, status, created_at, locked_reason, connection_accepted_at')
      .eq('archived', false)
      .in('status', ['contacted', 'followed_up', 'new'])
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (leadsError) {
      diagnostics.push(`Failed to fetch candidate leads: ${leadsError.message}`)
      return NextResponse.json({ ok: false, diagnostics }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      diagnostics.push('No candidate leads to check.')
      return NextResponse.json({ ok: true, archived: 0, diagnostics }, { status: 200 })
    }

    diagnostics.push(`Found ${leads.length} candidate leads to check.`)
    const leadIds = leads.map((l) => l.id as string)

    // Bulk-fetch conversation states (for followupCount) — avoid N+1 and the
    // URL limit that silently returns no rows for a large org.
    const convStates = await chunkedIn(leadIds, (chunk) => supabase
      .from('conversation_states')
      .select('lead_id, followup_count')
      .in('lead_id', chunk))
    const followupCountByLead = new Map<string, number>()
    for (const row of convStates as Array<{ lead_id: string; followup_count: number }>) {
      followupCountByLead.set(row.lead_id, row.followup_count)
    }

    // Bulk-fetch messages (outbound sends and any reply) — avoid N+1.
    let msgRows: Array<{ lead_id: string; sent_at: string; direction: string | null; type: string }>
    try {
      msgRows = await chunkedIn(leadIds, (chunk) => supabase
        .from('messages')
        .select('lead_id, sent_at, direction, type')
        .in('lead_id', chunk)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: true })) as Array<{ lead_id: string; sent_at: string; direction: string | null; type: string }>
    } catch (err) {
      diagnostics.push(`Failed to fetch messages: ${err instanceof Error ? err.message : String(err)}`)
      return NextResponse.json({ ok: false, diagnostics }, { status: 500 })
    }

    const lastOutboundSendByLead = new Map<string, string>()
    const repliedSinceByLead = new Map<string, boolean>()
    for (const row of msgRows) {
      const isReply = row.type === 'reply' || row.direction === 'inbound'
      if (isReply) {
        const lastSend = lastOutboundSendByLead.get(row.lead_id)
        if (!lastSend || row.sent_at > lastSend) {
          repliedSinceByLead.set(row.lead_id, true)
        }
        continue
      }
      const existing = lastOutboundSendByLead.get(row.lead_id)
      if (!existing || row.sent_at > existing) {
        lastOutboundSendByLead.set(row.lead_id, row.sent_at)
        // A later outbound send after a previously-seen reply means the
        // conversation moved on again — clear the stale reply flag so a new
        // round of follow-ups can still lead to archival later.
        repliedSinceByLead.set(row.lead_id, false)
      }
    }

    const now = new Date()
    const toArchive: string[] = []

    for (const lead of leads) {
      try {
        const leadId = lead.id as string
        // One policy resolver for the sweep, so it cannot drift from the state
        // machine's 14-day pending-connection review window.
        const decision = resolveArchiveReview({
          status: lead.status as string | null,
          createdAt: lead.created_at as string | null,
          connectionAcceptedAt: lead.connection_accepted_at as string | null,
          lockedReason: lead.locked_reason as string | null,
          lastOutboundAt: lastOutboundSendByLead.get(leadId) ?? null,
          followupCount: followupCountByLead.get(leadId) ?? 0,
          hasRepliedSinceLastSend: (lead.status === 'replied') || (repliedSinceByLead.get(leadId) ?? false),
          now,
        })
        const eligible = decision.due
        if (!eligible && decision.reason === 'pending_connection') {
          diagnostics.push(`Lead ${leadId}: pending connection review at ${decision.elapsedDays ?? 0}/${ARCHIVE_POLICY.pendingConnectionDays} days.`)
        }

        if (eligible) {
          toArchive.push(leadId)
        } else {
          skipped++
        }
      } catch (err) {
        diagnostics.push(`Lead ${lead.id}: unexpected error evaluating eligibility - ${err instanceof Error ? err.message : 'unknown'}`)
        failed++
      }
    }

    if (toArchive.length > 0) {
      const { data: updatedRows, error: updateError } = await supabase
        .from('leads')
        .update({ archived: true, archived_at: new Date().toISOString() })
        .in('id', toArchive)
        .eq('archived', false)
        .select('id')

      if (updateError) {
        diagnostics.push(`Failed to archive ${toArchive.length} leads: ${updateError.message}`)
        failed += toArchive.length
      } else {
        archived = updatedRows?.length ?? 0
        try {
          for (const lead of leads) {
            if (toArchive.includes(lead.id as string)) {
              await emitAction({
                orgId: lead.organization_id as string,
                actionType: 'LEAD_ARCHIVED',
                actorType: 'system',
                actorId: null,
                leadId: lead.id as string,
                metadata: { source: 'auto_archive', reason: 'stale_lead' },
              }).catch(() => {})
            }
          }
        } catch { }
      }
    }

    const duration = Date.now() - startedAt
    diagnostics.push(`Completed in ${duration}ms. Archived: ${archived}, Skipped: ${skipped}, Failed: ${failed}`)

    return NextResponse.json({
      ok: true,
      duration_ms: duration,
      total_checked: leads.length,
      archived,
      skipped,
      failed,
      diagnostics,
    })
  } catch (err) {
    const duration = Date.now() - startedAt
    diagnostics.push(`Fatal error after ${duration}ms: ${err instanceof Error ? err.message : 'unknown'}`)
    return NextResponse.json({ ok: false, diagnostics }, { status: 500 })
  }
}
