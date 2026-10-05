/**
 * Action Ledger Service — append-only commercial execution history.
 *
 * Single source of truth for "what did the team actually do?"
 * Every meaningful action emits an immutable ActionEvent.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
type ActionEventType =
  | 'LEAD_EXTRACTED'
  | 'CONNECTION_PREPARED'
  | 'CONNECTION_SENT'
  | 'DM_PREPARED'
  | 'DM_SENT'
  | 'FOLLOWUP_SENT'
  | 'REPLY_SENT'
  | 'REPLY_RECEIVED'
  | 'LEAD_REFERRED'
  | 'PROFILE_RECOMMENDED'
  | 'UPWORK_JOB_EXTRACTED'
  | 'UPWORK_PROPOSAL_PREPARED'
  | 'UPWORK_APPLIED'
  | 'OPPORTUNITY_CREATED'
  | 'CLIENT_WON'
  | 'LEAD_ARCHIVED'

interface EmitActionParams {
  orgId: string
  actionType: ActionEventType
  actorType?: 'rep' | 'admin' | 'system' | 'integration'
  actorId?: string | null
  senderProfileId?: string | null
  leadId?: string | null
  jobId?: string | null
  executionStatus?: 'generated' | 'sent' | 'delivered' | 'failed'
  channel?: 'linkedin' | 'email' | 'dm' | 'upwork'
  referredToRepId?: string | null
  referredToProfileId?: string | null
  referralReason?: string | null
  messageId?: string | null
  metadata?: Record<string, unknown>
}

interface DailySummary {
  date: string
  repId: string | null
  repName: string | null
  connectionsSent: number
  dmsSent: number
  followupsSent: number
  repliesSent: number
  repliesReceived: number
  leadsExtracted: number
  upworkProposals: number
  opportunities: number
  referrals: number
  totalActions: number
}

interface ActionLogEntry {
  id: string
  actionType: string
  executionStatus: string
  channel: string | null
  occurredAt: string
  actorName: string | null
  senderProfileName: string | null
  leadCompany: string | null
  leadName: string | null
  jobTitle: string | null
  metadata: Record<string, unknown>
}

let supabase: SupabaseClient | null = null

function getClient() {
  if (!supabase) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createServiceSupabase } = require('@/lib/supabase/service')
    supabase = createServiceSupabase()
  }
  return supabase!
}

/**
 * Emit an action event. Append-only — never updates or deletes.
 */
export async function emitAction(params: EmitActionParams): Promise<string | null> {
  const { data, error } = await getClient()
    .from('action_events')
    .insert({
      organization_id: params.orgId,
      action_type: params.actionType,
      actor_type: params.actorType || 'system',
      actor_id: params.actorId || null,
      sender_profile_id: params.senderProfileId || null,
      lead_id: params.leadId || null,
      job_id: params.jobId || null,
      execution_status: params.executionStatus || 'generated',
      channel: params.channel || null,
      referred_to_rep_id: params.referredToRepId || null,
      referred_to_profile_id: params.referredToProfileId || null,
      referral_reason: params.referralReason || null,
      message_id: params.messageId || null,
      metadata: params.metadata || {},
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Action Ledger] Failed to emit:', error.message)
    return null
  }
  return data?.id || null
}

/**
 * Get daily summary for admin operating view.
 */
export async function getDailySummary(orgId: string, date: string): Promise<DailySummary[]> {
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`

  const { data, error } = await getClient()
    .from('action_events')
    .select(`
      actor_id,
      action_type,
      reps:actor_id (id, name)
    `)
    .eq('organization_id', orgId)
    .gte('occurred_at', startOfDay)
    .lt('occurred_at', endOfDay)
    .order('occurred_at', { ascending: false })

  if (error || !data) return []

  // Aggregate by rep
  const byRep = new Map<string, DailySummary>()

  for (const event of data) {
    const repId = event.actor_id || 'system'
    const repName = (event.reps as unknown as { name: string } | null)?.name || 'System'

    if (!byRep.has(repId)) {
      byRep.set(repId, {
        date,
        repId: repId === 'system' ? null : repId,
        repName,
        connectionsSent: 0,
        dmsSent: 0,
        followupsSent: 0,
        repliesSent: 0,
        repliesReceived: 0,
        leadsExtracted: 0,
        upworkProposals: 0,
        opportunities: 0,
        referrals: 0,
        totalActions: 0,
      })
    }

    const summary = byRep.get(repId)!
    summary.totalActions++

    switch (event.action_type) {
      case 'CONNECTION_SENT':
        summary.connectionsSent++
        break
      case 'DM_SENT':
        summary.dmsSent++
        break
      case 'FOLLOWUP_SENT':
        summary.followupsSent++
        break
      case 'REPLY_SENT':
        summary.repliesSent++
        break
      case 'REPLY_RECEIVED':
        summary.repliesReceived++
        break
      case 'LEAD_EXTRACTED':
        summary.leadsExtracted++
        break
      case 'UPWORK_APPLIED':
      case 'UPWORK_PROPOSAL_PREPARED':
        summary.upworkProposals++
        break
      case 'UPWORK_JOB_EXTRACTED':
        summary.leadsExtracted++
        break
      case 'OPPORTUNITY_CREATED':
      case 'CLIENT_WON':
        summary.opportunities++
        break
      case 'LEAD_REFERRED':
        summary.referrals++
        break
      case 'LEAD_ARCHIVED':
        break
    }
  }

  return [...byRep.values()].sort((a, b) => b.totalActions - a.totalActions)
}

/**
 * Get action log for a specific rep on a specific day.
 */
export async function getRepDailyLog(
  orgId: string,
  repId: string,
  date: string,
  limit: number = 100,
): Promise<ActionLogEntry[]> {
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`

  const { data, error } = await getClient()
    .from('action_events')
    .select(`
      id,
      action_type,
      execution_status,
      channel,
      occurred_at,
      metadata,
      reps:actor_id (id, name),
      sender_profiles:sender_profile_id (identity_name),
      leads:lead_id (company, contact_name),
      upwork_jobs:job_id (title)
    `)
    .eq('organization_id', orgId)
    .eq('actor_id', repId)
    .gte('occurred_at', startOfDay)
    .lt('occurred_at', endOfDay)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map(event => ({
    id: event.id,
    actionType: event.action_type,
    executionStatus: event.execution_status,
    channel: event.channel,
    occurredAt: event.occurred_at,
    actorName: (event.reps as unknown as { name: string } | null)?.name || null,
    senderProfileName: (event.sender_profiles as unknown as { identity_name: string } | null)?.identity_name || null,
    leadCompany: (event.leads as unknown as { company: string } | null)?.company || null,
    leadName: (event.leads as unknown as { contact_name: string } | null)?.contact_name || null,
    jobTitle: (event.upwork_jobs as unknown as { title: string } | null)?.title || null,
    metadata: (event.metadata as Record<string, unknown>) || {},
  }))
}

/**
 * Get today's action counts for dashboard header.
 */
export async function getTodayCounts(orgId: string): Promise<Record<string, number>> {
  const today = new Date().toISOString().split('T')[0]
  const summary = await getDailySummary(orgId, today)

  const totals: Record<string, number> = {
    connectionsSent: 0,
    dmsSent: 0,
    followupsSent: 0,
    repliesSent: 0,
    repliesReceived: 0,
    leadsExtracted: 0,
    upworkProposals: 0,
    opportunities: 0,
  }

  for (const rep of summary) {
    totals.connectionsSent += rep.connectionsSent
    totals.dmsSent += rep.dmsSent
    totals.followupsSent += rep.followupsSent
    totals.repliesSent += rep.repliesSent
    totals.repliesReceived += rep.repliesReceived
    totals.leadsExtracted += rep.leadsExtracted
    totals.upworkProposals += rep.upworkProposals
    totals.opportunities += rep.opportunities
  }

  return totals
}

/**
 * Get pending actions for a rep (leads assigned but no outbound sent today).
 */
export async function getPendingForRep(orgId: string, repId: string): Promise<number> {
  const { count, error } = await getClient()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('owner_rep_id', repId)
    .in('status', ['new', 'contacted', 'followed_up'])

  if (error) return 0
  return count || 0
}
