import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'

export const maxDuration = 30

function dateRange(range: string): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString()
  let start: string
  switch (range) {
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 3600000).toISOString()
      break
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 3600000).toISOString()
      break
    default:
      start = new Date(now.getTime() - 30 * 24 * 3600000).toISOString()
  }
  return { start, end }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const org = user.organization
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') ?? '30d'
  const { start, end } = dateRange(range)
  const startStr = start.slice(0, 10)
  const endStr = end.slice(0, 10)

  const [
    eventsResult,
    leadsResult,
    messagesResult,
    conversationsResult,
    aiTracesResult,
    targetsResult,
    accountabilityResult,
    identitiesResult,
    extractionRunsResult,
  ] = await Promise.all([
    supabase.from('relay_events').select('id, event_type, entity_id, entity_type, actor_id, actor_type, revenue_identity_id, payload, occurred_at, source_event_id').eq('organization_id', org.id).gte('occurred_at', start).lte('occurred_at', end).order('occurred_at', { ascending: false }).limit(5000),
    supabase.from('leads').select('id, company, contact_name, contact_title, status, score, verdict, canonical_score, canonical_intelligence, direction, source, owner_rep_id, revenue_identity_id, signal_type, signal_evidence, tags, created_at, updated_at').eq('organization_id', org.id).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }).limit(2000),
    supabase.from('messages').select('id, lead_id, rep_id, type, send_disposition, reject_reasons, model_used, sent_at, created_at').eq('organization_id', org.id).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }).limit(2000),
    supabase.from('conversation_states').select('lead_id, stage, last_sent_at, last_reply_at, followup_count, won_at, lost_at, lost_reason, commercial_state').eq('organization_id', org.id),
    supabase.from('ai_traces').select('id, task_class, provider, model, latency_ms, estimated_cost_usd, fallback, fallback_reason, error, quality, created_at').eq('organization_id', org.id).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }).limit(5000),
    supabase.from('daily_targets').select('id, rep_id, revenue_identity_id, activity_type, target_count, active').eq('organization_id', org.id).eq('active', true),
    supabase.from('daily_accountability').select('id, rep_id, revenue_identity_id, activity_type, target_date, target_count, completed_count, status').eq('organization_id', org.id).gte('target_date', startStr).lte('target_date', endStr),
    supabase.from('revenue_identities').select('id, slug, identity_name, title, channel, status').eq('organization_id', org.id),
    supabase.from('extraction_runs').select('id, rep_id, success, latency_ms, model, error_message, created_at').eq('organization_id', org.id).gte('created_at', start).lte('created_at', end).limit(5000),
  ])

  const events = eventsResult.data ?? []
  const leads = leadsResult.data ?? []
  const messages = messagesResult.data ?? []
  const conversations = conversationsResult.data ?? []
  const aiTraces = aiTracesResult.data ?? []
  const targets = targetsResult.data ?? []
  const accountability = accountabilityResult.data ?? []
  const identities = identitiesResult.data ?? []
  const extractionRuns = extractionRunsResult.data ?? []

  const leadMap = new Map(leads.map((l) => [l.id, l]))
  const identityMap = new Map(identities.map((i) => [i.id, i]))

  const funnelEvents = events.filter((e) =>
    ['PROSPECT_ANALYZED', 'PROSPECT_CAPTURED', 'LEAD_QUALIFIED', 'OUTREACH_RECORDED', 'FOLLOWUP_RECORDED', 'CLIENT_REPLIED', 'INTENT_DETECTED', 'CONVERSATION_ADVANCED', 'OUTCOME_RECORDED'].includes(e.event_type),
  )
  const eventsByEntity = new Map<string, typeof funnelEvents>()
  for (const ev of funnelEvents) {
    const key = ev.entity_id ?? 'orphan'
    if (!eventsByEntity.has(key)) eventsByEntity.set(key, [])
    eventsByEntity.get(key)!.push(ev)
  }
  const funnelStages = new Map<string, string[]>()
  for (const [entityId, evs] of eventsByEntity) {
    const stagesReached = new Set<string>()
    for (const ev of evs) {
      if (ev.event_type === 'PROSPECT_ANALYZED' || ev.event_type === 'PROSPECT_CAPTURED') stagesReached.add('ANALYZED')
      if (ev.event_type === 'LEAD_QUALIFIED') stagesReached.add('QUALIFIED')
      if (ev.event_type === 'OUTREACH_RECORDED' || ev.event_type === 'FOLLOWUP_RECORDED') stagesReached.add('CONTACTED')
      if (ev.event_type === 'CLIENT_REPLIED') stagesReached.add('REPLIED')
      if (ev.event_type === 'INTENT_DETECTED' || ev.event_type === 'CONVERSATION_ADVANCED') stagesReached.add('QUALIFIED_CONVERSATION')
      if (ev.event_type === 'OUTCOME_RECORDED') {
        const outcome = String(ev.payload?.outcome ?? ev.payload?.status ?? '')
        if (outcome === 'lost') stagesReached.add('LOST')
        else stagesReached.add('WON')
      }
      if (ev.event_type === 'CONVERSATION_ADVANCED') {
        const stage = String(ev.payload?.stage ?? ev.payload?.newStage ?? '')
        if (stage === 'meeting') stagesReached.add('CALL')
        if (stage === 'proposal' || stage === 'negotiation') stagesReached.add('PROPOSAL')
        if (stage === 'won') stagesReached.add('WON')
        if (stage === 'lost') stagesReached.add('LOST')
      }
    }
    funnelStages.set(entityId, [...stagesReached])
  }
  const stageCounts = new Map<string, number>()
  for (const stages of funnelStages.values()) {
    for (const s of stages) {
      stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1)
    }
  }

  const canonicalFunnel = {
    extracted: stageCounts.get('ANALYZED') ?? 0,
    qualified: stageCounts.get('QUALIFIED') ?? 0,
    contacted: stageCounts.get('CONTACTED') ?? 0,
    replied: stageCounts.get('REPLIED') ?? 0,
    qualifiedConversations: stageCounts.get('QUALIFIED_CONVERSATION') ?? 0,
    calls: stageCounts.get('CALL') ?? 0,
    proposals: stageCounts.get('PROPOSAL') ?? 0,
    won: stageCounts.get('WON') ?? 0,
    lost: stageCounts.get('LOST') ?? 0,
  }

  const convStageCounts = new Map<string, number>()
  for (const conv of conversations) {
    convStageCounts.set(conv.stage, (convStageCounts.get(conv.stage) ?? 0) + 1)
  }

  const extractionCounts = {
    total: extractionRuns.length,
    successful: extractionRuns.filter((r) => r.success).length,
    failed: extractionRuns.filter((r) => !r.success).length,
  }

  const providerCounts = new Map<string, { total: number; fallback: number; errors: number; totalLatency: number; totalCost: number }>()
  for (const trace of aiTraces) {
    const p = trace.provider ?? 'unknown'
    if (!providerCounts.has(p)) providerCounts.set(p, { total: 0, fallback: 0, errors: 0, totalLatency: 0, totalCost: 0 })
    const entry = providerCounts.get(p)!
    entry.total++
    if (trace.fallback) entry.fallback++
    if (trace.error) entry.errors++
    entry.totalLatency += trace.latency_ms ?? 0
    entry.totalCost += trace.estimated_cost_usd ?? 0
  }
  const latencies = aiTraces.map((t) => t.latency_ms ?? 0).filter((l) => l > 0).sort((a, b) => a - b)
  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0

  const dispositionCounts = new Map<string, number>()
  for (const msg of messages) {
    const d = msg.send_disposition ?? 'PENDING'
    dispositionCounts.set(d, (dispositionCounts.get(d) ?? 0) + 1)
  }

  const relayActionCounts = new Map<string, number>()
  const humanActionCounts = new Map<string, number>()
  for (const lead of leads) {
    const action = lead.verdict ?? 'UNKNOWN'
    relayActionCounts.set(action, (relayActionCounts.get(action) ?? 0) + 1)
    const contacted = lead.status === 'contacted' || lead.status === 'replied' || lead.status === 'followed_up' || lead.status === 'won' || lead.status === 'lost'
    const rejected = lead.status === 'no' || lead.status === 'dead'
    const humanAction = contacted ? 'contacted' : rejected ? 'rejected' : 'no_action'
    humanActionCounts.set(humanAction, (humanActionCounts.get(humanAction) ?? 0) + 1)
  }

  const repPerformance = new Map<string, { extracted: number; qualified: number; contacted: number; replies: number; qualifiedConversations: number; calls: number; proposals: number; wins: number; losses: number; targetProgress: number }>()

  for (const [, lead] of leadMap) {
    const repId = lead.owner_rep_id
    if (!repId) continue
    if (!repPerformance.has(repId)) repPerformance.set(repId, { extracted: 0, qualified: 0, contacted: 0, replies: 0, qualifiedConversations: 0, calls: 0, proposals: 0, wins: 0, losses: 0, targetProgress: 0 })
    const entry = repPerformance.get(repId)!
    const stages = funnelStages.get(lead.id) ?? []
    if (stages.includes('ANALYZED')) entry.extracted++
    if (stages.includes('QUALIFIED')) entry.qualified++
    if (stages.includes('CONTACTED')) entry.contacted++
    if (stages.includes('REPLIED')) entry.replies++
    if (stages.includes('QUALIFIED_CONVERSATION')) entry.qualifiedConversations++
    if (stages.includes('CALL')) entry.calls++
    if (stages.includes('PROPOSAL')) entry.proposals++
    if (stages.includes('WON')) entry.wins++
    if (stages.includes('LOST')) entry.losses++
  }

  const repTargets = new Map<string, { target: number; completed: number }>()
  for (const t of targets) {
    const key = t.rep_id
    if (!repTargets.has(key)) repTargets.set(key, { target: 0, completed: 0 })
    const entry = repTargets.get(key)!
    entry.target += t.target_count ?? 0
  }
  for (const a of accountability) {
    const key = a.rep_id
    if (!repTargets.has(key)) repTargets.set(key, { target: 0, completed: 0 })
    repTargets.get(key)!.completed += a.completed_count ?? 0
  }
  for (const [repId, progress] of repTargets) {
    if (repPerformance.has(repId)) {
      repPerformance.get(repId)!.targetProgress = progress.target > 0 ? Math.round((progress.completed / progress.target) * 100) : 0
    }
  }

  const totalAiCalls = aiTraces.length
  const totalAiCost = aiTraces.reduce((sum, t) => sum + (t.estimated_cost_usd ?? 0), 0)
  const avgExtractionTime = extractionRuns.length > 0 ? Math.round(extractionRuns.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / extractionRuns.length) : 0
  const failedExtractions = extractionRuns.filter((r) => !r.success).length
  const aiExtractions = extractionRuns.filter((r) => r.model && r.model !== 'demo').length
  const fallbackExtractions = extractionRuns.filter((r) => r.model === 'demo').length

  const sourceCounts = new Map<string, { extracted: number; qualified: number; contacted: number; replies: number }>()
  for (const lead of leads) {
    const src = lead.source ?? 'unknown'
    if (!sourceCounts.has(src)) sourceCounts.set(src, { extracted: 0, qualified: 0, contacted: 0, replies: 0 })
    const entry = sourceCounts.get(src)!
    const stages = funnelStages.get(lead.id) ?? []
    if (stages.includes('ANALYZED')) entry.extracted++
    if (stages.includes('QUALIFIED')) entry.qualified++
    if (stages.includes('CONTACTED')) entry.contacted++
    if (stages.includes('REPLIED')) entry.replies++
  }

  const fitCounts = new Map<string, number>()
  const intentCounts = new Map<string, number>()
  const qualificationCounts = new Map<string, number>()
  const confidenceBuckets = { high: 0, medium: 0, low: 0 }
  for (const lead of leads) {
    const ci = lead.canonical_intelligence as Record<string, unknown> | null
    const score = lead.canonical_score ?? lead.score ?? 0
    const fit = score >= 70 ? 'Strong' : score >= 55 ? 'Maybe' : score >= 40 ? 'Weak' : 'Not a fit'
    fitCounts.set(fit, (fitCounts.get(fit) ?? 0) + 1)
    const confidence = (ci?.confidence as number) ?? 0
    if (confidence >= 80) confidenceBuckets.high++
    else if (confidence >= 50) confidenceBuckets.medium++
    else confidenceBuckets.low++
    const qualification = (ci?.qualification as string) ?? 'unknown'
    qualificationCounts.set(qualification, (qualificationCounts.get(qualification) ?? 0) + 1)
  }

  const activityFeed = events.slice(0, 100).map((ev) => {
    const lead = ev.entity_id ? leadMap.get(ev.entity_id) : null
    const rep = ev.actor_id
    return {
      id: ev.id,
      timestamp: ev.occurred_at,
      eventType: ev.event_type,
      actorId: rep,
      entityId: ev.entity_id,
      prospectName: lead?.contact_name ?? lead?.company ?? null,
      company: lead?.company ?? null,
      revenueIdentityId: ev.revenue_identity_id,
      revenueIdentityName: ev.revenue_identity_id ? identityMap.get(ev.revenue_identity_id)?.identity_name ?? null : null,
      payload: ev.payload,
    }
  })

  const sourcePerformance = [...sourceCounts.entries()].map(([source, counts]) => ({ source, ...counts }))

  const providers = [...providerCounts.entries()].map(([provider, data]) => ({
    provider,
    total: data.total,
    fallback: data.fallback,
    errors: data.errors,
    avgLatency: data.total > 0 ? Math.round(data.totalLatency / data.total) : 0,
    totalCost: Math.round(data.totalCost * 100) / 100,
  }))

  return NextResponse.json({
    range: { start, end },
    funnel: canonicalFunnel,
    conversationStages: Object.fromEntries(convStageCounts),
    extraction: {
      ...extractionCounts,
      aiExtractions,
      fallbackExtractions,
      avgExtractionTime,
      failedExtractions,
    },
    ai: {
      totalCalls: totalAiCalls,
      totalCost: Math.round(totalAiCost * 100) / 100,
      avgExtractionTime,
      p50Latency: p50,
      p95Latency: p95,
      providers,
    },
    messages: {
      total: messages.length,
      dispositions: Object.fromEntries(dispositionCounts),
    },
    relayVsHuman: {
      relayActions: Object.fromEntries(relayActionCounts),
      humanActions: Object.fromEntries(humanActionCounts),
    },
    reps: [...repPerformance.entries()].map(([repId, data]) => ({ repId, ...data })),
    identities: identities.map((i) => ({ id: i.id, name: i.identity_name, slug: i.slug, title: i.title, channel: i.channel, status: i.status })),
    sourcePerformance,
    fitDistribution: Object.fromEntries(fitCounts),
    confidenceDistribution: confidenceBuckets,
    qualificationDistribution: Object.fromEntries(qualificationCounts),
    activityFeed,
    targets: { total: targets.length, totalTarget: targets.reduce((s, t) => s + t.target_count, 0), totalCompleted: accountability.reduce((s, a) => s + a.completed_count, 0) },
  })
}
