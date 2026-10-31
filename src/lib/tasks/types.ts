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

export type UnifiedTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'

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
  createdBy?: string | null
  createdByName?: string | null
  createdAt: string
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
  created_at: string
  updated_at: string
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  previous_assignee_rep_id: string | null
}
