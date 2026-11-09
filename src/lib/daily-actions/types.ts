/**
 * DailyAction — one ordered thing a person should do next.
 *
 * Pure projection over canonical facts. It reads the existing authorities
 * (Inbox, Tasks, Targets, Coverage, Readiness, Upwork) and never writes, never
 * counts independently and never asks a model for priority.
 */

export type DailyActionType =
  | 'INBOX_REPLY'
  | 'TASK'
  | 'FOLLOW_UP'
  | 'TARGET'
  | 'COVERAGE'
  | 'READINESS'
  | 'UPWORK'

/** Deterministic urgency classes. Lower number = more urgent. */
export type DailyActionUrgency =
  | 'P0' // operational blocker
  | 'P1' // urgent conversation
  | 'P2' // overdue assigned work
  | 'P3' // due follow-up
  | 'P4' // coverage / readiness exception
  | 'P5' // target shortfall
  | 'P6' // optional opportunity

export type DailyActionSource =
  | 'Inbox'
  | 'Tasks'
  | 'Follow-ups'
  | 'Targets'
  | 'Coverage'
  | 'Readiness'
  | 'Upwork'

export interface DailyAction {
  /** Stable, deterministic id — the last sort key. */
  id: string
  type: DailyActionType
  urgency: DailyActionUrgency
  urgencyRank: number
  source: DailyActionSource
  /** Profile label, never a bare person name when it could be ambiguous. */
  profile: string
  channel: string
  subject: string
  reason: string
  /** Human age/remaining text, e.g. "22m ago" or "12 remaining". */
  age: string
  dueAt: string | null
  destination: string
  blocking: boolean
  owner: string
}

/**
 * Explicit ordering contract. The numbers are the contract; the labels are for
 * humans. Changing the order is a product decision, not a tuning exercise.
 */
export const URGENCY_RANK: Record<DailyActionUrgency, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
  P6: 6,
}

export function compareDailyActions(a: DailyAction, b: DailyAction): number {
  const byRank = a.urgencyRank - b.urgencyRank
  if (byRank !== 0) return byRank
  // Soonest due first; undated after dated.
  const at = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY
  const bt = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY
  if (at !== bt) return at - bt
  // Blocking work before non-blocking work inside the same class.
  if (a.blocking !== b.blocking) return a.blocking ? -1 : 1
  // Deterministic tiebreak so the order never depends on input order.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
