import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getAuthContext } from '@/lib/auth/organization'
import { loadRepDayDetail } from '@/lib/rep-day/team'
import { formatDuration } from '@/lib/org-clock'
import { repDayStateLabel, type RepDayState } from '@/lib/rep-day/state-machine'
import { DashHeader, EmptyNote, Meter, Panel, Pill } from '@/components/dashboard/kit'

export const dynamic = 'force-dynamic'

const STATE_TONE: Record<RepDayState, 'danger' | 'orange' | 'cobalt' | 'success' | 'neutral' | 'warning'> = {
  CRITICAL: 'danger',
  AT_RISK: 'orange',
  ACTIVE: 'cobalt',
  READY_TO_CLOSE: 'success',
  CLOSED: 'neutral',
  MISSED: 'danger',
  NOT_STARTED: 'warning',
}

function clockLabel(iso: string | null, timezone: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
}

export default async function RepDayPage({ params }: { params: Promise<{ repId: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  const { repId } = await params
  let detail
  try {
    detail = await loadRepDayDetail(repId)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Forbidden' || message === 'Not found') notFound()
    throw error
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/command"
        className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Command
      </Link>

      <DashHeader
        eyebrow={`${detail.businessDate} · ${detail.timezone}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {detail.repName}
            <Pill tone={STATE_TONE[detail.state]}>{repDayStateLabel(detail.state)}</Pill>
          </span>
        }
        subtitle={`${formatDuration(detail.minutesRemaining)} remaining · ${detail.requiredRemaining} required actions outstanding`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Today" className="lg:col-span-2">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Meter value={Math.round(detail.commitmentProgress * 100)} max={100} className="flex-1" />
              <span className="text-[13px] tabular-nums text-ink">{Math.round(detail.commitmentProgress * 100)}%</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
              <div>
                <dt className="text-stone">Check-in</dt>
                <dd className="tabular-nums text-ink">{clockLabel(detail.checkInAt, detail.timezone)}</dd>
              </div>
              <div>
                <dt className="text-stone">Closed</dt>
                <dd className="tabular-nums text-ink">{clockLabel(detail.closedAt, detail.timezone)}</dd>
              </div>
              <div>
                <dt className="text-stone">Actions today</dt>
                <dd className="tabular-nums text-ink">{detail.actionsToday}</dd>
              </div>
              <div>
                <dt className="text-stone">Pipeline created</dt>
                <dd className="tabular-nums text-ink">{detail.pipelineCreated}</dd>
              </div>
              <div>
                <dt className="text-stone">Replies waiting</dt>
                <dd className="tabular-nums text-ink">{detail.repliesWaiting}</dd>
              </div>
              <div>
                <dt className="text-stone">Last activity</dt>
                <dd className="tabular-nums text-ink">{clockLabel(detail.lastActivityAt, detail.timezone)}</dd>
              </div>
              <div>
                <dt className="text-stone">Exception</dt>
                <dd className="text-ink">{detail.exceptionState === 'NONE' ? '—' : detail.exceptionState.toLowerCase()}</dd>
              </div>
              <div>
                <dt className="text-stone">Remaining</dt>
                <dd className="tabular-nums text-ink">{detail.requiredRemaining}</dd>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel title="Source identities" subtitle={`${detail.identities.length} assigned`}>
          {detail.identities.length === 0 ? (
            <EmptyNote>No revenue identity assigned.</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {detail.identities.map((identity) => (
                <li key={identity.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate text-ink">{identity.name}</span>
                  <Pill>{identity.channel}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Daily targets" subtitle="Completed against the configured target" flush>
        {detail.targets.length === 0 ? (
          <EmptyNote>No targets configured for this rep.</EmptyNote>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-stone">
                <th className="px-4 py-2 font-medium">Activity</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Completed</th>
                <th className="px-4 py-2 font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {detail.targets.map((target) => (
                <tr key={target.activityType} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 text-[12px] text-ink">{target.activityType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5 text-[12px] tabular-nums text-graphite">{target.target}</td>
                  <td className="px-4 py-2.5 text-[12px] tabular-nums text-graphite">{target.completed}</td>
                  <td className="px-4 py-2.5 text-[12px] tabular-nums text-ink">{target.remaining}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[12px] font-medium text-ink">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 tabular-nums">{detail.totals.target}</td>
                <td className="px-4 py-2.5 tabular-nums">{detail.totals.completed}</td>
                <td className="px-4 py-2.5 tabular-nums">{detail.totals.remaining}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Warnings today" subtitle="What the worker sent this rep">
          {detail.warnings.length === 0 ? (
            <EmptyNote>No warnings sent today.</EmptyNote>
          ) : (
            <ul className="space-y-2.5">
              {detail.warnings.map((warning) => (
                <li key={`${warning.type}-${warning.createdAt}`} className="rounded-md border border-line bg-bone px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink">{warning.title}</span>
                    <span className="text-[11px] tabular-nums text-stone">{clockLabel(warning.createdAt, detail.timezone)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-graphite">{warning.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Exception and shortfall" subtitle="Recorded, never erased">
          <div className="space-y-3 text-[12px]">
            <div>
              <p className="text-stone">Exception state</p>
              <p className="text-ink">{detail.exceptionState}</p>
              {detail.exceptionReason && <p className="mt-0.5 text-graphite">{detail.exceptionReason}</p>}
              {detail.exceptionNote && <p className="mt-0.5 text-graphite">{detail.exceptionNote}</p>}
            </div>
            <div>
              <p className="text-stone">Shortfall</p>
              {Object.keys(detail.shortfall).length === 0 ? (
                <p className="text-graphite">None recorded.</p>
              ) : (
                <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-bone p-2 text-[11px] text-graphite">
                  {JSON.stringify(detail.shortfall, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
