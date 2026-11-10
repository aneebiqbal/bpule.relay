/**
 * Canonical Upwork lifecycle — the one state per job.
 *
 * A generated proposal is a draft; an application is an explicit submission.
 * Follow-up due and archive-candidate are derived facts, never stored statuses.
 * Pure: no database, no clock.
 */

export const UPWORK_JOB_STATUSES = [
  'SAVED',
  'DRAFT_READY',
  'APPLIED',
  'CLIENT_REPLIED',
  'INTERVIEW',
  'WON',
  'LOST',
  'ARCHIVED',
] as const

export type UpworkJobStatus = (typeof UPWORK_JOB_STATUSES)[number]

/** The one follow-up policy. Durations live here and nowhere else. */
export const FOLLOWUP_POLICY = {
  firstFollowUpDays: 4,
  secondFollowUpDays: 4,
  archiveReviewDays: 7,
} as const

export function isUpworkJobStatus(value: unknown): value is UpworkJobStatus {
  return typeof value === 'string' && (UPWORK_JOB_STATUSES as readonly string[]).includes(value)
}

/**
 * Legacy rows mapped onto the lifecycle. `no` has no live rows; it means
 * "passed", which is an archive, not a loss — mapping it to LOST would invent
 * an outcome the rep never recorded.
 */
const LEGACY_STATUS_MAP: Record<string, UpworkJobStatus> = {
  new: 'SAVED',
  drafted: 'DRAFT_READY',
  applied: 'APPLIED',
  replied: 'CLIENT_REPLIED',
  dead: 'ARCHIVED',
  no: 'ARCHIVED',
}

export function mapLegacyStatus(status: string): UpworkJobStatus {
  if (isUpworkJobStatus(status)) return status
  return LEGACY_STATUS_MAP[status] ?? 'SAVED'
}

/**
 * Allowed transitions. WON/LOST require an interview; a reply cannot exist
 * before an application; archived is terminal.
 */
const TRANSITIONS: Record<UpworkJobStatus, readonly UpworkJobStatus[]> = {
  SAVED: ['DRAFT_READY', 'APPLIED', 'ARCHIVED'],
  DRAFT_READY: ['APPLIED', 'SAVED', 'ARCHIVED'],
  APPLIED: ['CLIENT_REPLIED', 'ARCHIVED'],
  CLIENT_REPLIED: ['INTERVIEW', 'WON', 'LOST', 'ARCHIVED'],
  INTERVIEW: ['WON', 'LOST', 'ARCHIVED'],
  WON: ['ARCHIVED'],
  LOST: ['ARCHIVED'],
  ARCHIVED: [],
}

export function canTransition(from: UpworkJobStatus, to: UpworkJobStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

function addDays(iso: string, days: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t + days * 86_400_000).toISOString()
}

/**
 * When the next follow-up is due, or null when none is owed:
 * no application, a client reply, or two follow-ups already sent.
 */
export function followUpDueAt(
  submittedAt: string | null,
  followUps: readonly string[],
  firstReplyAt: string | null,
): string | null {
  if (!submittedAt || firstReplyAt) return null
  if (followUps.length >= 2) return null
  if (followUps.length === 0) return addDays(submittedAt, FOLLOWUP_POLICY.firstFollowUpDays)
  return addDays(followUps[followUps.length - 1], FOLLOWUP_POLICY.secondFollowUpDays)
}

/**
 * Derived archive candidate: applied, two follow-ups sent, no reply, and the
 * stale window has elapsed since the last follow-up. Never auto-archived.
 */
export function isArchiveCandidate(
  submittedAt: string | null,
  followUps: readonly string[],
  firstReplyAt: string | null,
  now: string,
): boolean {
  if (!submittedAt || firstReplyAt) return false
  if (followUps.length < 2) return false
  const last = followUps[followUps.length - 1]
  const elapsed = Date.parse(now) - Date.parse(last)
  if (Number.isNaN(elapsed)) return false
  return elapsed >= FOLLOWUP_POLICY.archiveReviewDays * 86_400_000
}

/** Actual first-response duration; null when either end is unknown. */
export function responseTimeMs(submittedAt: string | null, firstReplyAt: string | null): number | null {
  if (!submittedAt || !firstReplyAt) return null
  const delta = Date.parse(firstReplyAt) - Date.parse(submittedAt)
  return Number.isNaN(delta) ? null : delta
}
