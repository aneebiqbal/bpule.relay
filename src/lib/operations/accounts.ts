import type { DbClient } from '@/lib/db/types'
/**
 * Account layer (Phase 8.13–8.17).
 *
 * An account is the set of leads sharing a `company_key` — there is no
 * companies table and no second company writer. Everything here is derived
 * from canonical lead + conversation state columns. Commercial potential uses
 * the existing qualification bands; no new scoring.
 *
 * Revenue is not stored per company, so it is reported as "not tracked"
 * rather than estimated.
 */
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { readAllPages } from '@/lib/operations/paged-read'
import { qualifyCanonicalScore } from '@/lib/scoring/qualification'
import { furthestStage, type FunnelStep } from '@/lib/operations/performance'
import { sourceBucket } from '@/lib/operations/filters'

export interface AccountLead {
  id: string
  company: string | null
  companyKey: string
  contactName: string | null
  contactTitle: string | null
  ownerRepId: string | null
  ownerName: string | null
  profileId: string | null
  profileName: string | null
  status: string | null
  source: string | null
  region: string | null
  score: number | null
  createdAt: string
  stage: string | null
  lastSentAt: string | null
  lastReplyAt: string | null
  nextFollowupAt: string | null
  wonAt: string | null
}

export interface AccountRow {
  companyKey: string
  company: string
  region: string | null
  people: number
  activeOpportunities: number
  profiles: string[]
  owners: string[]
  relationship: FunnelStep['key']
  relationshipLabel: string
  lastActivityAt: string | null
  nextAction: string
  nextActionHref: string | null
  wins: number
}

const CLOSED = new Set(['won', 'lost', 'dead', 'no'])

export const RELATIONSHIP_LABEL: Record<FunnelStep['key'], string> = {
  lead: 'Not contacted',
  contact: 'Contacted',
  reply: 'In conversation',
  meeting: 'Meeting',
  proposal: 'Proposal',
  won: 'Won',
}

const RANK: Record<FunnelStep['key'], number> = { lead: 0, contact: 1, reply: 2, meeting: 3, proposal: 4, won: 5 }

function latest(...values: Array<string | null | undefined>): string | null {
  let out: string | null = null
  for (const v of values) if (v && (!out || v > out)) out = v
  return out
}

function stageOf(lead: AccountLead): FunnelStep['key'] {
  return furthestStage({
    id: lead.id,
    status: lead.status,
    stage: lead.stage,
    lastSentAt: lead.lastSentAt,
    lastReplyAt: lead.lastReplyAt,
    wonAt: lead.wonAt,
  })
}

function personName(lead: AccountLead): string {
  return lead.contactName?.trim() || 'Unnamed contact'
}

/** The single most urgent next step across the account's open leads. */
export function accountNextAction(leads: readonly AccountLead[], now = Date.now()): { label: string; href: string | null } {
  const open = leads.filter((l) => !CLOSED.has(l.status ?? ''))
  const waiting = open
    .filter((l) => l.lastReplyAt && (!l.lastSentAt || l.lastReplyAt > l.lastSentAt))
    .sort((a, b) => (a.lastReplyAt! < b.lastReplyAt! ? -1 : 1))[0]
  if (waiting) return { label: `Reply to ${personName(waiting)}`, href: `/chats?lead=${waiting.id}` }
  const followUp = open
    .filter((l) => l.nextFollowupAt && Date.parse(l.nextFollowupAt) <= now)
    .sort((a, b) => (a.nextFollowupAt! < b.nextFollowupAt! ? -1 : 1))[0]
  if (followUp) return { label: `Follow up with ${personName(followUp)}`, href: `/leads/${followUp.id}` }
  const untouched = open.filter((l) => !l.lastSentAt).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0]
  if (untouched) return { label: `Contact ${personName(untouched)}`, href: `/leads/${untouched.id}` }
  if (open.length > 0) return { label: 'Waiting on prospect', href: null }
  return { label: 'No open opportunity', href: null }
}

/** Pure: group leads into account rows. Leads without a company key are skipped. */
export function groupAccounts(leads: readonly AccountLead[], now = Date.now()): AccountRow[] {
  const byKey = new Map<string, AccountLead[]>()
  for (const lead of leads) {
    if (!lead.companyKey) continue
    const list = byKey.get(lead.companyKey) ?? []
    list.push(lead)
    byKey.set(lead.companyKey, list)
  }
  const rows: AccountRow[] = []
  for (const [companyKey, list] of byKey) {
    const open = list.filter((l) => !CLOSED.has(l.status ?? ''))
    let relationship: FunnelStep['key'] = 'lead'
    for (const l of list) {
      const s = stageOf(l)
      if (RANK[s] > RANK[relationship]) relationship = s
    }
    const next = accountNextAction(list, now)
    rows.push({
      companyKey,
      company: list.find((l) => l.company?.trim())?.company?.trim() ?? companyKey,
      region: list.find((l) => l.region)?.region ?? null,
      people: new Set(list.map((l) => (l.contactName?.trim() || l.id).toLowerCase())).size,
      activeOpportunities: open.length,
      profiles: [...new Set(list.map((l) => l.profileName).filter(Boolean))] as string[],
      owners: [...new Set(list.map((l) => l.ownerName).filter(Boolean))] as string[],
      relationship,
      relationshipLabel: RELATIONSHIP_LABEL[relationship],
      lastActivityAt: latest(...list.flatMap((l) => [l.createdAt, l.lastSentAt, l.lastReplyAt])),
      nextAction: next.label,
      nextActionHref: next.href,
      wins: list.filter((l) => stageOf(l) === 'won').length,
    })
  }
  return rows.sort((a, b) => (a.lastActivityAt ?? '') < (b.lastActivityAt ?? '') ? 1 : -1)
}

export interface AccountPerson {
  leadId: string
  name: string
  title: string | null
  stageLabel: string
  profileName: string | null
  ownerName: string | null
  lastActivityAt: string | null
}

export interface AccountOverview {
  company: string
  companyKey: string
  region: string | null
  sources: string[]
  metrics: {
    people: number
    openLeads: number
    activeConversations: number
    meetings: number
    proposals: number
    wins: number
  }
  potential: { label: string; score: number | null; leadId: string | null; leadLabel: string | null }
  relationshipLabel: string
  profiles: string[]
  owners: string[]
  lastActivityAt: string | null
  nextAction: { label: string; href: string | null }
  people: AccountPerson[]
}

const POTENTIAL_LABEL: Record<string, string> = {
  STRONG: 'Strong fit',
  WORTH_PURSUING: 'Worth pursuing',
  MAYBE: 'Maybe',
  LOW: 'Low',
  SKIP: 'Skip',
  INELIGIBLE: 'Ineligible',
}

/** Pure: the Account 360 overview from one account's leads. */
export function buildAccountOverview(leads: readonly AccountLead[], now = Date.now()): AccountOverview | null {
  if (leads.length === 0) return null
  const row = groupAccounts(leads, now)[0]
  const open = leads.filter((l) => !CLOSED.has(l.status ?? ''))
  const best = [...open].filter((l) => l.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null
  const band = best?.score != null ? qualifyCanonicalScore(best.score).qualification : null
  const stages = leads.map(stageOf)
  return {
    company: row.company,
    companyKey: row.companyKey,
    region: row.region,
    sources: [...new Set(leads.map((l) => sourceBucket(l.source)))].map((s) =>
      s === 'linkedin' ? 'LinkedIn' : s === 'upwork' ? 'Upwork' : 'Other',
    ),
    metrics: {
      people: row.people,
      openLeads: open.length,
      activeConversations: open.filter((l) => l.lastReplyAt).length,
      meetings: stages.filter((s) => s === 'meeting').length,
      proposals: stages.filter((s) => s === 'proposal').length,
      wins: row.wins,
    },
    potential: {
      label: band ? POTENTIAL_LABEL[band] ?? band : 'Not scored',
      score: best?.score ?? null,
      leadId: best?.id ?? null,
      leadLabel: best ? personName(best) : null,
    },
    relationshipLabel: row.relationshipLabel,
    profiles: row.profiles,
    owners: row.owners,
    lastActivityAt: row.lastActivityAt,
    nextAction: { label: row.nextAction, href: row.nextActionHref },
    people: leads
      .map((l) => ({
        leadId: l.id,
        name: personName(l),
        title: l.contactTitle,
        stageLabel: RELATIONSHIP_LABEL[stageOf(l)],
        profileName: l.profileName,
        ownerName: l.ownerName,
        lastActivityAt: latest(l.createdAt, l.lastSentAt, l.lastReplyAt),
      }))
      .sort((a, b) => ((a.lastActivityAt ?? '') < (b.lastActivityAt ?? '') ? 1 : -1)),
  }
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

const ACCOUNT_LEAD_COLUMNS =
  'id, company, company_key, contact_name, contact_title, owner_rep_id, revenue_identity_id, status, source, market_region, canonical_score, created_at'

/**
 * Ceiling for one scope's account leads, read in pages of 1,000. Production
 * holds ~800 leads (2026-11-01); past the ceiling the page says so. A SQL
 * rollup by company_key is the step after this, not before.
 */
export const ACCOUNT_LEAD_CAP = 10_000

interface RawLead {
  id: string
  company: string | null
  company_key: string | null
  contact_name: string | null
  contact_title: string | null
  owner_rep_id: string | null
  revenue_identity_id: string | null
  status: string | null
  source: string | null
  market_region: string | null
  canonical_score: number | null
  created_at: string
}

async function hydrate(client: DbClient, orgId: string, raw: RawLead[]): Promise<AccountLead[]> {
  const keyed = raw.filter((l) => l.company_key)
  const identityIds = [...new Set(keyed.map((l) => l.revenue_identity_id).filter(Boolean))] as string[]
  const ownerIds = [...new Set(keyed.map((l) => l.owner_rep_id).filter(Boolean))] as string[]
  const [states, identities, reps] = await Promise.all([
    chunkedIn<{
      lead_id: string
      stage: string | null
      last_sent_at: string | null
      last_reply_at: string | null
      next_followup_at: string | null
      won_at: string | null
    }>(keyed.map((l) => l.id), (chunk) =>
      client
        .from('conversation_states')
        .select('lead_id, stage, last_sent_at, last_reply_at, next_followup_at, won_at')
        .eq('organization_id', orgId)
        .in('lead_id', chunk),
    ).catch(() => []),
    chunkedIn<{ id: string; identity_name: string }>(identityIds, (chunk) =>
      client.from('revenue_identities').select('id, identity_name').eq('organization_id', orgId).in('id', chunk),
    ).catch(() => []),
    chunkedIn<{ id: string; name: string }>(ownerIds, (chunk) =>
      client.from('reps').select('id, name').eq('organization_id', orgId).in('id', chunk),
    ),
  ])
  const stateBy = new Map(states.map((s) => [s.lead_id, s]))
  const identityName = new Map(identities.map((i) => [i.id, i.identity_name]))
  const repName = new Map(reps.map((r) => [r.id, r.name]))
  return keyed.map((l) => {
    const s = stateBy.get(l.id)
    return {
      id: l.id,
      company: l.company,
      companyKey: l.company_key!,
      contactName: l.contact_name,
      contactTitle: l.contact_title,
      ownerRepId: l.owner_rep_id,
      ownerName: l.owner_rep_id ? repName.get(l.owner_rep_id) ?? null : null,
      profileId: l.revenue_identity_id,
      profileName: l.revenue_identity_id ? identityName.get(l.revenue_identity_id) ?? null : null,
      status: l.status,
      source: l.source,
      region: l.market_region,
      score: l.canonical_score,
      createdAt: l.created_at,
      stage: s?.stage ?? null,
      lastSentAt: s?.last_sent_at ?? null,
      lastReplyAt: s?.last_reply_at ?? null,
      nextFollowupAt: s?.next_followup_at ?? null,
      wonAt: s?.won_at ?? null,
    }
  })
}

export async function loadAccountLeads(
  client: DbClient,
  query: { orgId: string; repIds: string[] | null; companyKey?: string | null; q?: string | null },
): Promise<{ leads: AccountLead[]; truncated: boolean }> {
  if (query.repIds && query.repIds.length === 0) return { leads: [], truncated: false }
  const term = query.q ? query.q.replace(/[%,()\\]/g, ' ').trim().slice(0, 80) : ''
  const { rows: raw, truncated } = await readAllPages<RawLead>(
    (from, to) => {
      let q = client
        .from('leads')
        .select(ACCOUNT_LEAD_COLUMNS)
        .eq('organization_id', query.orgId)
        .eq('archived', false)
        .eq('is_test', false)
        .not('company_key', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
      if (query.repIds) q = q.in('owner_rep_id', query.repIds)
      if (query.companyKey) q = q.eq('company_key', query.companyKey)
      if (term) q = q.ilike('company', `%${term}%`)
      return q as unknown as PromiseLike<{ data: RawLead[] | null; error: unknown }>
    },
    { ceiling: ACCOUNT_LEAD_CAP },
  )
  return { leads: await hydrate(client, query.orgId, raw), truncated }
}
