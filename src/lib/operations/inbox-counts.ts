import type { DbClient } from '@/lib/db/types'
import { loadChatQueue } from './chat-queue'

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
