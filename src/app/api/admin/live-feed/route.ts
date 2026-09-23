import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { assembleWhoSentWhat, displayRepName } from '@/lib/relay/live-feed'

const STREAM_EVENT_LABEL: Record<string, string> = {
  LEAD_CREATED: 'extracted a prospect',
  LEAD_QUALIFIED: 'qualified a lead',
  OUTREACH_PREPARED: 'prepared outreach',
  OUTREACH_RECORDED: 'sent outreach',
  FOLLOWUP_DUE: 'follow-up became due',
  FOLLOWUP_PREPARED: 'prepared a follow-up',
  FOLLOWUP_RECORDED: 'sent a follow-up',
  CLIENT_REPLIED: 'got a reply',
  PROOF_MATCHED: 'matched proof',
  REPLY_PREPARED: 'prepared a reply',
  CONVERSATION_ADVANCED: 'advanced a conversation',
  OUTCOME_RECORDED: 'recorded an outcome',
  EXTRACTION_STARTED: 'started extraction',
  EXTRACTION_COMPLETED: 'finished extraction',
  PROSPECT_CAPTURED: 'captured a prospect',
  PROSPECT_ANALYZED: 'analyzed a prospect',
  ARTIFACT_GENERATED: 'generated an artifact',
}

function streamLabel(eventType: string): string {
  return STREAM_EVENT_LABEL[eventType] ?? eventType.toLowerCase().replace(/_/g, ' ')
}

export async function GET() {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'VIEW_TEAM_ANALYTICS')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [
    { data: events },
    { data: todaysMessages },
    { data: todaysLeads },
    { data: accountability },
  ] = await Promise.all([
    supabase
      .from('relay_events')
      .select('id, event_type, entity_type, entity_id, actor_id, actor_type, revenue_identity_id, payload, occurred_at')
      .eq('organization_id', authCtx.orgId)
      .gte('occurred_at', startOfDay)
      .order('occurred_at', { ascending: false })
      .limit(100),
    supabase
      .from('messages')
      .select('rep_id, type, sent_at, direction')
      .eq('organization_id', authCtx.orgId)
      .not('sent_at', 'is', null)
      .gte('sent_at', startOfDay)
      .lt('sent_at', endOfDay),
    supabase.from('leads').select('status').eq('organization_id', authCtx.orgId),
    supabase
      .from('daily_accountability')
      .select('rep_id, activity_type, completed_count')
      .eq('organization_id', authCtx.orgId)
      .eq('target_date', now.toISOString().slice(0, 10)),
  ])

  const { data: reps } = await supabase
    .from('reps')
    .select('id, name, auth_user_id')
    .eq('organization_id', authCtx.orgId)
  const repNameById = new Map<string, string>()
  for (const r of reps ?? []) {
    if (r.name) repNameById.set(r.id as string, r.name as string)
    if (r.auth_user_id && r.name) repNameById.set(r.auth_user_id as string, r.name as string)
  }

  const stream = (events ?? []).map((e) => ({
    id: e.id as string,
    eventType: e.event_type as string,
    label: streamLabel(e.event_type as string),
    actorId: (e.actor_id as string) ?? null,
    actorName: e.actor_type === 'rep' ? (displayRepName(repNameById.get(e.actor_id as string)) ?? 'A rep') : 'Relay',
    occurredAt: e.occurred_at as string,
  }))

  // Hourly team activity for bar chart (0-23)
  const hourly = new Array(24).fill(0)
  for (const e of events ?? []) {
    const hr = new Date(e.occurred_at as string).getHours()
    hourly[hr] += 1
  }

  const perRep = assembleWhoSentWhat({
    reps: (reps ?? []).map((rep) => ({
      id: rep.id as string,
      name: (rep.name as string) ?? null,
      authUserId: (rep.auth_user_id as string) ?? null,
    })),
    messages: (todaysMessages ?? []).map((message) => ({
      repId: (message.rep_id as string) ?? null,
      type: (message.type as string) ?? null,
      direction: (message.direction as string) ?? null,
    })),
  })

  // Pipeline funnel from today's lead snapshot
  const funnel = { new: 0, contacted: 0, replied: 0, followed_up: 0, won: 0, lost: 0 }
  for (const l of todaysLeads ?? []) {
    const s = l.status as keyof typeof funnel
    if (s in funnel) funnel[s] += 1
  }

  // Team totals
  const totalOutreach = (todaysMessages ?? []).filter((m) => m.type !== 'reply' && m.direction !== 'inbound').length
  const totalReplies = (todaysMessages ?? []).filter((m) => m.type === 'reply').length
  const totalCompleted = (accountability ?? []).reduce((sum, a) => sum + (a.completed_count ?? 0), 0)

  return NextResponse.json({
    date: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    stream,
    hourly,
    perRep,
    funnel,
    totals: { outreach: totalOutreach, replies: totalReplies, completed: totalCompleted, events: stream.length },
  })
}
