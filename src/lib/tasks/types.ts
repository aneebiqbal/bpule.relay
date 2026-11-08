/** Unified task presentation contract — derived + assigned. */

export type UnifiedTaskSource = 'DERIVED' | 'ASSIGNED'

export type UnifiedTaskKind =
  | 'REPLY'
  | 'FOLLOW_UP'
  | 'RESEARCH'
  | 'CONNECT'
  | 'SEND_MESSAGE'
  | 'PROPOSAL'
  | 'MEETING'
  | 'REVIEW'
  | 'ADMIN'
  | 'CUSTOM'

export type UnifiedTaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

export type UnifiedTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'CANCELLED'

/** What a WAITING task is blocked on. */
export type UnifiedTaskWaitingOn = 'ADMIN' | 'REP' | 'CLIENT' | 'EXTERNAL'

export interface UnifiedTask {
  id: string
  source: UnifiedTaskSource
  kind: UnifiedTaskKind
  title: string
  reason: string
  organizationId: string
  assigneeRepId: string
  leadId?: string | null
  conversationId?: string | null
  companyId?: string | null
  companyName?: string | null
  profileId?: string | null
  profileName?: string | null
  priority: UnifiedTaskPriority
  dueAt?: string | null
  status: UnifiedTaskStatus
  waitingOn?: UnifiedTaskWaitingOn | null
  /** Optional note recorded with WAITING. */
  waitingNote?: string | null
  /** A rep's pending handoff request. Only a manager/admin approval reassigns. */
  transfer?: {
    toRepId: string
    toRepName: string | null
    reason: string | null
    requestedBy: string
  } | null
  /** Canonical profile context for leave handoffs — ownership never moves. */
  primaryRepName?: string | null
  executionRepName?: string | null
  /** Bounded latest internal comment — list rows never load the full thread. */
  latestComment?: { body: string; authorName: string | null; createdAt: string } | null
  /** Unread internal comments for the current viewer (notifications-backed). */
  unreadCount?: number
  createdBy?: string | null
  createdByName?: string | null
  createdAt: string
  /** Last write — status, assignment, due date, or a comment. */
  updatedAt?: string | null
  completedAt?: string | null
  note?: string | null
  action: { label: string; href: string }
}

export type AssignedTaskKind =
  | 'ADMIN'
  | 'REVIEW'
  | 'CALL'
  | 'RESEARCH'
  | 'PREPARE_PROPOSAL'
  | 'CUSTOM'
  | 'REQUEST_UPDATE'

export interface AssignedTaskRow {
  id: string
  organization_id: string
  assignee_rep_id: string
  created_by_rep_id: string
  lead_id: string | null
  profile_id: string | null
  kind: AssignedTaskKind
  title: string
  description: string | null
  priority: UnifiedTaskPriority
  due_at: string | null
  status: UnifiedTaskStatus
  waiting_on: UnifiedTaskWaitingOn | null
  waiting_note: string | null
  transfer_requested_by: string | null
  transfer_requested_to: string | null
  transfer_reason: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  previous_assignee_rep_id: string | null
}
