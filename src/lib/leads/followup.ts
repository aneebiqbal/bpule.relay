/**
 * Follow-up policy: ONE follow-up, five working days after the last send,
 * then never again. A lead that has already received a follow-up (status
 * 'followed_up') is permanently locked out of another one — there is no
 * second follow-up, ever, regardless of how much time passes. A reply is
 * permanent too: once a lead has replied, follow-up is off the table.
 *
 * Five working days means business days — Saturday and Sunday do not count
 * toward the wait, matching how the rule is meant to read to a rep ("five
 * working days"), not five days on a wall calendar.
 */

const FOLLOWUP_DUE_BUSINESS_DAYS = 5

/** Number of whole business days (Mon-Fri) between two instants, floor-rounded. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  let count = 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)

  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1)
    const day = cursor.getDay() // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) count += 1
  }
  return count
}

export function isFollowupDue(sentAt: string, hasReplied: boolean, now: Date = new Date()): boolean {
  if (hasReplied) return false
  return businessDaysBetween(new Date(sentAt), now) >= FOLLOWUP_DUE_BUSINESS_DAYS
}

export { FOLLOWUP_DUE_BUSINESS_DAYS }
