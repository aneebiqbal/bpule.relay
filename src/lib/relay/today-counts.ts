/**
 * Today KPI counts.
 *
 * The KPI card and the section lists on Today must read the same actions. They
 * used to disagree: the card counted leads by stored `status` while the sections
 * counted canonical ranked actions, so "Replies waiting" could read 2 on the
 * card and 6 in the list (REL-QA-003) and "Follow-ups due" 0 vs 1 (REL-QA-004).
 *
 * One selector, used by both.
 */

export interface TodayCounts {
  repliesWaiting: number
  followUpsDue: number
}

/** The action kinds that belong to each Today section. */
export const TODAY_REPLY_KINDS = ['reply_needed'] as const
export const TODAY_FOLLOWUP_KINDS = ['followup_due'] as const

export function deriveTodayCounts(actions: ReadonlyArray<{ kind: string }>): TodayCounts {
  return {
    repliesWaiting: actions.filter((a) => (TODAY_REPLY_KINDS as readonly string[]).includes(a.kind)).length,
    followUpsDue: actions.filter((a) => (TODAY_FOLLOWUP_KINDS as readonly string[]).includes(a.kind)).length,
  }
}

/** The section rows for a Today KPI — the same actions, so the counts match. */
export function selectTodaySection(
  actions: ReadonlyArray<{ kind: string }>,
  kinds: readonly string[],
): ReadonlyArray<{ kind: string }> {
  return actions.filter((a) => kinds.includes(a.kind))
}
