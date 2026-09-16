import { NextResponse } from 'next/server'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Periodic Relay Run reconciliation cron.
 *
 * Processes bounded candidates:
 * - Active runs stuck in waiting/awaiting_human for too long
 * - Runs where canonical domain state has drifted from orchestration state
 *
 * Requirements:
 * - Idempotent (safe to run multiple times)
 * - Bounded query (LIMIT, indexed columns)
 * - One run failure doesn't stop all reconciliation
 * - No sensitive data logged
 */
export async function GET(request: Request) {
  // Authorization
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  const supabase = createServiceSupabase()
  const startedAt = Date.now()
  const diagnostics: string[] = []
  let reconciled = 0
  let failed = 0
  let skipped = 0

  try {
    // Fetch active, non-terminal runs that are in waiting-like states
    // These are the states most likely to drift
    const { data: runs, error: runsError } = await supabase
      .from('relay_runs')
      .select('id, organization_id, status, current_step, primary_entity_id, primary_entity_type, assigned_rep_id')
      .in('status', ['waiting', 'awaiting_human', 'followup_due', 'response_received', 'conversation'])
      .order('updated_at', { ascending: true })
      .limit(50)

    if (runsError) {
      diagnostics.push(`Failed to fetch runs: ${runsError.message}`)
      return NextResponse.json({ ok: false, diagnostics }, { status: 500 })
    }

    if (!runs || runs.length === 0) {
      diagnostics.push('No active runs to reconcile.')
      return NextResponse.json({ ok: true, reconciled: 0, diagnostics }, { status: 200 })
    }

    diagnostics.push(`Found ${runs.length} active runs to check.`)

    for (const run of runs) {
      try {
        // Fetch the canonical lead state
        const { data: lead } = await supabase
          .from('leads')
          .select('id, status, sender_profile_id')
          .eq('id', run.primary_entity_id)
          .maybeSingle()

        // Fetch conversation state
        const { data: convState } = await supabase
          .from('conversation_states')
          .select('stage, last_reply_at')
          .eq('lead_id', run.primary_entity_id)
          .maybeSingle()

        // Reconciliation logic
        const drift = detectDrift(run.status, lead?.status ?? null, convState?.stage ?? null, convState?.last_reply_at ?? null)

        if (!drift) {
          skipped++
          continue
        }

        diagnostics.push(`Run ${run.id}: drift detected (${run.status} -> ${drift})`)

        // Apply repair
        const { error: updateError } = await supabase
          .from('relay_runs')
          .update({
            status: drift,
            current_step: drift,
            updated_at: new Date().toISOString(),
          })
          .eq('id', run.id)

        if (updateError) {
          diagnostics.push(`Run ${run.id}: repair failed - ${updateError.message}`)
          failed++
          continue
        }

        // Emit reconciliation event
        await supabase.from('relay_events').insert({
          organization_id: run.organization_id,
          event_type: 'RECONCILIATION_APPLIED',
          entity_type: 'relay_run',
          entity_id: run.id,
          actor_type: 'system',
          source: 'cron_reconciliation',
          source_event_id: `reconcile:${run.id}:${Date.now()}`,
          payload: {
            previous_status: run.status,
            corrected_status: drift,
            trigger: 'periodic_cron',
          },
        })

        reconciled++
      } catch (err) {
        diagnostics.push(`Run ${run.id}: unexpected error - ${err instanceof Error ? err.message : 'unknown'}`)
        failed++
        // Continue processing other runs — one failure doesn't stop all
      }
    }

    const duration = Date.now() - startedAt
    diagnostics.push(`Completed in ${duration}ms. Reconciled: ${reconciled}, Skipped: ${skipped}, Failed: ${failed}`)

    return NextResponse.json({
      ok: true,
      duration_ms: duration,
      total_checked: runs.length,
      reconciled,
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

/**
 * Detects drift between run status and canonical domain state.
 * Returns the corrected status if drift is detected, null otherwise.
 */
function detectDrift(
  runStatus: string,
  leadStatus: string | null,
  convStage: string | null,
  lastReplyAt: string | null,
): string | null {
  // Case 1: Run says WAITING but lead has been replied to
  if (runStatus === 'waiting' && leadStatus === 'replied') {
    return 'response_received'
  }

  // Case 2: Run says WAITING but conversation has reply
  if (runStatus === 'waiting' && lastReplyAt) {
    return 'response_received'
  }

  // Case 3: Run says WAITING but conversation is in advanced stage
  if (runStatus === 'waiting' && convStage && ['qualifying', 'interested', 'meeting', 'proposal', 'won', 'lost'].includes(convStage)) {
    return 'conversation'
  }

  // Case 4: Run says PREPARING/ROUTING/AWAITING_HUMAN but lead already contacted
  if (['preparing', 'routing', 'awaiting_human'].includes(runStatus) && leadStatus && leadStatus !== 'new') {
    return 'action_recorded'
  }

  return null
}
