import type { DbClient } from '@/lib/db/types'
import { loadChatQueue } from './chat-queue'
import { deriveConversationRow } from './conversations'
import { isCoverageActiveOn } from '@/lib/coverage/access'
import { chunkedIn } from '@/lib/supabase/chunked-in'

/**
 * The canonical Inbox counts for one rep.
 *
 * Rep Home and `/chats` read this same authority over the rep's executable
 * profiles (primary assignments plus active coverage), so a visible count
 * always equals the number of rows in its destination filter.
 */
export interface InboxCounts {
  needsReply: number
  waitingOnClient: number
  followups: number
  all: number
}

export async function getInboxCountsForRep(
  client: DbClient,
  input: {
    orgId: string
    repId: string
    executableIdentities?: ReadonlyArray<{ id: string; profileId?: string | null }>
    coveredIdentityIds?: readonly string[]
  },
  now = Date.now(),
): Promise<InboxCounts> {
  const queue = await loadChatQueue(
    client,
    {
      orgId: input.orgId,
      repIds: [input.repId],
      executableIdentities: input.executableIdentities,
      coveredIdentityIds: input.coveredIdentityIds,
      view: 'all',
      managerViews: false,
      limit: 1,
      countOnly: true,
    },
    now,
  )
  return {
    needsReply: queue.counts.waiting_me ?? 0,
    waitingOnClient: queue.counts.waiting_them ?? 0,
    followups: queue.counts.followups ?? 0,
    all: queue.counts.all ?? 0,
  }
}

/**
 * Batched canonical counts for many reps — the Team surfaces' one authority.
 *
 * Same semantic authority as `loadChatQueue` (`deriveConversationRow`), but the
 * leads, conversation states and coverage are read in a handful of batched
 * queries instead of one `loadChatQueue` per rep. No second predicate.
 */
export async function getInboxCountsForRepIds(
  client: DbClient,
  input: { orgId: string; repIds: string[]; businessDate: string; now?: number },
): Promise<Map<string, InboxCounts>> {
  const nowMs = input.now ?? Date.now()
  const repIdSet = new Set(input.repIds)
  const empty = (): InboxCounts => ({ needsReply: 0, waitingOnClient: 0, followups: 0, all: 0 })
  const counts = new Map<string, InboxCounts>()
  for (const repId of input.repIds) counts.set(repId, empty())
  if (input.repIds.length === 0) return counts

  // Same candidate set as loadChatQueue: open, non-test leads.
  const { data: leads, error } = await client
    .from('leads')
    .select('id, owner_rep_id, revenue_identity_id, status')
    .eq('organization_id', input.orgId)
    .eq('archived', false)
    .eq('is_test', false)
    .limit(1500)
  if (error) throw error

  const stateRows = await chunkedIn<{
    lead_id: string
    stage: string | null
    last_sent_at: string | null
    last_reply_at: string | null
    next_followup_at: string | null
    won_at: string | null
    lost_at: string | null
  }>(
    (leads ?? []).map((lead) => lead.id as string),
    (chunk) =>
      client
        .from('conversation_states')
        .select('lead_id, stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at')
        .eq('organization_id', input.orgId)
        .in('lead_id', chunk),
  )
  const stateBy = new Map(stateRows.map((row) => [row.lead_id, row]))

  // Active, non-expired coverage for these reps.
  const { data: coverageRows } = await client
    .from('coverage_assignments')
    .select('profile_id, covering_rep_id, effective_from, effective_until')
    .eq('organization_id', input.orgId)
    .eq('status', 'ACTIVE')
    .in('covering_rep_id', input.repIds)
    .limit(500)
  const activeCoverage = (coverageRows ?? []).filter((row) =>
    isCoverageActiveOn(
      { effectiveFrom: row.effective_from as string, effectiveUntil: (row.effective_until as string | null) ?? null },
      input.businessDate,
    ),
  )
  const coveringRepByProfile = new Map(activeCoverage.map((row) => [row.profile_id as string, row.covering_rep_id as string]))
  const coveredProfileIds = new Set(coveringRepByProfile.keys())

  const { data: identityRows } = coveredProfileIds.size
    ? await client
        .from('revenue_identities')
        .select('id, profile_id')
        .eq('organization_id', input.orgId)
        .eq('status', 'active')
        .in('profile_id', [...coveredProfileIds])
        .limit(500)
    : { data: [] as Array<{ id: string; profile_id: string | null }> }
  const coveringRepByIdentity = new Map<string, string>()
  for (const identity of identityRows ?? []) {
    if (!identity.profile_id) continue
    const repId = coveringRepByProfile.get(identity.profile_id)
    if (repId) coveringRepByIdentity.set(identity.id as string, repId)
  }

  for (const lead of leads ?? []) {
    const state = stateBy.get(lead.id as string)
    const derived = deriveConversationRow(
      {
        id: lead.id as string,
        contactName: null,
        company: null,
        companyKey: null,
        ownerRepId: lead.owner_rep_id as string | null,
        profileName: null,
        status: lead.status as string | null,
      },
      state
        ? {
            stage: state.stage,
            lastSentAt: state.last_sent_at,
            lastReplyAt: state.last_reply_at,
            nextFollowupAt: state.next_followup_at,
            wonAt: state.won_at,
            lostAt: state.lost_at,
          }
        : null,
      null,
      nowMs,
    )
    if (!derived) continue

    const viewers = new Set<string>()
    if (lead.owner_rep_id && repIdSet.has(lead.owner_rep_id as string)) viewers.add(lead.owner_rep_id as string)
    if (lead.revenue_identity_id) {
      const coveringRepId = coveringRepByIdentity.get(lead.revenue_identity_id as string)
      if (coveringRepId && repIdSet.has(coveringRepId)) viewers.add(coveringRepId)
    }
    if (viewers.size === 0) continue

    for (const repId of viewers) {
      const entry = counts.get(repId) ?? empty()
      if (derived.state === 'waiting_on_rep') entry.needsReply += 1
      else if (derived.state === 'waiting_on_prospect' || derived.state === 'meeting') entry.waitingOnClient += 1
      else if (derived.state === 'follow_up_due') entry.followups += 1
      if (derived.state !== 'closed') entry.all += 1
      counts.set(repId, entry)
    }
  }

  return counts
}

/**
 * The canonical Inbox counts for the whole organization — Admin Home's
 * org-wide "Replies waiting". Same authority and predicates as the Rep Home
 * counts, with `repIds: null` so the scope is the organization, never one
 * rep's executable set.
 */
export async function getInboxCountsForOrg(
  client: DbClient,
  input: { orgId: string },
  now = Date.now(),
): Promise<InboxCounts> {
  const queue = await loadChatQueue(
    client,
    {
      orgId: input.orgId,
      repIds: null,
      view: 'all',
      managerViews: false,
      limit: 1,
      countOnly: true,
    },
    now,
  )
  return {
    needsReply: queue.counts.waiting_me ?? 0,
    waitingOnClient: queue.counts.waiting_them ?? 0,
    followups: queue.counts.followups ?? 0,
    all: queue.counts.all ?? 0,
  }
}
