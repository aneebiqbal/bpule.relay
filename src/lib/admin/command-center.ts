/**
 * Admin Command Center — daily rep activity, drill-down, conversions.
 *
 * Answers: "What did each rep do yesterday? What's converting? What's stuck?"
 */

import type { SupabaseClient } from '@supabase/supabase-js'

function getClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createServiceSupabase } = require('@/lib/supabase/service')
  return createServiceSupabase()
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface CommandCenterView {
  date: string
  summary: DailySummary
  reps: RepActivity[]
  stale: StaleLead[]
  conversions: ConversionEvent[]
}

export interface DailySummary {
  totalActions: number
  connectionsSent: number
  dmsSent: number
  followupsSent: number
  repliesSent: number
  repliesReceived: number
  leadsExtracted: number
  upworkActions: number
  referrals: number
  wins: number
  activeReps: number
}

export interface RepActivity {
  repId: string
  repName: string
  totalActions: number
  connectionsSent: number
  dmsSent: number
  followupsSent: number
  repliesSent: number
  repliesReceived: number
  leadsExtracted: number
  upworkActions: number
  referrals: number
  wins: number
  lastActivityAt: string | null
}

export interface StaleLead {
  leadId: string
  company: string
  contactName: string | null
  status: string
  daysStale: number
  repName: string | null
}

export interface ConversionEvent {
  leadId: string
  company: string
  type: 'won' | 'interested' | 'meeting'
  occurredAt: string
  repName: string | null
  senderProfileName: string | null
}

// ── Main Query ─────────────────────────────────────────────────────────────

export async function getCommandCenter(orgId: string, date: string): Promise<CommandCenterView> {
  const client = getClient()
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`

  // ── Action Ledger events for the day ──
  const { data: events } = await client
    .from('action_events')
    .select(`
      id,
      action_type,
      actor_id,
      actor_type,
      lead_id,
      job_id,
      sender_profile_id,
      occurred_at,
      reps:actor_id (id, name),
      leads:lead_id (id, company, contact_name, status),
      sender_profiles:sender_profile_id (identity_name)
    `)
    .eq('organization_id', orgId)
    .gte('occurred_at', startOfDay)
    .lt('occurred_at', endOfDay)
    .order('occurred_at', { ascending: false })
    .limit(500)

  // ── Stale leads (no reply after 14+ days) ──
  const { data: staleLeads } = await client
    .from('leads')
    .select(`
      id,
      company,
      contact_name,
      status,
      created_at,
      owner_rep_id,
      reps:owner_rep_id (id, name)
    `)
    .eq('organization_id', orgId)
    .eq('archived', false)
    .in('status', ['contacted', 'followed_up'])
    .limit(50)

  // ── Build rep activity map ──
  const repMap = new Map<string, RepActivity>()
  const summary: DailySummary = {
    totalActions: 0,
    connectionsSent: 0,
    dmsSent: 0,
    followupsSent: 0,
    repliesSent: 0,
    repliesReceived: 0,
    leadsExtracted: 0,
    upworkActions: 0,
    referrals: 0,
    wins: 0,
    activeReps: 0,
  }

  for (const event of events || []) {
    if (event.actor_type !== 'rep' || !event.actor_id) continue

    const repId = event.actor_id as string
    if (!repMap.has(repId)) {
      const repName = (event.reps as unknown as { name: string } | null)?.name || 'Unknown'
      repMap.set(repId, {
        repId,
        repName,
        totalActions: 0,
        connectionsSent: 0,
        dmsSent: 0,
        followupsSent: 0,
        repliesSent: 0,
        repliesReceived: 0,
        leadsExtracted: 0,
        upworkActions: 0,
        referrals: 0,
        wins: 0,
        lastActivityAt: null,
      })
    }

    const rep = repMap.get(repId)!
    rep.totalActions++
    rep.lastActivityAt = event.occurred_at as string
    summary.totalActions++

    switch (event.action_type) {
      case 'CONNECTION_SENT':
        rep.connectionsSent++
        summary.connectionsSent++
        break
      case 'DM_SENT':
        rep.dmsSent++
        summary.dmsSent++
        break
      case 'FOLLOWUP_SENT':
        rep.followupsSent++
        summary.followupsSent++
        break
      case 'REPLY_SENT':
        rep.repliesSent++
        summary.repliesSent++
        break
      case 'REPLY_RECEIVED':
        rep.repliesReceived++
        summary.repliesReceived++
        break
      case 'LEAD_EXTRACTED':
      case 'UPWORK_JOB_EXTRACTED':
        rep.leadsExtracted++
        summary.leadsExtracted++
        break
      case 'UPWORK_APPLIED':
      case 'UPWORK_PROPOSAL_PREPARED':
        rep.upworkActions++
        summary.upworkActions++
        break
      case 'LEAD_REFERRED':
        rep.referrals++
        summary.referrals++
        break
      case 'CLIENT_WON':
      case 'OPPORTUNITY_CREATED':
        rep.wins++
        summary.wins++
        break
    }
  }

  summary.activeReps = repMap.size

  // ── Build stale leads list ──
  const now = Date.now()
  const stale: StaleLead[] = (staleLeads || [])
    .map((lead: Record<string, unknown>) => {
      const daysStale = Math.floor((now - new Date(lead.created_at as string).getTime()) / (1000 * 60 * 60 * 24))
      const reps = lead.reps as { name: string } | null
      return {
        leadId: lead.id as string,
        company: lead.company as string,
        contactName: (lead.contact_name as string) || null,
        status: lead.status as string,
        daysStale,
        repName: reps?.name || null,
      }
    })
    .filter((l: StaleLead) => l.daysStale >= 14)
    .sort((a: StaleLead, b: StaleLead) => b.daysStale - a.daysStale)
    .slice(0, 20)

  // ── Build conversions list ──
  const conversions: ConversionEvent[] = (events || [])
    .filter((e: Record<string, unknown>) => ['CLIENT_WON', 'OPPORTUNITY_CREATED'].includes(e.action_type as string))
    .map((e: Record<string, unknown>) => ({
      leadId: e.lead_id as string,
      company: (e.leads as unknown as { company: string } | null)?.company || 'Unknown',
      type: e.action_type === 'CLIENT_WON' ? 'won' as const : 'interested' as const,
      occurredAt: e.occurred_at as string,
      repName: (e.reps as unknown as { name: string } | null)?.name || null,
      senderProfileName: (e.sender_profiles as unknown as { identity_name: string } | null)?.identity_name || null,
    }))
    .slice(0, 20)

  return {
    date,
    summary,
    reps: [...repMap.values()].sort((a, b) => b.totalActions - a.totalActions),
    stale,
    conversions,
  }
}
