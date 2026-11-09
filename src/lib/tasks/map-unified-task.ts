import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import {
  actionDeepLink,
  humanWhyNow,
  leadIdFromAction,
  primaryCtaLabel,
} from '@/lib/rep-home/action-presentation'
import { TODAY_FOLLOWUP_KINDS } from '@/lib/relay/today-counts'
import {
  assignedKindToUnified,
  derivedTaskKind,
  derivedTaskPriority,
} from '@/lib/tasks/task-priority-policy'
import type { AssignedTaskRow, UnifiedTask } from '@/lib/tasks/types'

const FOLLOWUP_SET = new Set<string>(TODAY_FOLLOWUP_KINDS)

export function toUnifiedTaskFromAction(
  action: RelayTodayAction,
  ctx: { organizationId: string; assigneeRepId: string },
): UnifiedTask {
  const kind = derivedTaskKind(action)
  const leadId = leadIdFromAction(action)
  // Follow-ups appear because policy already marked them due — use createdAt as dueAt.
  // Replies / research do not invent deadlines.
  const dueAt = FOLLOWUP_SET.has(action.kind) ? action.createdAt : null

  return {
    id: `derived:${action.id}`,
    source: 'DERIVED',
    kind,
    title: action.title,
    reason: humanWhyNow(action),
    organizationId: ctx.organizationId,
    assigneeRepId: ctx.assigneeRepId,
    leadId,
    conversationId: null,
    companyId: null,
    companyName: action.subtitle || null,
    profileId: action.identity?.id ?? null,
    profileName: action.identity?.name ?? null,
    channel: action.identity?.channel ?? null,
    priority: derivedTaskPriority(action),
    dueAt,
    status: 'OPEN',
    createdBy: null,
    createdByName: null,
    createdAt: action.createdAt,
    updatedAt: action.createdAt,
    completedAt: null,
    note: null,
    action: {
      label: primaryCtaLabel(action),
      href: actionDeepLink(action),
    },
  }
}

export function toUnifiedTaskFromAssigned(
  row: AssignedTaskRow,
  enrich?: {
    companyName?: string | null
    profileName?: string | null
    createdByName?: string | null
    assigneeName?: string | null
    transferToName?: string | null
    primaryRepName?: string | null
    executionRepName?: string | null
    latestComment?: { body: string; authorName: string | null; createdAt: string } | null
    unreadCount?: number
  },
): UnifiedTask {
  // An assigned task without a linked lead still has to open its detail —
  // falling back to `/tasks` made "View task" a no-op that just reloaded the list.
  const href = row.lead_id ? `/leads/${row.lead_id}` : `/tasks?task=${row.id}`
  const reason =
    row.kind === 'REQUEST_UPDATE'
      ? enrich?.createdByName
        ? `Manager requested an update · ${enrich.createdByName}`
        : 'Manager requested an update'
      : enrich?.createdByName
        ? `Assigned by ${enrich.createdByName}`
        : row.description || 'Assigned task'

  return {
    id: `assigned:${row.id}`,
    source: 'ASSIGNED',
    kind: assignedKindToUnified(row.kind),
    title: row.title,
    reason,
    organizationId: row.organization_id,
    assigneeRepId: row.assignee_rep_id,
    leadId: row.lead_id,
    conversationId: null,
    companyId: null,
    companyName: enrich?.companyName ?? null,
    profileId: row.profile_id,
    profileName: enrich?.profileName ?? null,
    priority: row.priority,
    dueAt: row.due_at,
    status: row.status,
    waitingOn: row.waiting_on,
    waitingNote: row.waiting_note,
    transfer: row.transfer_requested_to
      ? {
          toRepId: row.transfer_requested_to,
          toRepName: enrich?.transferToName ?? null,
          reason: row.transfer_reason,
          requestedBy: row.transfer_requested_by ?? row.assignee_rep_id,
        }
      : null,
    primaryRepName: enrich?.primaryRepName ?? null,
    executionRepName: enrich?.executionRepName ?? null,
    latestComment: enrich?.latestComment ?? null,
    unreadCount: enrich?.unreadCount ?? 0,
    createdBy: row.created_by_rep_id,
    createdByName: enrich?.createdByName ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    note: row.description,
    action: {
      label: row.lead_id ? 'Open lead' : 'View task',
      href,
    },
  }
}

/** Stable id without source prefix (for APIs). */
export function assignedTaskIdFromUnified(id: string): string | null {
  if (!id.startsWith('assigned:')) return null
  return id.slice('assigned:'.length)
}

export function isDerivedTaskId(id: string): boolean {
  return id.startsWith('derived:')
}
