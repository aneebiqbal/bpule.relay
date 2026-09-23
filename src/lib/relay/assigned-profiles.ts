import type { AccountabilityStatus, ActivityType, TargetProgressView } from '@/lib/domain/types'

export interface AssignedProfileIdentity {
  identityName: string
  title: string | null
  channel: string
  profileUrl: string | null
}

export interface AssignedProfileRow {
  assignmentId: string
  identity: AssignedProfileIdentity
  targets: TargetProgressView[]
}

export interface AssignedProfilesModel {
  repName: string
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  overallStatus: string
  notifications: Array<{ id: string; title: string; body: string }>
  assignedIdentities: AssignedProfileRow[]
}

/**
 * `/api/rep/today` used to return `identities` (and raw snake_case identity
 * rows) while this screen reads `assignedIdentities`. Calling `.flatMap` on
 * the missing field crashed the route. Accept both shapes.
 */
export function normalizeAssignedProfiles(raw: unknown): AssignedProfilesModel {
  const body = record(raw) ?? {}
  const list = Array.isArray(body.assignedIdentities)
    ? body.assignedIdentities
    : Array.isArray(body.identities)
      ? body.identities
      : []

  return {
    repName: text(body.repName) ?? 'You',
    totalTarget: number(body.totalTarget),
    totalCompleted: number(body.totalCompleted),
    totalRemaining: number(body.totalRemaining),
    overallStatus: text(body.overallStatus) ?? 'on_track',
    notifications: Array.isArray(body.notifications)
      ? body.notifications.flatMap((item, index) => {
          const note = record(item)
          if (!note) return []
          return [{
            id: text(note.id) ?? `note-${index}`,
            title: text(note.title) ?? 'Update',
            body: text(note.body) ?? '',
          }]
        })
      : [],
    assignedIdentities: list.map((item, index) => {
      const row = record(item) ?? {}
      const targets = Array.isArray(row.targets) ? row.targets : []
      return {
        assignmentId: text(row.assignmentId) ?? text(row.id) ?? `assignment-${index}`,
        identity: identityOf(row.identity),
        targets: targets.map((target, targetIndex) => targetOf(target, targetIndex)),
      }
    }),
  }
}

function identityOf(value: unknown): AssignedProfileIdentity {
  const row = Array.isArray(value) ? record(value[0]) : record(value)
  return {
    identityName: text(row?.identityName) ?? text(row?.identity_name) ?? 'Unnamed identity',
    title: text(row?.title),
    channel: text(row?.channel) ?? 'other',
    profileUrl: text(row?.profileUrl) ?? text(row?.profile_url),
  }
}

function targetOf(value: unknown, index: number): TargetProgressView {
  const row = record(value) ?? {}
  const targetCount = number(row.targetCount ?? row.target_count)
  const completedCount = number(row.completedCount ?? row.completed_count)
  const status = text(row.status) ?? 'on_track'
  return {
    targetId: text(row.targetId) ?? text(row.id) ?? `target-${index}`,
    activityType: (text(row.activityType) ?? text(row.activity_type) ?? 'other') as ActivityType,
    targetCount,
    completedCount,
    remaining: number(row.remaining ?? Math.max(0, targetCount - completedCount)),
    status: status as AccountabilityStatus,
    accountabilityId: text(row.accountabilityId) ?? text(row.accountability_id),
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
