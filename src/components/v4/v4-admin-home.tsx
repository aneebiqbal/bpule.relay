'use client'

/**
 * Relay V4 — Admin / Owner Command Center.
 *
 * An operating cockpit, not an analytics report. The page answers, in order:
 * today, what needs my attention, who is working, which profiles are behind,
 * coverage exceptions, and what moved since yesterday. Deep people, profile and
 * analytics surfaces live in Team / Profiles / Reports / Coverage.
 *
 * Every value is canonical. A failed section degrades on its own.
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { formatDuration } from '@/lib/org-clock'
import type { AdminCommandCenterData } from '@/lib/team/admin-command-summary'
import {
  PROFILE_STATUS_LABEL,
  PROFILE_STATUS_TONE,
  REP_STATE_TONE,
  buildAdminMovementRows,
  buildAdminProfileExecutionRows,
  buildAdminTeamOperationRows,
  buildAdminV3Attention,
  buildAdminV3Pipeline,
} from '@/lib/admin/v3-command-present'
import { V3StageStrip } from '@/components/v3/primitives'
import {
  V4Avatar,
  V4Chip,
  V4Empty,
  V4PageHeader,
  V4Panel,
  V4PanelHeader,
} from '@/components/v4/primitives'
import { AdminCoveragePanel } from '@/components/coverage/admin-coverage-panel'
import type { CoverageStatusView } from '@/lib/coverage/load'

const ATTENTION_TONE = {
  critical: 'danger',
  attention: 'warning',
  normal: 'success',
} as const

/** Darker status text tones that clear AA on the bone surface. */
const FACT_TONE = {
  danger: 'text-[#8f2b1e]',
  warning: 'text-[#7d5410]',
  success: 'text-[#256b4a]',
  info: 'text-[#2f48b8]',
  neutral: 'text-ink',
} as const

function dateLabel(businessDate: string): string {
  if (!businessDate) return 'Today'
  const date = new Date(`${businessDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return 'Today'
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function pct(done: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.round((done / target) * 100))
}

function ProgressBar({ value, tone = 'bg-ink', label }: { value: number; tone?: string; label: string }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-bone"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', tone)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function Fact({
  label,
  value,
  hint,
  tone = 'text-ink',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: string
}) {
  return (
    <div className="rounded-xl bg-bone px-3 py-2.5 ring-1 ring-line/70">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">{label}</p>
      <p className={cn('mt-1 text-[18px] font-medium leading-none tabular-nums', tone)}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-stone">{hint}</p>}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="whitespace-nowrap text-[10px] text-graphite">
      <span className="font-medium tabular-nums text-ink">{value}</span> {label}
    </span>
  )
}

export function V4AdminHome({
  data,
  adminName,
  error,
  greeting,
  coverage,
}: {
  data: AdminCommandCenterData
  adminName: string
  error?: boolean
  /** Server-computed in the viewer's timezone so SSR and hydration agree. */
  greeting: string
  /** Daily coverage: team status, profile coverage, exceptions. */
  coverage?: CoverageStatusView | null
}) {
  const teamDay = data.teamDay
  const attention = useMemo(() => buildAdminV3Attention(data.attention), [data.attention])
  const pipeline = useMemo(() => buildAdminV3Pipeline(data.pipeline), [data.pipeline])
  const profileRows = useMemo(
    () => buildAdminProfileExecutionRows(data.profileExecution),
    [data.profileExecution],
  )
  const teamRows = useMemo(
    () => buildAdminTeamOperationRows(data.rows, data.teamDay),
    [data.rows, data.teamDay],
  )
  const movementRows = useMemo(
    () => buildAdminMovementRows(data.movement, data.yesterday, data.teamCompleted),
    [data.movement, data.yesterday, data.teamCompleted],
  )

  const counts = teamDay.counts
  const started = counts.ACTIVE + counts.AT_RISK + counts.CRITICAL + counts.READY_TO_CLOSE + counts.CLOSED
  const behind = counts.AT_RISK + counts.CRITICAL
  const notStarted = counts.NOT_STARTED + counts.MISSED
  const profilesComplete = profileRows.filter((row) => row.status === 'COMPLETE').length
  const profilesNotStarted = profileRows.filter((row) => row.status === 'NOT_STARTED').length
  const profilesBehind = profileRows.filter(
    (row) => row.status === 'BEHIND' || row.status === 'AT_RISK',
  ).length
  const overdueWork = data.health.overdueTasks + data.health.followUpsOverdue
  const teamPct = pct(data.teamCompleted, data.teamTarget)
  const coverageSummary = coverage?.summary
  const repsWithOverdueWork = data.rows.filter((row) => row.overdueTasks > 0).length
  const workingDay = teamDay.isWorkingDay
    ? `${teamDay.workdayStart}–${teamDay.workdayEnd} ${teamDay.timezone} · ${formatDuration(teamDay.minutesRemaining)} remaining`
    : `Not a working day · ${teamDay.timezone}`

  return (
    <div className="space-y-5">
      <V4PageHeader
        eyebrow={`Today · ${dateLabel(teamDay.businessDate)}`}
        title="Command Center"
        subtitle={data.orgName}
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[13px] text-graphite">
              Good <span>{greeting}</span>, {adminName.split(' ')[0]}.{' '}
              <span className="font-medium text-ink">{data.teamCompleted} actions completed</span> today.
            </p>
            {data.unassignedProfiles ? (
              <Link
                href="/team/profiles?view=unassigned"
                className="text-[12px] font-medium text-status-warning hover:underline"
              >
                {data.unassignedProfiles} profile{data.unassignedProfiles === 1 ? '' : 's'} unassigned
              </Link>
            ) : null}
            {data.upworkCoverage && data.upworkCoverage.repsWithoutUpwork > 0 ? (
              <Link
                href="/team/profiles"
                className="text-[12px] font-medium text-status-warning hover:underline"
              >
                {data.upworkCoverage.repsWithoutUpwork} rep{data.upworkCoverage.repsWithoutUpwork === 1 ? '' : 's'} missing an Upwork profile
              </Link>
            ) : null}
          </div>
        }
        actions={
          <>
            <Link
              href="/prospect"
              className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              Analyze Prospect
            </Link>
            <Link
              href="/tasks?assign=1"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Assign Task
            </Link>
            <Link
              href="/team/profiles?add=1"
              className="hidden items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone sm:inline-flex"
            >
              Add Profile
            </Link>
            <Link
              href="/admin/people"
              className="hidden items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone sm:inline-flex"
            >
              Invite Person
            </Link>
          </>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
          Some organization data could not be loaded. Today, attention, team and profiles below are still available.
        </div>
      )}

      {/* TODAY — the operating day in one surface. */}
      <section aria-label="Today">
        <V4Panel>
          <V4PanelHeader
            eyebrow={`Today · ${dateLabel(teamDay.businessDate)}`}
            title="Team progress"
            hint={workingDay}
          />
          <div className="mt-4 grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[40px] font-light leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {data.teamTarget > 0 ? data.teamCompleted : '—'}
                </span>
                {data.teamTarget > 0 && (
                  <span className="text-[15px] text-stone tabular-nums">/ {data.teamTarget} expected</span>
                )}
                <span className="ml-auto text-[15px] font-medium tabular-nums text-ink">
                  {data.teamTarget > 0 ? `${teamPct}%` : 'No target set'}
                </span>
              </div>
              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-bone"
                role="progressbar"
                aria-valuenow={teamPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Team progress today"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                    teamPct >= 100 ? 'bg-status-success' : 'bg-orange',
                  )}
                  style={{ width: `${teamPct}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-graphite">
                {data.teamTarget > 0
                  ? `${data.teamCompleted} of ${data.teamTarget} expected actions completed · ${Math.max(0, data.teamTarget - data.teamCompleted)} remaining`
                  : 'Assign daily targets to track today’s progress.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-graphite">
                <span className="text-stone">New today:</span>
                <Link href="/leads?filter=new" className="font-medium text-ink hover:underline">
                  {data.movement.newLeadsToday} leads
                </Link>
                <Link href="/leads?filter=new" className="font-medium text-ink hover:underline">
                  {data.movement.qualifiedToday} qualified
                </Link>
                <Link href="/reports/sales" className="font-medium text-ink hover:underline">
                  {data.movement.meetingsToday} meetings
                </Link>
                <Link href="/leads?filter=won" className="font-medium text-ink hover:underline">
                  {data.movement.winsToday} wins
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-graphite">
                <span className="text-stone">Team status:</span>
                <span>
                  <span className="font-medium tabular-nums text-ink">{coverageSummary?.working ?? 0}</span> working
                </span>
                <span>
                  <span className="font-medium tabular-nums text-ink">{coverageSummary?.onLeave ?? 0}</span> on leave
                </span>
                <span>
                  <span className="font-medium tabular-nums text-ink">{coverageSummary?.offline ?? 0}</span> unavailable
                </span>
                <span>
                  <span className="font-medium tabular-nums text-ink">{counts.NOT_STARTED + counts.MISSED}</span> not started
                </span>
                <Link href="/team" className="font-medium text-ink hover:underline">
                  Team details
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="grid grid-cols-2 gap-2.5">
                <Fact
                  label="Reps"
                  value={`${started} started`}
                  hint={`${behind} behind · ${notStarted} not started`}
                  tone={behind > 0 ? FACT_TONE.warning : FACT_TONE.neutral}
                />
                <Fact
                  label="Profiles"
                  value={`${profilesComplete} / ${profileRows.length}`}
                  hint={`${profilesNotStarted} not started · ${profilesBehind} behind`}
                  tone={profilesBehind > 0 ? FACT_TONE.warning : FACT_TONE.neutral}
                />
                <Fact
                  label="Replies waiting"
                  value={data.health.repliesWaiting}
                  hint={data.health.repliesCritical > 0 ? `${data.health.repliesCritical} critical` : 'Org-wide'}
                  tone={data.health.repliesCritical > 0 ? FACT_TONE.danger : data.health.repliesWaiting > 0 ? FACT_TONE.warning : FACT_TONE.neutral}
                />
                <Fact
                  label="Overdue work"
                  value={overdueWork}
                  hint={`${data.health.overdueTasks} tasks · ${data.health.followUpsOverdue} follow-ups`}
                  tone={overdueWork > 0 ? FACT_TONE.danger : FACT_TONE.neutral}
                />
              </div>
            </div>
          </div>
        </V4Panel>
      </section>

      {/* ATTENTION — the strongest block on the page. */}
      <section aria-label="Needs intervention">
        <V4Panel>
          <V4PanelHeader
            eyebrow="Attention"
            title="Needs my intervention"
            hint={`${data.attention.length} signals`}
            action={
              <Link href="/admin/command" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                All <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {attention.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {attention.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    className="flex h-full items-start gap-3 rounded-xl bg-bone px-3 py-3 ring-1 ring-line/70 transition-colors hover:bg-bone-raised"
                  >
                    <V4Avatar name={row.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[13px] font-medium text-ink">{row.name}</p>
                        <V4Chip tone={ATTENTION_TONE[row.severity]}>{row.severity}</V4Chip>
                      </div>
                      {row.subject && <p className="mt-0.5 truncate text-[11px] text-stone">{row.subject}</p>}
                      <p className="mt-0.5 text-[12px] text-graphite">{row.reason}</p>
                    </div>
                    <span className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink">
                      {row.ctaLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4">
              <V4Empty
                title="Organization is on track"
                body="No critical replies, follow-ups, overdue work or profile exceptions need intervention right now."
              />
            </div>
          )}
        </V4Panel>
      </section>

      {/* TEAM + PROFILES — the two operational views. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Team"
              title="Who is working"
              hint={`${teamRows.length} reps · ${data.teamDay.totals.requiredRemaining} required actions left`}
              action={
                <Link href="/team" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Team overview <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {(data.health.overdueTasks > 0 || repsWithOverdueWork > 0) && (
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-bone px-3 py-2.5 text-[12px] text-graphite ring-1 ring-line/70">
                <span>
                  <span className="font-medium tabular-nums text-ink">{data.health.overdueTasks}</span> overdue task
                  {data.health.overdueTasks === 1 ? '' : 's'}
                </span>
                <span className="text-stone">·</span>
                <span>
                  <span className="font-medium tabular-nums text-ink">{repsWithOverdueWork}</span> rep
                  {repsWithOverdueWork === 1 ? '' : 's'} with overdue work
                </span>
                <Link href="/tasks?scope=team" className="ml-auto font-medium text-ink hover:underline">
                  Open team work
                </Link>
              </div>
            )}

            {teamRows.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {teamRows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-bone sm:flex-row sm:items-center sm:gap-2"
                    >
                      <div className="flex items-center gap-3 sm:w-28 lg:w-36 sm:shrink-0">
                        <V4Avatar name={row.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
                          <p className="truncate text-[11px] text-stone">
                            {row.assignedProfiles.slice(0, 2).join(', ') || 'No profile assigned'}
                          </p>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between text-[10px] text-stone">
                          <span>Today</span>
                          <span className="tabular-nums text-ink">
                            {row.completedToday}
                            {row.targetCount > 0 ? ` / ${row.targetCount}` : ''}
                          </span>
                        </div>
                        <div className="mt-1">
                          <ProgressBar value={row.targetPct} label={`${row.name}'s progress today`} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:w-40 sm:shrink-0 sm:justify-end">
                        <MiniStat label="left" value={row.requiredRemaining} />
                        <MiniStat label="replies" value={row.repliesWaiting} />
                        <MiniStat label="overdue" value={row.overdue} />
                      </div>
                      <V4Chip tone={REP_STATE_TONE[row.state]} className="self-start sm:self-center">
                        {row.stateLabel}
                      </V4Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl px-4 py-6 text-[13px] text-graphite ring-1 ring-line">
                No reps are visible to you in this organization.
              </p>
            )}
          </V4Panel>
        </div>

        <div className="xl:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Profiles"
              title="Profile execution"
              hint={`${profilesComplete} of ${profileRows.length} complete`}
              action={
                <Link href="/team/profiles" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  View all profiles <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {profileRows.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {profileRows.slice(0, 5).map((row) => (
                  <li key={row.profileId}>
                    <Link
                      href={`/team/profiles/${row.profileId}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
                          {row.channels.map((channel) => (
                            <span key={channel} className="text-[10px] text-stone">
                              {channel}
                            </span>
                          ))}
                        </div>
                        <p className="truncate text-[11px] text-stone">
                          {row.assignedReps.join(', ') || 'Unassigned'}
                        </p>
                      </div>
                      <div className="w-24 shrink-0 sm:w-28">
                        <div className="flex items-baseline justify-between text-[10px] text-stone">
                          <span>Today</span>
                          <span className="tabular-nums text-ink">
                            {row.completedCount} / {row.targetCount}
                          </span>
                        </div>
                        <div className="mt-1">
                          <ProgressBar value={pct(row.completedCount, row.targetCount)} label={`${row.name}'s progress today`} />
                        </div>
                      </div>
                      {row.status ? (
                        <V4Chip tone={PROFILE_STATUS_TONE[row.status]}>{PROFILE_STATUS_LABEL[row.status]}</V4Chip>
                      ) : (
                        <V4Chip tone="neutral">No target</V4Chip>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl px-4 py-6 text-[13px] text-graphite ring-1 ring-line">
                No assigned profiles yet.
              </p>
            )}
          </V4Panel>
        </div>
      </div>

      {/* COVERAGE — exception-first autopilot. */}
      <section aria-label="Coverage">
        <AdminCoveragePanel status={coverage} businessDate={teamDay.businessDate} />
      </section>

      {/* MOVEMENT + PIPELINE. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Movement"
              title="Today vs yesterday"
              hint="Yesterday is the final count; today is in progress"
              action={
                <Link href="/reports/sales" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Reports <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-line">
              <div className="flex items-center gap-3 border-b border-line/70 bg-bone px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">
                <span className="min-w-0 flex-1">Metric</span>
                <span className="w-12 text-right">Today</span>
                <span className="w-12 text-right">Yesterday</span>
                <span className="w-14 text-right">Delta</span>
              </div>
              <ul className="divide-y divide-line/70">
                {movementRows.slice(0, 5).map((row) => (
                  <li key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{row.label}</span>
                    <span className="w-12 text-right text-[13px] tabular-nums text-ink">{row.today}</span>
                    <span className="w-12 text-right text-[12px] tabular-nums text-stone">{row.yesterday ?? '—'}</span>
                    <span
                      className={cn(
                        'w-14 text-right text-[12px] font-medium tabular-nums',
                        row.delta == null ? 'text-stone' : row.delta > 0 ? FACT_TONE.success : row.delta < 0 ? FACT_TONE.danger : 'text-stone',
                      )}
                    >
                      {row.delta == null ? '—' : row.delta > 0 ? `+${row.delta}` : row.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </V4Panel>
        </div>

        <div className="xl:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Pipeline"
              title="Open opportunities"
              hint="By stage"
              action={
                <Link href="/leads?view=pipeline" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Pipeline <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-4">
              <V3StageStrip stages={pipeline} compact />
            </div>
          </V4Panel>
        </div>
      </div>
    </div>
  )
}
