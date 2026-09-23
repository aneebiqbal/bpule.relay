import { NextResponse } from 'next/server'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'
import { isArchiveEligible } from '@/lib/leads/followup'

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
    // Candidate leads: active, not already archived, not terminal (no/dead —
    // those are excluded from outreach entirely already, and 'new' leads
    // have never been contacted so can never meet the eligibility rule).
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, organization_id, status')
      .eq('archived', false)
      .in('status', ['contacted', 'followed_up'])
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

    // Bulk-fetch conversation states (for followupCount) — avoid N+1.
    const { data: convStates } = await supabase
      .from('conversation_states')
      .select('lead_id, followup_count')
      .in('lead_id', leadIds)
    const followupCountByLead = new Map<string, number>()
    for (const row of (convStates ?? []) as Array<{ lead_id: string; followup_count: number }>) {
      followupCountByLead.set(row.lead_id, row.followup_count)
    }

    // Bulk-fetch messages (outbound sends and any reply) — avoid N+1.
    const { data: msgRows, error: msgError } = await supabase
      .from('messages')
      .select('lead_id, sent_at, direction, type')
      .in('lead_id', leadIds)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true })

    if (msgError) {
      diagnostics.push(`Failed to fetch messages: ${msgError.message}`)
      return NextResponse.json({ ok: false, diagnostics }, { status: 500 })
    }

    const lastOutboundSendByLead = new Map<string, string>()
    const repliedSinceByLead = new Map<string, boolean>()
    for (const row of (msgRows ?? []) as Array<{ lead_id: string; sent_at: string; direction: string | null; type: string }>) {
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
        const eligible = isArchiveEligible({
          followupCount: followupCountByLead.get(leadId) ?? 0,
          lastSendAt: lastOutboundSendByLead.get(leadId) ?? null,
          hasRepliedSinceLastSend: (lead.status === 'replied') || (repliedSinceByLead.get(leadId) ?? false),
          now,
        })
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
