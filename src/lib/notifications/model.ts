/**
 * Canonical notification model (Phase 8 / Slice C). Pure — no I/O.
 *
 * One system: rows in the `notifications` table, delivered through
 * `notifyOnce` (deliver.ts). Notifications are derived from meaningful
 * operational events only; UI events (lead opened, filter changed, draft
 * generated, score recalculated) never notify. Every event maps to one
 * dedupe key per recipient, so a replayed event cannot notify twice.
 */

import { classifyClientMessage } from '@/lib/conversation/intent'

export type NotificationCategory = 'replies' | 'tasks' | 'assignments' | 'meetings' | 'admin_requests' | 'system'

export const NOTIFICATION_CATEGORIES: Array<{ value: NotificationCategory; label: string }> = [
  { value: 'replies', label: 'Replies' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'admin_requests', label: 'Admin requests' },
  { value: 'system', label: 'System' },
]

/** Stored notification_type → category. Unknown types are System, never dropped. */
export function categoryForType(type: string | null | undefined): NotificationCategory {
  const t = (type ?? '').toLowerCase()
  if (t === 'reply_received' || t === 'reply_waiting' || t === 'reply' || t === 'followups_due') return 'replies'
  if (
    t === 'task_assigned'
    || t === 'task_reassigned'
    || t === 'task_cancelled'
    || t === 'task_overdue'
    || t === 'task_completed'
    || t === 'task_comment'
    || t === 'task_transferred_away'
    || t === 'task_transfer_requested'
    || t === 'task_transfer_proposed'
    || t === 'task_transfer_declined'
  ) return 'tasks'
  if (t.startsWith('identity_') || t === 'lead_reassigned' || t === 'lead_reassigned_away' || t === 'lead_referred') return 'assignments'
  if (t === 'meeting_requested' || t === 'proposal_requested') return 'meetings'
  if (t === 'update_requested' || t === 'thread_review') return 'admin_requests'
  return 'system'
}

export interface RelayNotification {
  id: string
  category: NotificationCategory
  type: string
  title: string
  body: string | null
  href: string
  createdAt: string
  read: boolean
}

export interface NotificationRow {
  id: string
  notification_type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

/** Rows without a link deep-link to the notifications page itself, never a dead end. */
export function toRelayNotification(row: NotificationRow): RelayNotification {
  return {
    id: row.id,
    category: categoryForType(row.notification_type),
    type: row.notification_type,
    title: row.title,
    body: row.body?.trim() || null,
    href: row.link && row.link.startsWith('/') ? row.link : '/notifications',
    createdAt: row.created_at,
    read: row.read,
  }
}

// ─── Rules ──────────────────────────────────────────────────────────────────

export type OperationalEvent =
  // `text` is the persisted inbound body; auto-replies and empty rows never notify.
  | { kind: 'INBOUND_REPLY'; leadId: string; messageId: string; ownerRepId: string | null; actorRepId: string | null; person: string; company: string | null; text: string | null }
  | { kind: 'TASK_ASSIGNED'; taskId: string; assigneeRepId: string; actorRepId: string; actorName: string | null; title: string }
  | { kind: 'TASK_REASSIGNED'; taskId: string; assigneeRepId: string; actorRepId: string; actorName: string | null; title: string }
  | { kind: 'TASK_OVERDUE'; taskId: string; assigneeRepId: string; title: string; dueAt: string }
  | { kind: 'UPDATE_REQUESTED'; taskId: string; assigneeRepId: string; actorRepId: string; actorName: string | null; title: string }
  | { kind: 'LEAD_REASSIGNED'; leadId: string; newOwnerRepId: string; previousOwnerRepId: string | null; actorRepId: string; actorName: string | null; person: string }
  // From the canonical client-turn analysis (memory.lastClientAnalysis.intent), keyed by the analysed turn.
  | { kind: 'MEETING_REQUESTED'; leadId: string; messageId: string; ownerRepId: string | null; actorRepId: string | null; person: string }
  | { kind: 'PROPOSAL_REQUESTED'; leadId: string; messageId: string; ownerRepId: string | null; actorRepId: string | null; person: string }
  | { kind: 'THREAD_REVIEW'; leadId: string; reviewerRepId: string; reason: string; person: string; dayKey: string }
  // Never notify — listed so callers cannot accidentally route them here.
  | { kind: 'LEAD_OPENED' | 'FILTER_CHANGED' | 'DRAFT_GENERATED' | 'SCORE_RECALCULATED' }

export interface NotificationIntent {
  recipientId: string
  type: string
  title: string
  body: string
  link: string
  dedupeKey: string
}

function by(name: string | null): string {
  return name ? ` by ${name}` : ''
}

/**
 * Event → at most one notification for its intended recipient. Returns null
 * for non-meaningful events, when there is no recipient, or when the
 * recipient caused the event themselves.
 */
export function notificationFor(event: OperationalEvent): NotificationIntent | null {
  switch (event.kind) {
    case 'INBOUND_REPLY': {
      if (!event.ownerRepId || event.ownerRepId === event.actorRepId) return null
      if (!event.text?.trim() || classifyClientMessage(event.text).intent === 'auto_reply') return null
      return {
        recipientId: event.ownerRepId,
        type: 'reply_received',
        title: `${event.person} replied`,
        body: event.company ?? '',
        link: `/chats?lead=${event.leadId}`,
        dedupeKey: `reply_received:${event.leadId}:${event.messageId}`,
      }
    }
    case 'TASK_ASSIGNED':
    case 'TASK_REASSIGNED': {
      if (event.assigneeRepId === event.actorRepId) return null
      const reassigned = event.kind === 'TASK_REASSIGNED'
      return {
        recipientId: event.assigneeRepId,
        type: reassigned ? 'task_reassigned' : 'task_assigned',
        title: reassigned ? 'Task reassigned to you' : 'New task assigned',
        body: `${event.title}${by(event.actorName)}`,
        link: `/tasks?task=assigned:${event.taskId}`,
        dedupeKey: `${reassigned ? 'task_reassigned' : 'task_assigned'}:${event.taskId}:${event.assigneeRepId}`,
      }
    }
    case 'TASK_OVERDUE':
      return {
        recipientId: event.assigneeRepId,
        type: 'task_overdue',
        title: 'Task overdue',
        body: event.title,
        link: `/tasks?task=assigned:${event.taskId}`,
        // One overdue notice per task per due date (a reschedule may notify again).
        dedupeKey: `task_overdue:${event.taskId}:${event.dueAt}`,
      }
    case 'UPDATE_REQUESTED':
      if (event.assigneeRepId === event.actorRepId) return null
      return {
        recipientId: event.assigneeRepId,
        type: 'update_requested',
        title: `Update requested${by(event.actorName)}`,
        body: event.title,
        link: `/tasks?task=assigned:${event.taskId}`,
        dedupeKey: `update_requested:${event.taskId}`,
      }
    case 'LEAD_REASSIGNED':
      if (event.newOwnerRepId === event.actorRepId) return null
      return {
        recipientId: event.newOwnerRepId,
        type: 'lead_reassigned',
        title: `Lead assigned to you${by(event.actorName)}`,
        body: event.person,
        link: `/leads/${event.leadId}`,
        dedupeKey: `lead_reassigned:${event.leadId}:${event.newOwnerRepId}`,
      }
    case 'MEETING_REQUESTED':
    case 'PROPOSAL_REQUESTED': {
      if (!event.ownerRepId || event.ownerRepId === event.actorRepId) return null
      const meeting = event.kind === 'MEETING_REQUESTED'
      return {
        recipientId: event.ownerRepId,
        type: meeting ? 'meeting_requested' : 'proposal_requested',
        title: `${event.person} ${meeting ? 'asked for a meeting' : 'asked about pricing'}`,
        body: '',
        link: `/chats?lead=${event.leadId}`,
        dedupeKey: `${meeting ? 'meeting_requested' : 'proposal_requested'}:${event.leadId}:${event.messageId}`,
      }
    }
    case 'THREAD_REVIEW':
      return {
        recipientId: event.reviewerRepId,
        type: 'thread_review',
        title: `Review thread: ${event.person}`,
        body: event.reason,
        link: `/chats?lead=${event.leadId}`,
        dedupeKey: `thread_review:${event.leadId}:${event.dayKey}`,
      }
    default:
      return null
  }
}

/**
 * Every notification an event produces — at most one per recipient. Only a
 * lead reassignment has a second recipient: the previous owner gets an
 * informational notice (not when they made the change themselves).
 */
export function notificationsFor(event: OperationalEvent): NotificationIntent[] {
  const primary = notificationFor(event)
  const out = primary ? [primary] : []
  if (
    event.kind === 'LEAD_REASSIGNED' &&
    event.previousOwnerRepId &&
    event.previousOwnerRepId !== event.newOwnerRepId &&
    event.previousOwnerRepId !== event.actorRepId
  ) {
    out.push({
      recipientId: event.previousOwnerRepId,
      type: 'lead_reassigned_away',
      title: `Lead moved to another rep${by(event.actorName)}`,
      body: event.person,
      link: `/leads/${event.leadId}`,
      dedupeKey: `lead_reassigned_away:${event.leadId}:${event.newOwnerRepId}`,
    })
  }
  return out
}
