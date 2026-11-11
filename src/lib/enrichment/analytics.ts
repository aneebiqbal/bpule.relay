/**
 * Provider analytics (§31, §32).
 *
 * Reads the canonical authorities only — action_events, captured_prospects,
 * contact_points, provider_search_runs, provider_telemetry. No second analytics
 * universe and no duplicate formulas.
 */
import type { DbClient } from '@/lib/db/types'

export interface ProviderFunnel {
  discovered: number
  qualified: number
  emailVerified: number
  leadCreated: number
  connectionSent: number
  linkedinReply: number
  emailSent: number
  emailReply: number
  meeting: number
  won: number
}

export interface SearchQualityRow {
  searchId: string
  searchName: string
  provider: string
  discovered: number
  qualified: number
  leadCreated: number
  verifiedEmails: number
  creditsUsed: number
  costPerVerifiedEmail: number | null
}

export interface ProviderAnalytics {
  window: { start: string; end: string }
  funnel: ProviderFunnel
  searches: SearchQualityRow[]
  providerSpend: Array<{ provider: string; credits: number; operations: number; failures: number }>
}

const FUNNEL_EVENTS = [
  'PROSPECT_DISCOVERED',
  'PROSPECT_QUALIFIED',
  'EMAIL_VERIFIED',
  'LEAD_EXTRACTED',
  'CONNECTION_SENT',
  'REPLY_RECEIVED',
  'EMAIL_SENT',
  'EMAIL_REPLY_RECEIVED',
  'MEETING_BOOKED',
  'CLIENT_WON',
]

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function loadProviderAnalytics(
  client: DbClient,
  orgId: string,
  window: { start: string; end: string },
): Promise<ProviderAnalytics> {
  if (!client.raw) {
    throw new Error('Provider analytics requires the Neon raw client.')
  }

  const [funnelRows, searchRows, verifiedRows, costRows, telemetryRows, searchNames] = await Promise.all([
    client.raw<Array<{ action_type: string; n: number }>>(
      `select action_type, count(*)::int as n from action_events
       where organization_id = $1 and occurred_at >= $2 and occurred_at < $3
         and action_type = any($4)
       group by action_type`,
      [orgId, window.start, window.end, FUNNEL_EVENTS],
    ),
    client.raw<Array<{ search_id: string; provider: string; discovered: number; qualified: number; lead_created: number }>>(
      `select search_id, provider, count(*)::int as discovered,
              count(*) filter (where qualified)::int as qualified,
              count(*) filter (where converted_lead_id is not null)::int as lead_created
       from captured_prospects
       where organization_id = $1 and discovered_at >= $2 and discovered_at < $3
       group by search_id, provider`,
      [orgId, window.start, window.end],
    ),
    client.raw<Array<{ search_id: string; verified: number }>>(
      `select c.search_id, count(*)::int as verified
       from captured_prospects c
       join contact_points cp
         on cp.organization_id = c.organization_id
        and cp.person_id = c.provider_person_id
        and cp.type = 'email'
        and cp.verification_status = 'VERIFIED'
       where c.organization_id = $1 and c.discovered_at >= $2 and c.discovered_at < $3
       group by c.search_id`,
      [orgId, window.start, window.end],
    ),
    client.raw<Array<{ search_id: string; credits: number }>>(
      `select search_id, coalesce(sum(credits_used), 0)::int as credits
       from provider_search_runs
       where organization_id = $1 and started_at >= $2 and started_at < $3
       group by search_id`,
      [orgId, window.start, window.end],
    ),
    client.raw<Array<{ provider: string; credits: number; operations: number; failures: number }>>(
      `select provider, coalesce(sum(credits), 0)::int as credits, count(*)::int as operations,
              count(*) filter (where status <> 'OK')::int as failures
       from provider_telemetry
       where organization_id = $1 and created_at >= $2 and created_at < $3
       group by provider`,
      [orgId, window.start, window.end],
    ),
    client.raw<Array<{ id: string; name: string }>>(
      `select id, name from provider_saved_searches where organization_id = $1 limit 200`,
      [orgId],
    ),
  ])

  const failed = [funnelRows, searchRows, verifiedRows, costRows, telemetryRows, searchNames].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message ?? 'Provider analytics query failed.')

  const funnel: ProviderFunnel = {
    discovered: 0,
    qualified: 0,
    emailVerified: 0,
    leadCreated: 0,
    connectionSent: 0,
    linkedinReply: 0,
    emailSent: 0,
    emailReply: 0,
    meeting: 0,
    won: 0,
  }
  for (const row of funnelRows.data ?? []) {
    const n = number(row.n)
    switch (row.action_type) {
      case 'PROSPECT_DISCOVERED': funnel.discovered = n; break
      case 'PROSPECT_QUALIFIED': funnel.qualified = n; break
      case 'EMAIL_VERIFIED': funnel.emailVerified = n; break
      case 'LEAD_EXTRACTED': funnel.leadCreated = n; break
      case 'CONNECTION_SENT': funnel.connectionSent = n; break
      case 'REPLY_RECEIVED': funnel.linkedinReply = n; break
      case 'EMAIL_SENT': funnel.emailSent = n; break
      case 'EMAIL_REPLY_RECEIVED': funnel.emailReply = n; break
      case 'MEETING_BOOKED': funnel.meeting = n; break
      case 'CLIENT_WON': funnel.won = n; break
    }
  }

  const nameById = new Map((searchNames.data ?? []).map((row) => [row.id, row.name]))
  const verifiedById = new Map((verifiedRows.data ?? []).map((row) => [row.search_id, number(row.verified)]))
  const creditsById = new Map((costRows.data ?? []).map((row) => [row.search_id, number(row.credits)]))

  const searches: SearchQualityRow[] = (searchRows.data ?? []).map((row) => {
    const verified = verifiedById.get(row.search_id) ?? 0
    const credits = creditsById.get(row.search_id) ?? 0
    return {
      searchId: row.search_id,
      searchName: nameById.get(row.search_id) ?? 'Unknown search',
      provider: row.provider,
      discovered: number(row.discovered),
      qualified: number(row.qualified),
      leadCreated: number(row.lead_created),
      verifiedEmails: verified,
      creditsUsed: credits,
      costPerVerifiedEmail: verified > 0 ? Math.round((credits / verified) * 100) / 100 : null,
    }
  }).sort((a, b) => b.discovered - a.discovered)

  const providerSpend = (telemetryRows.data ?? []).map((row) => ({
    provider: row.provider,
    credits: number(row.credits),
    operations: number(row.operations),
    failures: number(row.failures),
  }))

  return { window, funnel, searches, providerSpend }
}
