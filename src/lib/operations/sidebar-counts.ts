import type { DbClient } from '@/lib/db/types'
import { getInboxCountsForOrg, getInboxCountsForRep } from '@/lib/operations/inbox-counts'
import { deriveConversationRow } from '@/lib/operations/conversations'
import { isCanonicalActiveTask } from '@/lib/tasks/rank-unified-tasks'

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

const OPEN_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING']

/**
 * Needs-reply predicate — a thin delegation to the canonical conversation
 * derivation. Kept as a named export for the sidebar contract test; the badge
 * itself reads `getInboxCountsForRep`.
 */
export function conversationNeedsReply(row: {
  last_sent_at: string | null
  last_reply_at: string | null
  stage: string | null
  won_at: string | null
  lost_at: string | null
}): boolean {
  const derived = deriveConversationRow(
    { id: '', contactName: null, company: null, companyKey: null, ownerRepId: null, profileName: null, status: null },
    { stage: row.stage, lastSentAt: row.last_sent_at, lastReplyAt: row.last_reply_at, nextFollowupAt: null, wonAt: row.won_at, lostAt: row.lost_at },
    null,
    Date.now(),
  )
  return derived?.state === 'waiting_on_rep'
}

/**
 * Tasks badge: open ASSIGNED work that the canonical classifier puts in the
 * Active/Overdue views. Uses the same `classifyUnifiedTaskTab` rule as
 * `/tasks`, so the badge and the page share one formula. Derived queue work
 * (replies/follow-ups) lives in the Today page and the Inbox badge, not here.
 */
async function countActionableTasks(
  client: DbClient,
  orgId: string,
  repId: string | null,
  timeZone: string,
): Promise<number | null> {
  try {
    const now = new Date()
    let query = client
      .from('assigned_tasks')
      .select('id, status, priority, kind, due_at, created_at, organization_id, assignee_rep_id, created_by_rep_id, lead_id, profile_id, description, waiting_on, waiting_note, transfer_requested_to, transfer_requested_by, transfer_reason, completed_at, cancelled_at, cancel_reason, previous_assignee_rep_id, updated_at')
      .eq('organization_id', orgId)
      .in('status', OPEN_TASK_STATUSES)
      .limit(500)
    if (repId) query = query.eq('assignee_rep_id', repId)
    const { data, error } = await query
    if (error) return null
    return (data ?? []).filter((row) =>
      isCanonicalActiveTask(
        {
          source: 'ASSIGNED',
          kind: row.kind,
          priority: row.priority,
          dueAt: row.due_at,
          status: row.status,
          createdAt: row.created_at,
        },
        now.getTime(),
        timeZone || 'UTC',
      ),
    ).length
  } catch {
    return null
  }
}

/**
 * Two bounded reads for the whole shell: the canonical Inbox count (same
 * authority as Rep Home and /chats) and one assigned-task sweep classified by
 * the shared rule. No message bodies, no task payloads, no N+1.
 */
export async function loadSidebarCounts(
  client: DbClient,
  input: {
    orgId: string
    repId: string
    timeZone?: string
    executableIdentities?: ReadonlyArray<{ id: string; profileId?: string | null }>
    coveredIdentityIds?: readonly string[]
    /** Admin/Owner Inbox and Work are org-wide, matching `/chats` and `/tasks`. */
    orgWide?: boolean
  },
): Promise<SidebarCounts> {
  const [inbox, actionableTasks] = await Promise.all([
    input.orgWide
      ? getInboxCountsForOrg(client, { orgId: input.orgId }).catch(() => null)
      : getInboxCountsForRep(client, {
          orgId: input.orgId,
          repId: input.repId,
          executableIdentities: input.executableIdentities,
          coveredIdentityIds: input.coveredIdentityIds,
        }).catch(() => null),
    countActionableTasks(client, input.orgId, input.orgWide ? null : input.repId, input.timeZone ?? 'UTC'),
  ])
  return { inboxNeedsReply: inbox ? inbox.needsReply : null, actionableTasks }
}
