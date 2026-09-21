import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { calculateContactWindow, type TimingInput } from '@/lib/relay/timing-engine'

export const maxDuration = 30

export async function GET() {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'VIEW_TEAM_ANALYTICS')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const supabase = await createServerSupabase()

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', authCtx.orgId)
    .single()

  const orgTimezone = orgRow?.timezone ?? 'UTC'

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const [repsResult, eventsResult, capturedResult, leadsResult, targetsResult, accountabilityResult] = await Promise.all([
    supabase.from('reps').select('id, name, created_at, role').eq('organization_id', authCtx.orgId),
    supabase.from('relay_events').select('*').eq('organization_id', authCtx.orgId).order('occurred_at', { ascending: false }).limit(200),
    supabase.from('captured_prospects').select('*').eq('organization_id', authCtx.orgId).eq('status', 'captured').order('last_activity_at', { ascending: false }).limit(50),
    supabase.from('leads').select('id, company, contact_name, contact_title, status, score, verdict, canonical_score, direction, owner_rep_id, tags, signal_type, signal_evidence, created_at, revenue_identity_id').eq('organization_id', authCtx.orgId).order('created_at', { ascending: false }).limit(100),
    supabase.from('daily_targets').select('*').eq('organization_id', authCtx.orgId).eq('active', true),
    supabase.from('daily_accountability').select('*').eq('organization_id', authCtx.orgId).eq('target_date', today),
  ])

  const reps = repsResult.data ?? []
  const events = eventsResult.data ?? []
  const capturedProspects = capturedResult.data ?? []
  const leads = leadsResult.data ?? []
  const targets = targetsResult.data ?? []
  const accountability = accountabilityResult.data ?? []

  const repMap = new Map(reps.map((r) => [r.id, r]))

  const activityTimeline = events.slice(0, 50).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    entityType: e.entity_type,
    actorId: e.actor_id,
    actorName: e.actor_id ? repMap.get(e.actor_id)?.name ?? 'System' : 'System',
    timestamp: e.occurred_at,
    source: e.source,
    payload: e.payload,
  }))

  const capturedItems = capturedProspects.map((cp) => ({
    id: cp.id,
    company: cp.extracted_company,
    contactName: cp.extracted_name,
    location: cp.extracted_location,
    score: cp.canonical_score,
    status: cp.status,
    lastActivityAt: cp.last_activity_at,
    ownerName: repMap.get(cp.owner_rep_id)?.name ?? 'Unknown',
  }))

  const timingStatuses = leads.map((lead) => {
    const hasReply = lead.status === 'replied'
    const hasFollowupDue = lead.status === 'followed_up'
    const isContacted = lead.status === 'contacted' || hasReply || hasFollowupDue

    const timing: TimingInput = {
      channel: (lead.direction === 'inbound' ? 'dm' : 'dm') as 'dm',
      prospectTimezone: null,
      repTimezone: orgTimezone,
      lastMeaningfulActionAt: lead.created_at,
      conversationStage: lead.status === 'new' ? 'new' : isContacted ? 'contacted' : 'new',
      connectionAccepted: false,
      replyReceived: hasReply,
      followupCount: hasFollowupDue ? 1 : 0,
      workingDay: true,
      workingHoursStart: 9,
      workingHoursEnd: 17,
      lastReplyAt: hasReply ? lead.created_at : null,
      lastFollowupAt: hasFollowupDue ? lead.created_at : null,
    }

    const result = calculateContactWindow(timing)
    return {
      leadId: lead.id,
      company: lead.company,
      contactName: lead.contact_name,
      status: lead.status,
      score: lead.canonical_score ?? lead.score,
      verdict: lead.verdict,
      timingStatus: result.status,
      timingReason: result.reason,
      nextActionType: result.nextActionType,
    }
  })

  const attentionItems: Array<{
    type: string
    severity: 'critical' | 'warning' | 'info'
    message: string
    entityId: string
    entityType: string
    timestamp: string
  }> = []

  const twoHoursAgo = new Date(now.getTime() - 2 * 3600000)
  const fourHoursAgo = new Date(now.getTime() - 4 * 3600000)

  for (const lead of leads) {
    if (lead.status === 'new' && (lead.canonical_score ?? lead.score ?? 0) >= 70) {
      attentionItems.push({
        type: 'high_value_not_contacted',
        severity: 'critical',
        message: `${lead.company} scored ${lead.canonical_score ?? lead.score} but has not been contacted`,
        entityId: lead.id,
        entityType: 'lead',
        timestamp: lead.created_at,
      })
    }

    if (lead.status === 'replied' && new Date(lead.created_at) < twoHoursAgo) {
      attentionItems.push({
        type: 'reply_waiting',
        severity: 'critical',
        message: `Reply waiting for ${lead.company} — over 2 hours`,
        entityId: lead.id,
        entityType: 'lead',
        timestamp: lead.created_at,
      })
    }

    if (lead.status === 'contacted') {
      const created = new Date(lead.created_at)
      const daysSinceContact = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceContact >= 1 && !lead.signal_evidence) {
        attentionItems.push({
          type: 'followup_overdue',
          severity: 'warning',
          message: `${lead.company} contacted ${Math.floor(daysSinceContact)} days ago — follow-up overdue`,
          entityId: lead.id,
          entityType: 'lead',
          timestamp: lead.created_at,
        })
      }
    }
  }

  for (const cp of capturedProspects) {
    const lastActivity = new Date(cp.last_activity_at)
    const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)
    if (hoursSinceActivity > 24 && cp.status === 'captured') {
      attentionItems.push({
        type: 'captured_prospect_stalled',
        severity: 'warning',
        message: `Captured prospect ${cp.extracted_company ?? 'Unknown'} has had no activity for ${Math.floor(hoursSinceActivity)}h`,
        entityId: cp.id,
        entityType: 'captured_prospect',
        timestamp: cp.last_activity_at,
      })
    }
  }

  attentionItems.sort((a, b) => {
    const severityRank = { critical: 3, warning: 2, info: 1 }
    return (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0)
  })

  const totalTargetsToday = targets.reduce((sum, t) => sum + t.target_count, 0)
  const totalCompletedToday = accountability.reduce((sum, a) => sum + a.completed_count, 0)

  return NextResponse.json({
    date: today,
    orgTimezone,
    activeReps: reps.length,
    totalLeadsToday: leads.length,
    totalCapturedProspects: capturedItems.length,
    totalTargetsToday,
    totalCompletedToday,
    activityTimeline,
    capturedProspects: capturedItems,
    leadTiming: timingStatuses,
    attentionItems: attentionItems.slice(0, 20),
    summary: {
      repliesWaiting: attentionItems.filter((a) => a.type === 'reply_waiting').length,
      followupsOverdue: attentionItems.filter((a) => a.type === 'followup_overdue').length,
      highValueNotContacted: attentionItems.filter((a) => a.type === 'high_value_not_contacted').length,
      capturedProspectsStalled: attentionItems.filter((a) => a.type === 'captured_prospect_stalled').length,
    },
  })
}
