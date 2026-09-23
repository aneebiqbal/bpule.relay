'use client'

import Link from 'next/link'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from 'cn'

/**
 * Manager Team View — team oversight with drill-down.
 *
 * Prioritizes: Needs Attention → Behind → At Risk → Not Started → Ready → Closed
 */

export interface ManagerTeamData {
  date: string
  teams: Array<{
    teamId: string
    teamName: string
    members: Array<{
      personId: string
      personName: string
      workingAs: string[]
      totalCompleted: number
      totalTarget: number
      totalRemaining: number
      status: string
      dayCloseStatus: string | null
      exceptionReason: string | null
      needsAttention: boolean
      categoriesBehind: Array<{ label: string; remaining: number }>
    }>
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

function priorityRank(status: string): number {
  const ranks: Record<string, number> = {
    behind: 0,
    at_risk: 1,
    not_started: 2,
    on_track: 3,
    ready_to_close: 4,
    completed: 5,
    missed: 6,
  }
  return ranks[status] ?? 99
}

export function ManagerTeamView({ data }: { data: ManagerTeamData }) {
  return (
    <div className="space-y-6">
      {data.teams.map((team) => {
        // Sort members by priority (worst first)
        const sortedMembers = [...team.members].sort((a, b) => priorityRank(a.status) - priorityRank(b.status))
        const attentionCount = team.members.filter((m) => m.needsAttention).length

        return (
          <div key={team.teamId}>
            <div className="flex items-baseline justify-between">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
                {team.teamName}
                {attentionCount > 0 && (
                  <span className="ml-2 text-status-warning">{attentionCount} need attention</span>
                )}
              </p>
              <span className="text-[11px] text-graphite">{team.members.length} members</span>
            </div>

            {sortedMembers.length > 0 && (
              <div className="mt-3 rounded-lg border border-line bg-bone-raised p-3" style={{ height: Math.max(140, sortedMembers.length * 32 + 24) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedMembers} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="personName" width={108} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--graphite)' }} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bone-raised)' }}
                      formatter={(value, name) => [value ?? 0, name === 'totalCompleted' ? 'Done' : 'Left']}
                    />
                    <Bar dataKey="totalCompleted" stackId="day" name="Done" fill="var(--orange)" />
                    <Bar dataKey="totalRemaining" stackId="day" name="Left" fill="var(--bone-200)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {sortedMembers.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {sortedMembers.map((member) => (
                  <Link
                    key={member.personId}
                    href={`/team/${member.personId}`}
                    className={cn(
                      'block rounded border px-3 py-2.5 transition-colors hover:bg-bone-raised',
                      member.needsAttention ? 'border-status-warning/30 bg-status-warning/5' : 'border-line bg-bone-raised',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-ink">{member.personName}</span>
                        <StatusBadge status={member.status} variant={STATUS_VARIANT[member.status] ?? 'neutral'} />
                      </div>
                      <span className="text-mono-medium text-[11px] text-stone">
                        {member.totalCompleted}/{member.totalTarget}
                      </span>
                    </div>
                    {member.workingAs.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-graphite">
                        Working as: {member.workingAs.join(', ')}
                      </p>
                    )}
                    {member.categoriesBehind.length > 0 && (
                      <p className="mt-1 text-[11px] text-status-danger">
                        Remaining: {member.categoriesBehind.map((c) => `${c.remaining} ${c.label.toLowerCase()}`).join(', ')}
                      </p>
                    )}
                    {member.exceptionReason && (
                      <p className="mt-1 text-[11px] text-status-info">
                        Exception: {member.exceptionReason}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-graphite">No team members.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
