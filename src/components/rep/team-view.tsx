'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CheckCircle2, Clock, Eye, Target, Users } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'

interface TeamMember {
  repId: string
  repName: string
  role?: string
  revenueIdentities: Array<{
    identityName: string
    channel: string
    targets: Array<{
      activityType: string
      targetCount: number
      completedCount: number
      remaining: number
      status: string
    }>
  }>
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  attentionReason: string | null
}

interface TeamViewProps {
  teamName: string
  members: TeamMember[]
  isManager: boolean
}

export function TeamView({ teamName, members, isManager }: TeamViewProps) {
  const totalTarget = members.reduce((sum, m) => sum + m.totalTarget, 0)
  const totalCompleted = members.reduce((sum, m) => sum + m.totalCompleted, 0)
  const totalRemaining = members.reduce((sum, m) => sum + m.totalRemaining, 0)
  const needsAttention = members.filter((m) => m.attentionReason)

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-orange" />
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">
              {teamName}
            </p>
          </div>
          <span className="text-[11px] text-graphite">{members.length} members</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Completed</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{totalCompleted}</p>
          </div>
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Target</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{totalTarget}</p>
          </div>
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Remaining</p>
            <p className="mt-0.5 text-[15px] font-medium text-orange">{totalRemaining}</p>
          </div>
        </div>
      </section>

      {needsAttention.length > 0 && (
        <section className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-warning" />
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-warning">
              Needs Attention
            </p>
          </div>
          <div className="mt-2 space-y-1">
            {needsAttention.map((m) => (
              <div key={m.repId} className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink">{m.repName}</span>
                <span className="text-[11px] text-graphite">{m.attentionReason}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {members.length > 0 && (
        <section className="rounded-lg border border-line bg-bone-raised p-4">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Work left by person</p>
          <div className="mt-2" style={{ height: Math.max(140, members.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={members} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="repName" width={108} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--graphite)' }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bone-raised)' }}
                  formatter={(value, name) => [value ?? 0, name === 'totalCompleted' ? 'Done' : 'Left']}
                />
                <Bar dataKey="totalCompleted" stackId="day" name="Done" fill="var(--orange)" />
                <Bar dataKey="totalRemaining" stackId="day" name="Left" fill="var(--bone-200)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Team Members
        </p>
        {members.length === 0 ? (
          <p className="text-[13px] text-graphite">No team members yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <TeamMemberCard key={member.repId} member={member} isManager={isManager} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function TeamMemberCard({ member, isManager }: { member: TeamMember; isManager: boolean }) {
  const allComplete = member.totalRemaining === 0

  return (
    <div className="rounded-lg border border-line bg-bone-raised p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-ink">{member.repName}</p>
          {member.revenueIdentities.length > 0 && (
            <p className="text-[11px] text-graphite">
              {member.revenueIdentities.map((ri) => `${ri.identityName} · ${ri.channel}`).join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {allComplete ? (
            <StatusBadge status="Complete" variant="success" />
          ) : (
            <span className="text-[12px] font-medium text-orange">
              {member.totalRemaining} remaining
            </span>
          )}
        </div>
      </div>

      {member.revenueIdentities.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {member.revenueIdentities.map((ri) => (
            <div key={ri.identityName} className="flex items-center gap-2">
              <span className="text-[11px] text-graphite">{ri.identityName}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/60">
                <div
                  className={cn(
                    'h-full rounded-full',
                    ri.targets.every((t) => t.remaining === 0) ? 'bg-status-success' : 'bg-orange',
                  )}
                  style={{
                    width: `${Math.min(Math.round((ri.targets.reduce((s, t) => s + t.completedCount, 0) / Math.max(ri.targets.reduce((s, t) => s + t.targetCount, 0), 1)) * 100), 100)}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-stone">
                {ri.targets.reduce((s, t) => s + t.completedCount, 0)}/{ri.targets.reduce((s, t) => s + t.targetCount, 0)}
              </span>
            </div>
          ))}
        </div>
      )}

      {member.attentionReason && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-status-warning">
          <AlertTriangle className="size-3" />
          {member.attentionReason}
        </div>
      )}

      {isManager && (
        <div className="mt-3 flex gap-2">
          <button className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:text-ink">
            <Eye className="size-3" />
            View Work
          </button>
          <button className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:text-ink">
            <Target className="size-3" />
            Assign
          </button>
        </div>
      )}
    </div>
  )
}

export function TeamViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-8 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  )
}
