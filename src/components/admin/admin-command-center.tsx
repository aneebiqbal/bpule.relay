'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from 'cn'

/**
 * Admin Command Center — team operational view.
 *
 * Answers: "Who needs my attention?" and "Who is working on what?"
 */

export interface CommandCenterData {
  date: string
  teamHealth: {
    working: number
    onTrack: number
    atRisk: number
    behind: number
    blocked: number
    closed: number
  }
  attentionItems: Array<{
    repId: string
    repName: string
    identityName: string
    status: string
    message: string
    remaining: number
  }>
  team: Array<{
    personId: string
    personName: string
    workingAs: string[]
    progress: string
    remaining: number
    status: string
    dayCloseStatus: string | null
  }>
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'orange'> = {
  on_track: 'success',
  at_risk: 'warning',
  behind: 'danger',
  completed: 'success',
  not_started: 'neutral',
  ready_to_close: 'info',
  missed: 'danger',
}

export function AdminCommandCenter({ data }: { data: CommandCenterData }) {
  const { teamHealth, attentionItems, team } = data

  return (
    <div className="space-y-5">
      {/* Team Health */}
      <div>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Team Today</p>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <div className="rounded border border-line bg-bone-raised px-3 py-2">
            <p className="text-[10px] text-stone">Working</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{teamHealth.working}</p>
          </div>
          <div className="rounded border border-status-success/20 bg-status-success/5 px-3 py-2">
            <p className="text-[10px] text-status-success">On Track</p>
            <p className="mt-0.5 text-[15px] font-medium text-status-success">{teamHealth.onTrack}</p>
          </div>
          <div className="rounded border border-status-warning/20 bg-status-warning/5 px-3 py-2">
            <p className="text-[10px] text-status-warning">At Risk</p>
            <p className="mt-0.5 text-[15px] font-medium text-status-warning">{teamHealth.atRisk}</p>
          </div>
          <div className="rounded border border-status-danger/20 bg-status-danger/5 px-3 py-2">
            <p className="text-[10px] text-status-danger">Behind</p>
            <p className="mt-0.5 text-[15px] font-medium text-status-danger">{teamHealth.behind}</p>
          </div>
          <div className="rounded border border-line bg-bone-raised px-3 py-2">
            <p className="text-[10px] text-stone">Blocked</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{teamHealth.blocked}</p>
          </div>
          <div className="rounded border border-line bg-bone-raised px-3 py-2">
            <p className="text-[10px] text-stone">Closed</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{teamHealth.closed}</p>
          </div>
        </div>
      </div>

      {/* Needs Attention */}
      {attentionItems.length > 0 && (
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-warning">Needs Attention</p>
          <div className="mt-2 space-y-1.5">
            {attentionItems.map((item, i) => (
              <div key={`${item.repId}-${i}`} className="flex items-center justify-between rounded border border-status-warning/20 bg-status-warning/5 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/team/${item.repId}`} className="text-[13px] font-medium text-ink hover:underline">
                      {item.repName}
                    </Link>
                    <StatusBadge status={item.status} variant={STATUS_VARIANT[item.status] ?? 'neutral'} />
                  </div>
                  <p className="mt-0.5 text-[12px] text-graphite">{item.message} — {item.identityName}</p>
                </div>
                <span className="shrink-0 text-mono-medium text-[11px] text-status-danger">{item.remaining} left</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team table */}
      <div>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Who Is Working On What</p>
        {team.length > 0 ? (
          <div className="mt-2 overflow-x-auto rounded border border-line">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line bg-bone text-left text-mono-medium text-[10px] uppercase tracking-wide text-stone">
                  <th className="px-3 py-2">Rep</th>
                  <th className="px-3 py-2">Working As</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Day Close</th>
                </tr>
              </thead>
              <tbody>
                {team.map((row) => (
                  <tr key={row.personId} className="border-b border-line/60 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-ink">
                      <Link href={`/team/${row.personId}`} className="hover:underline">{row.personName}</Link>
                    </td>
                    <td className="px-3 py-2 text-graphite">{row.workingAs.join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-graphite">{row.progress}</td>
                    <td className="px-3 py-2">
                      <span className={cn(row.remaining > 0 ? 'text-status-danger font-medium' : 'text-status-success')}>
                        {row.remaining}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} variant={STATUS_VARIANT[row.status] ?? 'neutral'} />
                    </td>
                    <td className="px-3 py-2 text-graphite">
                      {row.dayCloseStatus === 'completed' ? '✓ Closed' :
                       row.dayCloseStatus === 'completed_with_exception' ? '✓ Exception' :
                       row.dayCloseStatus === 'missed' ? '✗ Missed' :
                       row.dayCloseStatus === 'ready_to_close' ? 'Ready' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-graphite">No active operators today.</p>
        )}
      </div>
    </div>
  )
}
