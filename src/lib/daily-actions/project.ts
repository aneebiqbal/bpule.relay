/**
 * Pure projection of canonical facts into an ordered DailyAction list.
 *
 * Reads only: RepWorkspaceData (Inbox day, unified tasks, target summary,
 * profiles today, Upwork jobs) and RepCoverageView (coverage/readiness).
 * Writes nothing, counts nothing independently, and never asks a model for
 * priority — urgency comes from the explicit URGENCY_RANK contract.
 */
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import type { RepCoverageView } from '@/lib/coverage/load'
import { compareDailyActions, URGENCY_RANK, type DailyAction } from './types'

function channelLabel(channel: string | null | undefined): string {
  if (!channel) return 'Any channel'
  return channel === 'upwork' ? 'Upwork' : channel === 'linkedin' ? 'LinkedIn' : channel
}

function profileLabel(profileName: string | null | undefined, companyName: string | null | undefined): string {
  return profileName || companyName || 'Your work'
}

/** Age text from a timestamp; never a relative-to-now guess on the server. */
function ageText(from: string | null | undefined, now: number): string {
  if (!from) return 'No date set'
  const then = Date.parse(from)
  if (!Number.isFinite(then)) return 'No date set'
  const minutes = Math.max(0, Math.round((now - then) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function remainingText(remaining: number): string {
  return `${remaining} remaining`
}

export interface ProjectDailyActionsInput {
  data: RepWorkspaceData
  coverage?: RepCoverageView | null
  now?: number
  limit?: number
}

export function projectDailyActions(input: ProjectDailyActionsInput): DailyAction[] {
  const now = input.now ?? Date.now()
  const actions: DailyAction[] = []

  // Profile → channel, from the canonical coverage view. Keyed by profileId,
  // which the unified task already carries; profileToday is not populated on
  // the workspace payload and names differ between identity and profile.
  const channelByProfileId = new Map<string, string>()
  const coverageView = input.coverage ?? input.data.coverage
  if (coverageView) {
    for (const profile of [...coverageView.own, ...coverageView.covering]) {
      if (profile.channels[0]) channelByProfileId.set(profile.profileId, profile.channels[0])
    }
  }
  const channelFor = (task: { profileId?: string | null; channel?: string }): string => {
    if (task.channel) return channelLabel(task.channel)
    return channelLabel(task.profileId ? channelByProfileId.get(task.profileId) : undefined)
  }

  const tasks = input.data.unifiedTasks ?? []

  // ── Inbox + follow-ups + assigned work, from the canonical unified task list ──
  for (const task of tasks) {
    if (task.status === 'DONE' || task.status === 'CANCELLED') continue

    const channel = channelFor(task)
    const profile = task.profileName
      ? `${task.profileName} · ${channel}`
      : profileLabel(null, task.companyName)
    const id = `task:${task.id}`
    const due = task.dueAt ?? task.createdAt ?? null

    if (task.source === 'ASSIGNED') {
      const overdue = due ? Date.parse(due) < now : false
      actions.push({
        id,
        type: 'TASK',
        urgency: overdue ? 'P2' : 'P3',
        urgencyRank: URGENCY_RANK[overdue ? 'P2' : 'P3'],
        source: 'Tasks',
        profile,
        channel,
        subject: task.title,
        reason: task.reason || 'Assigned to you',
        age: ageText(due, now),
        dueAt: due,
        destination: `/tasks?task=${task.id}`,
        blocking: overdue,
        owner: 'You',
      })
      continue
    }

    if (task.kind === 'FOLLOW_UP') {
      actions.push({
        id,
        type: 'FOLLOW_UP',
        urgency: 'P3',
        urgencyRank: URGENCY_RANK.P3,
        source: 'Follow-ups',
        profile,
        channel,
        subject: task.title,
        reason: task.reason || 'Follow-up due',
        age: ageText(due, now),
        dueAt: due,
        destination: task.action?.href ?? '/tasks',
        blocking: false,
        owner: 'You',
      })
      continue
    }

    if (task.kind === 'REPLY' || task.kind === 'SEND_MESSAGE') {
      actions.push({
        id,
        type: 'INBOX_REPLY',
        urgency: 'P1',
        urgencyRank: URGENCY_RANK.P1,
        source: 'Inbox',
        profile,
        channel,
        subject: task.title,
        reason: task.reason || 'Client is waiting for your reply',
        age: ageText(due, now),
        dueAt: due,
        destination: task.action?.href ?? '/chats',
        blocking: false,
        owner: 'You',
      })
    }
  }

  // ── Target shortfall, per profile ──────────────────────────────────────────
  for (const profile of input.data.profilesToday ?? []) {
    if (profile.remaining <= 0) continue
    const label = profile.name ? `${profile.name} · ${channelLabel(profile.channels[0])}` : 'Profile'
    actions.push({
      id: `target:${profile.profileId}`,
      type: 'TARGET',
      urgency: 'P5',
      urgencyRank: URGENCY_RANK.P5,
      source: 'Targets',
      profile: label,
      channel: channelLabel(profile.channels[0]),
      subject: `${profile.remaining} of ${profile.targetCount} actions remaining`,
      reason: profile.targets
        .filter((t) => t.remaining > 0)
        .map((t) => `${t.remaining} ${t.label}`)
        .join(' · ') || 'Daily target shortfall',
      age: remainingText(profile.remaining),
      dueAt: null,
      destination: '/dashboard',
      blocking: false,
      owner: 'You',
    })
  }

  // ── Coverage exceptions and readiness blockers ─────────────────────────────
  const coverage = input.coverage ?? input.data.coverage
  if (coverage) {
    for (const profile of [...coverage.own, ...coverage.covering]) {
      const label = profile.name
        ? `${profile.name} · ${channelLabel(profile.channels[0])}`
        : 'Profile'
      if (profile.status === 'UNCOVERED' || !profile.primaryIsAvailable) {
        actions.push({
          id: `coverage:${profile.profileId}`,
          type: 'COVERAGE',
          urgency: 'P0',
          urgencyRank: URGENCY_RANK.P0,
          source: 'Coverage',
          profile: label,
          channel: channelLabel(profile.channels[0]),
          subject: profile.primaryIsAvailable
            ? 'Profile has no operator'
            : `${profile.primaryRepName ?? 'Primary'} is unavailable`,
          reason:
            profile.activeCoveringRepName
              ? `Covered by ${profile.activeCoveringRepName}`
              : profile.recommendationReasons[0] ?? 'No confirmed operator',
          age: profile.activeCoverageUntil ? `until ${profile.activeCoverageUntil}` : 'Open',
          dueAt: null,
          destination: '/team/coverage',
          blocking: true,
          owner: profile.primaryRepName ?? 'Unassigned',
        })
      }
    }

    for (const row of coverage.readiness ?? []) {
      if (row.ready) continue
      const name = (coverage.own.find((p) => p.profileId === row.profileId)?.name)
        ?? (coverage.covering.find((p) => p.profileId === row.profileId)?.name)
        ?? 'Profile'
      actions.push({
        id: `readiness:${row.profileId}`,
        type: 'READINESS',
        urgency: 'P4',
        urgencyRank: URGENCY_RANK.P4,
        source: 'Readiness',
        profile: name,
        channel: channelLabel(
          (coverage.own.find((p) => p.profileId === row.profileId)?.channels[0])
            ?? (coverage.covering.find((p) => p.profileId === row.profileId)?.channels[0]),
        ),
        subject: `${name} needs access confirmation`,
        reason: 'Profile access is not confirmed, so work cannot start',
        age: 'Open',
        dueAt: null,
        destination: '/dashboard',
        blocking: false,
        owner: 'You',
      })
    }
  }

  // ── Optional Upwork opportunities ───────────────────────────────────────────
  for (const job of input.data.upworkJobs ?? []) {
    actions.push({
      id: `upwork:${job.id}`,
      type: 'UPWORK',
      urgency: 'P6',
      urgencyRank: URGENCY_RANK.P6,
      source: 'Upwork',
      profile: job.company || 'Upwork job',
      channel: 'Upwork',
      subject: job.title,
      reason: job.fitScore != null ? `Fit ${job.fitScore}` : 'Saved opportunity',
      age: 'Saved',
      dueAt: null,
      destination: `/upwork/${job.id}`,
      blocking: false,
      owner: 'You',
    })
  }

  return actions.sort(compareDailyActions).slice(0, input.limit ?? 5)
}
