import type { SupabaseClient } from '@supabase/supabase-js'
import { getLeadDisplayScore } from '@/lib/scoring/display-score'

/**
 * Accountability Metrics
 *
 * One action = one lead that progressed through a meaningful outreach step.
 * Connection sent, DM sent, follow-up sent, reply received, lead won.
 * Each counts as ONE action toward the rep's daily accountability.
 */

export interface DailyMetrics {
  date: string
  repId: string
  repName: string
  // Core actions
  connectionsSent: number
  dmsSent: number
  followupsSent: number
  repliesSent: number
  repliesReceived: number
  leadsWon: number
  // Computed
  totalActions: number
  outreachActions: number // connections + dms + followups + replies sent
  responseRate: number // replies_received / outreach_sent
}

export interface LeadJourney {
  leadId: string
  company: string
  contactName: string
  stage: string
  connectionSent: boolean
  dmSent: boolean
  hasReply: boolean
  isWon: boolean
  lastActivityAt: string | null
  /** User-facing score text ("8/10"); never a raw legacy number (REL-QA-006). */
  scoreText: string
}

/**
 * The user-facing score text for a lead. Canonical leads show the /10 display
 * value; a legacy-only lead shows "/12" so the scale is always named. A raw
 * legacy number is never shown as "score" on its own (REL-QA-006).
 */
export function leadScoreText(input: { canonicalScore?: number | null; score?: number | null }): string {
  return getLeadDisplayScore({
    canonicalScore: input.canonicalScore ?? null,
    score: input.score ?? null,
  }).text
}

export interface RepAccountability {
  repId: string
  repName: string
  today: DailyMetrics
  week: DailyMetrics
  month: DailyMetrics
  openLeads: LeadJourney[]
  activeLeads: number // leads touched today
}

export interface TeamDayView {
  date: string
  reps: DailyMetrics[]
  teamTotal: {
    connectionsSent: number
    dmsSent: number
    followupsSent: number
    repliesReceived: number
    leadsWon: number
    totalActions: number
  }
}

const EMPTY_METRICS: Omit<DailyMetrics, 'date' | 'repId' | 'repName'> = {
  connectionsSent: 0,
  dmsSent: 0,
  followupsSent: 0,
  repliesSent: 0,
  repliesReceived: 0,
  leadsWon: 0,
  totalActions: 0,
  outreachActions: 0,
  responseRate: 0,
}

function withComputed(m: Omit<DailyMetrics, 'date' | 'repId' | 'repName'>): Omit<DailyMetrics, 'date' | 'repId' | 'repName'> {
  const outreachActions = m.connectionsSent + m.dmsSent + m.followupsSent + m.repliesSent
  const totalActions = outreachActions + m.leadsWon
  const responseRate = outreachActions > 0 ? Math.round((m.repliesReceived / outreachActions) * 100) : 0
  return { ...m, outreachActions, totalActions, responseRate }
}

async function fetchMetricsForPeriod(
  client: SupabaseClient,
  repId: string,
  startDate: string,
  endDate: string,
): Promise<Omit<DailyMetrics, 'date' | 'repId' | 'repName'>> {
  const { data: messages } = await client
    .from('messages')
    .select('type, direction, sent_at')
    .eq('rep_id', repId)
    .gte('sent_at', startDate)
    .lte('sent_at', endDate)

  // leads has no updated_at; the win date is the outcome event, and the owner
  // is read from the lead row at query time.
  const { data: wonOutcomes } = await client
    .from('outcomes')
    .select('lead_id')
    .eq('stage', 'won')
    .gte('occurred_at', startDate)
    .lte('occurred_at', endDate)

  const wonLeadIds = Array.from(
    new Set((wonOutcomes ?? []).map((o) => o.lead_id).filter((id): id is string => Boolean(id))),
  )
  const { data: wonLeads } = wonLeadIds.length
    ? await client.from('leads').select('id').eq('owner_rep_id', repId).in('id', wonLeadIds)
    : { data: [] as Array<{ id: string }> }

  let connectionsSent = 0
  let dmsSent = 0
  let followupsSent = 0
  let repliesSent = 0
  let repliesReceived = 0

  for (const m of messages ?? []) {
    const direction = m.direction as string
    const type = m.type as string
    if (direction === 'inbound') {
      repliesReceived++
      continue
    }
    switch (type) {
      case 'connection': connectionsSent++; break
      case 'dm': dmsSent++; break
      case 'followup': followupsSent++; break
      case 'reply': repliesSent++; break
    }
  }

  return withComputed({
    connectionsSent,
    dmsSent,
    followupsSent,
    repliesSent,
    repliesReceived,
    leadsWon: wonLeads?.length ?? 0,
    totalActions: 0,
    outreachActions: 0,
    responseRate: 0,
  })
}

export async function getRepMetrics(
  client: SupabaseClient,
  repId: string,
  repName: string,
  date: string,
): Promise<DailyMetrics> {
  const start = `${date}T00:00:00.000Z`
  const end = `${date}T23:59:59.999Z`
  const m = await fetchMetricsForPeriod(client, repId, start, end)
  return { date, repId, repName, ...m }
}

export async function getRepMetricsRange(
  client: SupabaseClient,
  repId: string,
  repName: string,
  startDate: string,
  endDate: string,
): Promise<DailyMetrics> {
  const start = `${startDate}T00:00:00.000Z`
  const end = `${endDate}T23:59:59.999Z`
  const m = await fetchMetricsForPeriod(client, repId, start, end)
  return { date: startDate, repId, repName, ...m }
}

export async function getRepLeadJourney(
  client: SupabaseClient,
  repId: string,
): Promise<LeadJourney[]> {
  const { data: leads } = await client
    .from('leads')
    .select('id, company, contact_name, status, score, canonical_score, created_at')
    .eq('owner_rep_id', repId)
    .neq('status', 'won')
    .neq('status', 'lost')
    .neq('status', 'dead')
    .neq('status', 'no')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!leads || leads.length === 0) return []

  const leadIds = leads.map((l) => l.id)
  const { data: messages } = await client
    .from('messages')
    .select('lead_id, type, direction')
    .in('lead_id', leadIds)

  const msgMap = new Map<string, { connection: boolean; dm: boolean; reply: boolean; inbound: boolean }>()
  for (const m of messages ?? []) {
    const entry = msgMap.get(m.lead_id as string) || { connection: false, dm: false, reply: false, inbound: false }
    if (m.direction === 'inbound') entry.inbound = true
    else if (m.type === 'connection') entry.connection = true
    else if (m.type === 'dm') entry.dm = true
    else if (m.type === 'reply') entry.reply = true
    msgMap.set(m.lead_id as string, entry)
  }

  return leads.map((l) => {
    const msgs = msgMap.get(l.id) || { connection: false, dm: false, reply: false, inbound: false }
    return {
      leadId: l.id,
      company: l.company,
      contactName: l.contact_name,
      stage: l.status,
      connectionSent: msgs.connection || msgs.dm,
      dmSent: msgs.dm,
      hasReply: msgs.inbound,
      isWon: l.status === 'won',
      lastActivityAt: l.created_at as string,
      scoreText: leadScoreText({
        canonicalScore: (l.canonical_score as number) ?? null,
        score: (l.score as number) ?? null,
      }),
    }
  })
}

export async function getTeamDayView(
  client: SupabaseClient,
  repIds: string[],
  repNames: Map<string, string>,
  date: string,
): Promise<TeamDayView> {
  const promises = repIds.map(async (id) => {
    const name = repNames.get(id) ?? id.slice(0, 8)
    return getRepMetrics(client, id, name, date)
  })
  const reps = await Promise.all(promises)

  const teamTotal = reps.reduce(
    (acc, r) => ({
      connectionsSent: acc.connectionsSent + r.connectionsSent,
      dmsSent: acc.dmsSent + r.dmsSent,
      followupsSent: acc.followupsSent + r.followupsSent,
      repliesReceived: acc.repliesReceived + r.repliesReceived,
      leadsWon: acc.leadsWon + r.leadsWon,
      totalActions: acc.totalActions + r.totalActions,
    }),
    { connectionsSent: 0, dmsSent: 0, followupsSent: 0, repliesReceived: 0, leadsWon: 0, totalActions: 0 },
  )

  return { date, reps, teamTotal }
}

export async function getTeamCalendar(
  client: SupabaseClient,
  repIds: string[],
  repNames: Map<string, string>,
  startDate: string,
  endDate: string,
): Promise<TeamDayView[]> {
  const days: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }

  const emptyTotal = () => ({ connectionsSent: 0, dmsSent: 0, followupsSent: 0, repliesReceived: 0, leadsWon: 0, totalActions: 0 })
  const repFilter = repIds.length ? repIds : []
  if (repFilter.length === 0) {
    return days.map((date) => ({ date, reps: [], teamTotal: emptyTotal() }))
  }

  // One batched read for the whole range (was 252 queries for 18 reps x 7 days).
  const startIso = `${startDate}T00:00:00.000Z`
  const endIso = `${endDate}T23:59:59.999Z`
  const [{ data: messages }, { data: wonOutcomes }, { data: leads }] = await Promise.all([
    client.from('messages')
      .select('rep_id, type, direction, sent_at')
      .in('rep_id', repFilter)
      .gte('sent_at', startIso)
      .lte('sent_at', endIso),
    client.from('outcomes')
      .select('lead_id, occurred_at')
      .eq('stage', 'won')
      .gte('occurred_at', startIso)
      .lte('occurred_at', endIso),
    client.from('leads')
      .select('id, owner_rep_id')
      .in('owner_rep_id', repFilter),
  ])

  const ownerByLead = new Map<string, string>()
  for (const l of (leads ?? []) as Array<{ id: string; owner_rep_id: string | null }>) {
    if (l.owner_rep_id) ownerByLead.set(l.id, l.owner_rep_id)
  }
  const wonByOwnerDay = new Map<string, number>()
  for (const o of (wonOutcomes ?? []) as Array<{ lead_id: string; occurred_at: string }>) {
    const owner = ownerByLead.get(o.lead_id)
    if (!owner) continue
    const day = String(o.occurred_at).slice(0, 10)
    const k = `${owner}|${day}`
    wonByOwnerDay.set(k, (wonByOwnerDay.get(k) ?? 0) + 1)
  }

  const acc = new Map<string, Omit<DailyMetrics, 'date' | 'repId' | 'repName'>>()
  for (const m of (messages ?? []) as Array<{ rep_id: string; type: string; direction: string; sent_at: string }>) {
    const rep = m.rep_id
    if (!repFilter.includes(rep)) continue
    const k = `${rep}|${String(m.sent_at).slice(0, 10)}`
    const cur = acc.get(k) ?? { ...EMPTY_METRICS }
    if (m.direction === 'inbound') cur.repliesReceived++
    else if (m.type === 'connection') cur.connectionsSent++
    else if (m.type === 'dm') cur.dmsSent++
    else if (m.type === 'followup') cur.followupsSent++
    else if (m.type === 'reply') cur.repliesSent++
    acc.set(k, cur)
  }

  return days.map((date) => {
    const reps: DailyMetrics[] = repFilter.map((repId) => {
      const cur = acc.get(`${repId}|${date}`) ?? { ...EMPTY_METRICS }
      const won = wonByOwnerDay.get(`${repId}|${date}`) ?? 0
      return { date, repId, repName: repNames.get(repId) ?? repId, ...withComputed({ ...cur, leadsWon: won }) }
    })
    const teamTotal = emptyTotal()
    for (const r of reps) {
      teamTotal.connectionsSent += r.connectionsSent
      teamTotal.dmsSent += r.dmsSent
      teamTotal.followupsSent += r.followupsSent
      teamTotal.repliesReceived += r.repliesReceived
      teamTotal.leadsWon += r.leadsWon
      teamTotal.totalActions += r.totalActions
    }
    return { date, reps, teamTotal }
  })
}

export async function getRepAccountability(
  client: SupabaseClient,
  repId: string,
  repName: string,
): Promise<RepAccountability> {
  const today = new Date().toISOString().slice(0, 10)
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const monthStart = new Date()
  monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().slice(0, 10)

  const [todayM, weekM, monthM, openLeads] = await Promise.all([
    fetchMetricsForPeriod(client, repId, `${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`).then(m => ({ date: today, repId, repName, ...m })),
    fetchMetricsForPeriod(client, repId, `${weekStartStr}T00:00:00.000Z`, `${today}T23:59:59.999Z`).then(m => ({ date: weekStartStr, repId, repName, ...m })),
    fetchMetricsForPeriod(client, repId, `${monthStartStr}T00:00:00.000Z`, `${today}T23:59:59.999Z`).then(m => ({ date: monthStartStr, repId, repName, ...m })),
    getRepLeadJourney(client, repId),
  ])

  return {
    repId,
    repName,
    today: todayM,
    week: weekM,
    month: monthM,
    openLeads,
    activeLeads: openLeads.filter((l) => l.lastActivityAt?.startsWith(today)).length,
  }
}
