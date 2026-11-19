import type { DbClient } from '@/lib/db/types'
import { notifyOnce } from '@/lib/notifications/deliver'

type PreferenceKey = 'new_matches' | 'saved_reminders' | 'application_followups'

async function preferenceEnabled(db: DbClient, orgId: string, repId: string, key: PreferenceKey): Promise<boolean> {
  const row = await db.from('job_notification_preferences').select(key)
    .eq('organization_id', orgId).eq('rep_id', repId).maybeSingle()
  if (row.error || !row.data) return true
  return Boolean(row.data[key])
}

async function notify(
  db: DbClient,
  orgId: string,
  repId: string,
  key: PreferenceKey,
  input: { type: string; title: string; body: string; link: string; dedupeKey: string },
): Promise<boolean> {
  if (!(await preferenceEnabled(db, orgId, repId, key))) return false
  return notifyOnce(db, { organizationId: orgId, recipientId: repId, ...input })
}

export interface NotificationCounts {
  newMatches: number
  savedReminders: number
  applicationActions: number
  followups: number
}

export async function notifyNewStrongMatches(db: DbClient, orgId: string, since: Date): Promise<number> {
  const rows = await db.raw!<Array<Record<string, unknown>>>(
    `select m.job_id, m.profile_id, m.category, m.score, p.rep_id, j.title, j.company
     from job_matches m
     join profiles p on p.id = m.profile_id
     join jobs j on j.id = m.job_id
     where m.organization_id = ? and m.category in ('excellent','strong') and m.created_at > ?
     order by m.created_at desc limit 200`,
    [orgId, since],
  )
  let sent = 0
  for (const row of rows.data ?? []) {
    const ok = await notify(db, orgId, String(row.rep_id), 'new_matches', {
      type: 'job_match',
      title: `New ${String(row.category)} match: ${String(row.title)}`,
      body: `${String(row.title)} at ${String(row.company ?? '')} · fit ${Number(row.score)}/100`,
      link: `/jobs/${String(row.job_id)}?profileId=${String(row.profile_id)}`,
      dedupeKey: `job-match:${String(row.job_id)}:${String(row.profile_id)}`,
    })
    if (ok) sent++
  }
  return sent
}

export async function notifySavedReminders(db: DbClient, orgId: string, now: Date): Promise<number> {
  const rows = await db.raw!<Array<Record<string, unknown>>>(
    `select s.id, s.rep_id, s.reminder_at, j.id as job_id, j.title, j.company
     from saved_jobs s join jobs j on j.id = s.job_id
     where s.organization_id = ? and s.reminder_at is not null and s.reminder_at < ? limit 200`,
    [orgId, now],
  )
  let sent = 0
  for (const row of rows.data ?? []) {
    const ok = await notify(db, orgId, String(row.rep_id), 'saved_reminders', {
      type: 'job_saved_reminder',
      title: `Reminder: ${String(row.title)}`,
      body: `${String(row.title)} at ${String(row.company ?? '')} · saved follow-up`,
      link: `/jobs/${String(row.job_id)}`,
      dedupeKey: `saved-reminder:${String(row.id)}`,
    })
    if (ok) sent++
  }
  return sent
}

export async function notifyApplicationsAwaitingAction(db: DbClient, orgId: string, now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const rows = await db.raw!<Array<Record<string, unknown>>>(
    `select a.id, a.rep_id, a.status, j.id as job_id, j.title, j.company
     from applications a join jobs j on j.id = a.job_id
     where a.organization_id = ? and a.status in ('draft','prepared')
       and a.updated_at < ? limit 200`,
    [orgId, threshold],
  )
  let sent = 0
  for (const row of rows.data ?? []) {
    const ok = await notify(db, orgId, String(row.rep_id), 'application_followups', {
      type: 'job_application_action',
      title: `Application needs attention: ${String(row.title)}`,
      body: `${String(row.title)} at ${String(row.company ?? '')} · status ${String(row.status)}`,
      link: `/jobs/${String(row.job_id)}`,
      dedupeKey: `application-action:${String(row.id)}`,
    })
    if (ok) sent++
  }
  return sent
}

export async function notifyFollowups(db: DbClient, orgId: string, now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const rows = await db.raw!<Array<Record<string, unknown>>>(
    `select a.id, a.rep_id, j.id as job_id, j.title, j.company
     from applications a join jobs j on j.id = a.job_id
     where a.organization_id = ? and a.status = 'applied'
       and a.updated_at < ? limit 200`,
    [orgId, threshold],
  )
  let sent = 0
  for (const row of rows.data ?? []) {
    const ok = await notify(db, orgId, String(row.rep_id), 'application_followups', {
      type: 'job_application_followup',
      title: `Follow up on: ${String(row.title)}`,
      body: `${String(row.title)} at ${String(row.company ?? '')} · applied 3+ days ago`,
      link: `/jobs/${String(row.job_id)}`,
      dedupeKey: `application-followup:${String(row.id)}`,
    })
    if (ok) sent++
  }
  return sent
}

export async function runJobNotifications(
  db: DbClient,
  orgId: string,
  now: Date,
  since: Date,
): Promise<NotificationCounts> {
  const [newMatches, savedReminders, applicationActions, followups] = await Promise.all([
    notifyNewStrongMatches(db, orgId, since),
    notifySavedReminders(db, orgId, now),
    notifyApplicationsAwaitingAction(db, orgId, now),
    notifyFollowups(db, orgId, now),
  ])
  return { newMatches, savedReminders, applicationActions, followups }
}
