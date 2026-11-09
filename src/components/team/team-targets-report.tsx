import Link from 'next/link'
import { cn } from 'cn'
import { InlineError, LinkTabs, Section } from '@/components/operations/ops-primitives'
import { assignableReps, getPeopleDirectory, requireTeamContext } from '@/lib/operations/page-context'
import { getDatabaseCapabilities, NOT_AVAILABLE_MESSAGE } from '@/lib/operations/capabilities'
import { filterRepIdsToScope } from '@/lib/operations/scope'
import { opsHref, rangeWindow } from '@/lib/operations/filters'
import {
  PERIODS,
  TARGET_TYPES,
  loadTargets,
  type TargetCell,
  type TargetOwnerRow,
  type TargetPeriod,
} from '@/lib/operations/targets'

const STATUS_LABEL = { met: 'Met', on_track: 'On track', at_risk: 'At risk', no_target: 'No target' } as const
const STATUS_CLASS = { met: 'text-status-success', on_track: 'text-graphite', at_risk: 'text-status-warning', no_target: 'text-stone' } as const

/**
 * Target progress — a Performance view, never a competing configuration page.
 * Progress counts executed events only; goals are edited in Admin → Daily
 * Targets or Profile → Channel.
 */
export async function TeamTargetsReport({ period }: { period: TargetPeriod }) {
  const ctx = await requireTeamContext()
  const periodMeta = PERIODS.find((p) => p.value === period)!
  const window = rangeWindow(periodMeta.range)
  const elapsedShare =
    period === 'DAY' ? Math.min(1, (Date.now() - Date.parse(window.start)) / 86_400_000) : 1

  const [reps, directory, capabilities] = await Promise.all([
    assignableReps(ctx),
    getPeopleDirectory().catch(() => null),
    getDatabaseCapabilities(ctx.client),
  ])
  const teams = (directory?.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    memberIds: filterRepIdsToScope(ctx.scope, t.memberIds),
  }))

  const data = capabilities.targets
    ? await loadTargets(ctx.client, { orgId: ctx.auth.orgId, reps, teams, period, window, elapsedShare }).catch((err) => {
        console.error('targets failed:', err)
        return null
      })
    : null

  const drill = (row: TargetOwnerRow, cell: TargetCell) => {
    const event = TARGET_TYPES.find((t) => t.type === cell.type)!.activityEvent
    return row.kind === 'rep'
      ? opsHref('/reports/activity', { range: periodMeta.range, rep: row.ownerId, event })
      : opsHref('/reports/activity', { range: periodMeta.range, team: row.ownerId, event })
  }

  return (
    <div className="space-y-5">
      <LinkTabs
        label="Target period"
        active={period}
        tabs={PERIODS.map((p) => ({
          value: p.value,
          label: p.label,
          href: opsHref('/team/performance', { view: 'targets', period: p.value === 'DAY' ? null : p.value }),
        }))}
      />

      {!capabilities.targets ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-graphite">
          Targets: {NOT_AVAILABLE_MESSAGE}.
        </p>
      ) : !data ? (
        <InlineError>Targets could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          {teams.length > 0 && (
            <Section title="Teams" description="Sum of members' goals and executed events.">
              <TargetTable rows={data.teams} drill={drill} />
            </Section>
          )}
          <Section title="People" description="Progress = executed events only. Drafts, generated copy and failed sends never count.">
            <TargetTable rows={data.reps} drill={drill} />
          </Section>
          <div className="space-y-1 text-[12px] text-graphite">
            {period !== 'DAY' && <p>Week / month goals are derived: daily target × {periodMeta.workingDays} working days.</p>}
            {data.ignoredActivityTypes.length > 0 && (
              <p>Not canonical targets (not shown): {data.ignoredActivityTypes.join(', ')}.</p>
            )}
            <p>Target editing lives in Admin → Daily Targets and Profile → Channel.</p>
            {data.truncated && <p className="text-status-warning">Event read limit reached; progress may be incomplete for this period.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function TargetTable({ rows, drill }: { rows: TargetOwnerRow[]; drill: (row: TargetOwnerRow, cell: TargetCell) => string }) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-graphite">No one in scope.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Target progress by owner and target type</caption>
        <thead className="bg-bone-raised text-[11px] uppercase tracking-[0.06em] text-stone">
          <tr>
            <th scope="col" className="sticky left-0 bg-bone-raised px-3 py-2 font-medium">Owner</th>
            {TARGET_TYPES.map((t) => (
              <th key={t.type} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ownerId} className="border-t border-line/70 align-top">
              <th scope="row" className="sticky left-0 bg-bone px-3 py-2 font-medium text-ink">
                {row.kind === 'rep' ? (
                  <Link href={`/team/${row.ownerId}`} className="hover:underline">
                    {row.ownerName}
                  </Link>
                ) : (
                  <Link href={`/team/groups/${row.ownerId}`} className="hover:underline">
                    {row.ownerName}
                  </Link>
                )}
              </th>
              {row.cells.map((cell) => (
                <td key={cell.type} className="px-3 py-2 text-right">
                  <Link
                    href={drill(row, cell)}
                    className="tabular-nums text-ink underline-offset-2 hover:underline"
                    aria-label={`${cell.progress}${cell.goal !== null ? ` of ${cell.goal}` : ''} ${TARGET_TYPES.find((t) => t.type === cell.type)!.label} — open the events`}
                  >
                    {cell.progress}
                    {cell.goal !== null && <span className="text-stone"> / {cell.goal}</span>}
                  </Link>
                  <div className={cn('text-[11px]', STATUS_CLASS[cell.status])}>
                    {STATUS_LABEL[cell.status]}
                    {cell.remaining !== null && cell.remaining > 0 && <span className="text-stone"> · {cell.remaining} left</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
