import type { DbClient } from '@/lib/db/types'
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { addDays, orgDate } from '@/lib/org-clock'

/**
 * Sidebar badge contract.
 *
 * `null` means "could not be read" — the shell renders no badge rather than a
 * misleading zero. Zero renders nothing either; only a real count is shown.
 */
export interface SidebarCounts {
  inboxNeedsReply: number | null
  actionableTasks: number | null
}

/**
 * Badge rule: null (unknown) and 0 render nothing; 100+ collapses to `99+`.
 * Shared by the sidebar and its tests so the display contract lives in one place.
 */
export function sidebarBadge(value: number | null | undefined): { value: number; label: string } | null {
  if (value === null || value === undefined || value <= 0) return null
  return { value, label: value >= 100 ? '99+' : String(value) }
}

const CLOSED_LEAD_STATUSES = ['won', 'lost', 'dead', 'no']
const OPEN_TASK_STATUSES = ['OPEN', 'IN_PROGRESS']

/** Canonical follow-up predicate, mirrored from `deriveConversationRow`. */
export function conversationNeedsReply(row: {
  last_sent_at: string | null
  last_reply_at: string | null
  stage: string | null
  won_at: string | null
  lost_at: string | null
}): boolean {
  const lastIn = row.last_reply_at ?? null
  const lastOut = row.last_sent_at ?? null
  // No inbound message yet means the prospect has not moved; nothing to answer.
  if (!lastIn) return false
  if (lastOut && Date.parse(lastOut) >= Date.parse(lastIn)) return false
  if (row.stage === 'won' || row.stage === 'lost') return false
  if (row.won_at || row.lost_at) return false
  return true
}

/**
 * Inbox badge: conversations where the prospect moved last and the thread is
 * not closed — exactly the /chats "Waiting on rep" view (`chatViewMatches`).
 * Closed leads, threads waiting on the prospect and unstarted threads never
 * count.
 */
async function countInboxNeedsReply(
  client: DbClient,
  orgId: string,
  repId: string,
): Promise<number | null> {
  try {
    const { data: leads, error } = await client
      .from('leads')
      .select('id')
      .eq('owner_rep_id', repId)
      .eq('archived', false)
      .not('status', 'in', CLOSED_LEAD_STATUSES)
    if (error) return null

    const leadIds = (leads ?? []).map((row) => row.id as string).filter(Boolean)
    if (leadIds.length === 0) return 0

    const states = await chunkedIn<{
      lead_id: string
      last_sent_at: string | null
      last_reply_at: string | null
      stage: string | null
      won_at: string | null
      lost_at: string | null
    }>(leadIds, (chunk) =>
      client
        .from('conversation_states')
        .select('lead_id, last_sent_at, last_reply_at, stage, won_at, lost_at')
        .eq('organization_id', orgId)
        .in('lead_id', chunk),
    )

    return states.filter(conversationNeedsReply).length
  } catch {
    return null
  }
}

/**
 * Tasks badge: open tasks assigned to this rep that are due today or overdue,
 * i.e. actionable now. Tasks without a due date are scheduled work, not
 * today's, so they stay out of the badge.
 */
async function countActionableTasks(
  client: DbClient,
  orgId: string,
  repId: string,
  timeZone: string,
): Promise<number | null> {
  try {
    const now = new Date()
    // End of the organization's current business day.
    const endOfDay = `${addDays(orgDate(now, timeZone || 'UTC'), 1)}T00:00:00.000Z`
    const { count, error } = await client
      .from('assigned_tasks')
      .select('id', { head: true, count: 'exact' })
      .eq('organization_id', orgId)
      .eq('assignee_rep_id', repId)
      .in('status', OPEN_TASK_STATUSES)
      .not('due_at', 'is', null)
      .lte('due_at', endOfDay)
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

/**
 * Two bounded reads for the whole shell: the rep's open lead ids plus one
 * conversation-state sweep, and one exact task count. No message bodies, no
 * task payloads, no N+1.
 */
export async function loadSidebarCounts(
  client: DbClient,
  input: { orgId: string; repId: string; timeZone?: string },
): Promise<SidebarCounts> {
  const [inboxNeedsReply, actionableTasks] = await Promise.all([
    countInboxNeedsReply(client, input.orgId, input.repId),
    countActionableTasks(client, input.orgId, input.repId, input.timeZone ?? 'UTC'),
  ])
  return { inboxNeedsReply, actionableTasks }
}
