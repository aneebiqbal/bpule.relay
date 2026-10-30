import Link from 'next/link'
import { AlertTriangle, ArrowRight, Clock, Flame, Target, Users } from 'lucide-react'
import { cn } from 'cn'
import { DashHeader, EmptyNote, Meter, Panel, Pill, StatTile } from '@/components/dashboard/kit'
import { formatDuration } from '@/lib/org-clock'
import type { TeamDayRow, TeamDaySummary } from '@/lib/rep-day/team'
import type { RepDayState } from '@/lib/rep-day/state-machine'

const STATE_TONE: Record<RepDayState, 'danger' | 'orange' | 'cobalt' | 'success' | 'neutral' | 'warning'> = {
  CRITICAL: 'danger',
  AT_RISK: 'orange',
  ACTIVE: 'cobalt',
  READY_TO_CLOSE: 'success',
  CLOSED: 'neutral',
  MISSED: 'danger',
  NOT_STARTED: 'warning',
}

const STATE_LABEL: Record<RepDayState, string> = {
  CRITICAL: 'Critical',
  AT_RISK: 'At risk',
  ACTIVE: 'Active',
  READY_TO_CLOSE: 'Ready to close',
  CLOSED: 'Closed',
  MISSED: 'Missed',
  NOT_STARTED: 'Not started',
}

const FILTERS: Array<{ value: RepDayState | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'AT_RISK', label: 'At risk' },
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'READY_TO_CLOSE', label: 'Ready' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'MISSED', label: 'Missed' },
]

function clockLabel(iso: string | null, timezone: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
}

function paceLabel(row: TeamDayRow, workdayProgress: number): string {
  if (workdayProgress <= 0) return '—'
  const ratio = row.commitmentProgress / workdayProgress
  return `${Math.round(ratio * 100)}%`
}

function RepRow({ row, timezone, workdayProgress }: { row: TeamDayRow; timezone: string; workdayProgress: number }) {
  return (
    <tr className="border-b border-line/60 last:border-0 align-top">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{row.repName}</span>
          {row.lateStart && <Pill tone="warning">Late start</Pill>}
        </div>
        <p className="mt-0.5 text-[11px] text-stone">{row.repRole}</p>
      </td>
      <td className="px-4 py-3">
        <Pill tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Pill>
      </td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">{clockLabel(row.checkInAt, timezone)}</td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">{formatDuration(row.minutesRemaining)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Meter value={Math.round(row.commitmentProgress * 100)} max={100} className="w-16" />
          <span className="text-[12px] tabular-nums text-graphite">{Math.round(row.commitmentProgress * 100)}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">{paceLabel(row, workdayProgress)}</td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-ink">{row.requiredRemaining}</td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">{row.repliesWaiting}</td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">{row.pipelineCreated}</td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">{clockLabel(row.lastActivityAt, timezone)}</td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/admin/command/${row.repId}`}
          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
        >
          Open rep day
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  )
}

function RepCard({ row, timezone, workdayProgress }: { row: TeamDayRow; timezone: string; workdayProgress: number }) {
  return (
    <Link
      href={`/admin/command/${row.repId}`}
      aria-label={`Open rep day for ${row.repName}`}
      className="block rounded-lg border border-line bg-bone-raised p-3 transition-colors hover:border-ink/20"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{row.repName}</p>
          <p className="text-[11px] text-stone">
            {clockLabel(row.checkInAt, timezone)} · {formatDuration(row.minutesRemaining)} left
          </p>
        </div>
        <Pill tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Pill>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Meter value={Math.round(row.commitmentProgress * 100)} max={100} className="flex-1" />
        <span className="text-[12px] tabular-nums text-graphite">{Math.round(row.commitmentProgress * 100)}%</span>
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-stone">Remaining</dt>
          <dd className="tabular-nums text-ink">{row.requiredRemaining}</dd>
        </div>
        <div>
          <dt className="text-stone">Replies</dt>
          <dd className="tabular-nums text-ink">{row.repliesWaiting}</dd>
        </div>
        <div>
          <dt className="text-stone">Pace</dt>
          <dd className="tabular-nums text-ink">{paceLabel(row, workdayProgress)}</dd>
        </div>
      </dl>
    </Link>
  )
}

export function CommandCentre({
  team,
  activeFilter,
}: {
  team: TeamDaySummary
  activeFilter: RepDayState | 'ALL'
}) {
  const rows = activeFilter === 'ALL' ? team.reps : team.reps.filter((row) => row.state === activeFilter)

  return (
    <div className="space-y-6">
      <DashHeader
        eyebrow={`Command · ${team.businessDate}`}
        title="Today"
        subtitle={
          team.isWorkingDay
            ? `${team.workdayStart}–${team.workdayEnd} ${team.timezone} · ${formatDuration(team.minutesRemaining)} remaining`
            : `Not a working day · ${team.timezone}`
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Not started" value={team.counts.NOT_STARTED} tone={team.counts.NOT_STARTED > 0 ? 'warning' : 'neutral'} icon={<Clock className="size-3.5" />} sub="No check-in" />
        <StatTile label="Active" value={team.counts.ACTIVE} tone="cobalt" icon={<Users className="size-3.5" />} sub="On pace" />
        <StatTile label="At risk" value={team.counts.AT_RISK} tone={team.counts.AT_RISK > 0 ? 'orange' : 'neutral'} icon={<AlertTriangle className="size-3.5" />} sub="Behind pace" />
        <StatTile label="Critical" value={team.counts.CRITICAL} tone={team.counts.CRITICAL > 0 ? 'danger' : 'neutral'} icon={<Flame className="size-3.5" />} sub="Escalated" />
        <StatTile label="Ready to close" value={team.counts.READY_TO_CLOSE} tone="success" icon={<Target className="size-3.5" />} sub="Work complete" />
        <StatTile label="Closed" value={team.counts.CLOSED} tone="neutral" sub="Day closed" />
        <StatTile label="Missed" value={team.counts.MISSED} tone={team.counts.MISSED > 0 ? 'danger' : 'neutral'} sub="Ended incomplete" />
        <StatTile label="Pipeline created" value={team.totals.pipelineCreated} tone="cobalt" sub="Leads today" />
        <StatTile label="Replies waiting" value={team.totals.repliesWaiting} tone={team.totals.repliesWaiting > 0 ? 'orange' : 'neutral'} sub="Buyers waiting" />
      </div>

      <Panel
        title="Team"
        subtitle={`${team.reps.length} ${team.reps.length === 1 ? 'rep' : 'reps'} · ${team.totals.requiredRemaining} actions remaining`}
        flush
      >
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
          {FILTERS.map((filter) => {
            const href = filter.value === 'ALL' ? '/admin/command' : `/admin/command?state=${filter.value}`
            const active = filter.value === activeFilter
            return (
              <Link
                key={filter.value}
                href={href}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  active ? 'bg-solid text-on-solid' : 'text-graphite hover:bg-bone',
                )}
              >
                {filter.label}
              </Link>
            )
          })}
        </div>

        {rows.length === 0 ? (
          <EmptyNote>
            {team.reps.length === 0
              ? 'No reps are visible to you in this organization.'
              : 'No reps in this state right now.'}
          </EmptyNote>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-stone">
                    <th className="px-4 py-2 font-medium">Rep</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Check-in</th>
                    <th className="px-4 py-2 font-medium">Left</th>
                    <th className="px-4 py-2 font-medium">Commitment</th>
                    <th className="px-4 py-2 font-medium">Pace</th>
                    <th className="px-4 py-2 font-medium">Required</th>
                    <th className="px-4 py-2 font-medium">Replies</th>
                    <th className="px-4 py-2 font-medium">Pipeline</th>
                    <th className="px-4 py-2 font-medium">Last activity</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <RepRow key={row.repId} row={row} timezone={team.timezone} workdayProgress={team.workdayProgress} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 p-3 md:hidden">
              {rows.map((row) => (
                <RepCard key={row.repId} row={row} timezone={team.timezone} workdayProgress={team.workdayProgress} />
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}
