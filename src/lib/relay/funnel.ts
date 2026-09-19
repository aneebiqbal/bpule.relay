/**
 * Revenue-loop measurement over the existing relay_events ledger.
 *
 * Does not invent a parallel analytics store. Maps existing event types
 * onto the commercial funnel and only reports stages that actually occurred.
 */

import type { RelayEvent, RelayEventType } from '@/lib/domain/types'

export type FunnelStage =
  | 'ANALYZED'
  | 'QUALIFIED_FOR_CONTACT'
  | 'CONTACTED'
  | 'ACCEPTED'
  | 'REPLIED'
  | 'QUALIFIED_CONVERSATION'
  | 'CALL'
  | 'PROPOSAL'
  | 'WON'
  | 'LOST'
  | 'REVENUE'

const EVENT_TO_STAGE: Partial<Record<RelayEventType, FunnelStage>> = {
  PROSPECT_ANALYZED: 'ANALYZED',
  PROSPECT_CAPTURED: 'ANALYZED',
  LEAD_QUALIFIED: 'QUALIFIED_FOR_CONTACT',
  OUTREACH_RECORDED: 'CONTACTED',
  FOLLOWUP_RECORDED: 'CONTACTED',
  CLIENT_REPLIED: 'REPLIED',
  INTENT_DETECTED: 'QUALIFIED_CONVERSATION',
  CONVERSATION_ADVANCED: 'QUALIFIED_CONVERSATION',
  OUTCOME_RECORDED: 'WON',
}

export function funnelStageFromEvent(event: Pick<RelayEvent, 'eventType' | 'payload'>): FunnelStage | null {
  if (event.eventType === 'CONVERSATION_ADVANCED') {
    const stage = String(event.payload?.stage ?? event.payload?.newStage ?? '')
    if (stage === 'meeting') return 'CALL'
    if (stage === 'proposal' || stage === 'negotiation') return 'PROPOSAL'
    if (stage === 'won') return 'WON'
    if (stage === 'lost') return 'LOST'
    if (stage === 'replied') return 'REPLIED'
    return 'QUALIFIED_CONVERSATION'
  }
  if (event.eventType === 'OUTCOME_RECORDED') {
    const outcome = String(event.payload?.outcome ?? event.payload?.status ?? '')
    if (outcome === 'lost') return 'LOST'
    if (typeof event.payload?.revenue === 'number' && event.payload.revenue > 0) return 'REVENUE'
    if (outcome === 'won') return 'WON'
    return 'WON'
  }
  if (event.eventType === 'CLIENT_REPLIED' && event.payload?.accepted === true) {
    return 'ACCEPTED'
  }
  return EVENT_TO_STAGE[event.eventType] ?? null
}

export interface FunnelSummary {
  analyzed: number
  qualifiedForContact: number
  contacted: number
  accepted: number
  replied: number
  qualifiedConversations: number
  calls: number
  proposals: number
  won: number
  lost: number
  revenue: number | null
  missing: string[]
}

export function summarizeFunnel(events: Array<Pick<RelayEvent, 'eventType' | 'payload' | 'entityId'>>): FunnelSummary {
  const byStage = new Map<FunnelStage, Set<string>>()
  let revenue: number | null = null
  let sawRevenue = false

  for (const event of events) {
    const stage = funnelStageFromEvent(event)
    if (!stage) continue
    const key = event.entityId ?? `${event.eventType}`
    if (event.eventType === 'CLIENT_REPLIED' && event.payload?.accepted === true) {
      if (!byStage.has('ACCEPTED')) byStage.set('ACCEPTED', new Set())
      byStage.get('ACCEPTED')!.add(key)
      if (!byStage.has('REPLIED')) byStage.set('REPLIED', new Set())
      byStage.get('REPLIED')!.add(key)
    }
    if (!byStage.has(stage)) byStage.set(stage, new Set())
    byStage.get(stage)!.add(key)
    if (stage === 'REVENUE' && typeof event.payload?.revenue === 'number') {
      sawRevenue = true
      revenue = (revenue ?? 0) + event.payload.revenue
    }
  }

  const missing: string[] = []
  if ((byStage.get('ANALYZED')?.size ?? 0) === 0) missing.push('No ANALYZED events yet')
  if ((byStage.get('CONTACTED')?.size ?? 0) === 0) missing.push('No CONTACTED events yet')
  if (!sawRevenue) missing.push('No REVENUE amounts recorded')

  return {
    analyzed: byStage.get('ANALYZED')?.size ?? 0,
    qualifiedForContact: byStage.get('QUALIFIED_FOR_CONTACT')?.size ?? 0,
    contacted: byStage.get('CONTACTED')?.size ?? 0,
    accepted: byStage.get('ACCEPTED')?.size ?? 0,
    replied: byStage.get('REPLIED')?.size ?? 0,
    qualifiedConversations: byStage.get('QUALIFIED_CONVERSATION')?.size ?? 0,
    calls: byStage.get('CALL')?.size ?? 0,
    proposals: byStage.get('PROPOSAL')?.size ?? 0,
    won: byStage.get('WON')?.size ?? 0,
    lost: byStage.get('LOST')?.size ?? 0,
    revenue,
    missing,
  }
}

export function qualifiedProspectRateCopy(summary: FunnelSummary): string {
  if (summary.qualifiedForContact === 0) {
    return 'Not enough qualified prospects yet to describe the loop.'
  }
  const per = 100
  const scale = per / summary.qualifiedForContact
  const replies = Math.round(summary.replied * scale)
  const conversations = Math.round(summary.qualifiedConversations * scale)
  const calls = Math.round(summary.calls * scale)
  const proposals = Math.round(summary.proposals * scale)
  const wins = Math.round(summary.won * scale)
  return `For every ${per} qualified prospects: ${replies} replies, ${conversations} qualified conversations, ${calls} calls, ${proposals} proposals, ${wins} wins.`
}
