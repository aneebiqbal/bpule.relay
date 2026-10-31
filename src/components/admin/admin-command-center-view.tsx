'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, Settings, Users } from 'lucide-react'
import { cn } from 'cn'
import type { AdminCommandCenterData } from '@/lib/team/admin-command-summary'
import type { AttentionSeverity } from '@/lib/team/attention-policy'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function severityClass(severity: AttentionSeverity | string) {
  if (severity === 'critical' || severity === 'Critical') {
    return 'bg-status-danger/10 text-status-danger'
  }
  if (severity === 'attention' || severity === 'Attention') {
    return 'bg-status-warning/10 text-status-warning'
  }
  return 'bg-status-success/10 text-status-success'
}

export function AdminCommandCenterView({
  data,
  adminName,
  error,
}: {
  data: AdminCommandCenterData
  adminName: string
  error?: boolean
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'Critical' | 'Attention' | 'On track'>('all')

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return data.rows
    return data.rows.filter((r) => r.status === statusFilter)
  }, [data.rows, statusFilter])

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-[28px] font-light tracking-[-0.02em] text-ink">
            Good {greeting()}, {adminName.split(' ')[0]}
          </h1>
          <p className="text-[15px] font-medium text-ink">{data.orgName}</p>
          <p className="text-[13px] text-graphite">Revenue Operations Command Center</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.isOwner && (
            <>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
              >
                <Settings className="size-3.5" aria-hidden />
                Organization settings
              </Link>
              <Link
                href="/admin/people"
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
              >
                <Users className="size-3.5" aria-hidden />
                People & permissions
              </Link>
            </>
          )}
          <Link
            href="/admin/command"
            className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
          >
            Day command
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
          Some organization data could not load. Refresh to retry.
        </div>
      )}

      {/* Organization health */}
      <section aria-label="Organization health" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Active opportunities"
          value={data.health.activeOpportunities}
          hint="Non-terminal open leads"
          href="/leads"
        />
        <MetricCard
          label="Replies waiting"
          value={data.health.repliesWaiting}
          hint={
            data.health.repliesCritical > 0
              ? `${data.health.repliesCritical} critical`
              : 'Org-wide'
          }
          href="/chats"
          tone={data.health.repliesWaiting > 0 ? 'warn' : undefined}
        />
        <MetricCard
          label="Overdue follow-ups"
          value={data.health.followUpsOverdue}
          hint="Team scope"
          href="/leads?filter=followup"
          tone={data.health.followUpsOverdue > 0 ? 'warn' : undefined}
        />
        <MetricCard
          label="Meetings this week"
          value={data.health.meetingsThisWeek}
          hint="Meaningful events"
        />
        <MetricCard label="Wins" value={data.health.wins} hint="This week + today" href="/leads?filter=won" />
      </section>

      {/* Attention required */}
      <section aria-label="Attention required" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[18px] font-medium text-ink">Attention required</h2>
          <p className="text-[12px] text-graphite">{data.attention.length} signals</p>
        </div>
        {data.attention.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-line bg-bone-raised px-6 py-8 text-center">
            <CheckCircle2 className="size-6 text-status-success" aria-hidden />
            <p className="mt-3 text-[15px] font-medium text-ink">Organization is on track</p>
            <p className="mt-1 max-w-md text-[13px] text-graphite">
              No critical replies, follow-ups or attribution gaps need intervention right now.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
            {data.attention.map((signal) => (
              <li
                key={`${signal.repId}-${signal.category}-${signal.reason}`}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', severityClass(signal.severity))}>
                      {signal.severity}
                    </span>
                    <p className="text-[13px] font-medium text-ink">{signal.repName}</p>
                  </div>
                  <p className="mt-1 text-[12px] text-graphite">{signal.reason}</p>
                </div>
                <Link
                  href={signal.href}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-bone"
                >
                  {actionLabel(signal.category)}
                  <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Team execution */}
      <section aria-label="Team execution" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[18px] font-medium text-ink">Team execution</h2>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Status filter">
            {(['all', 'Critical', 'Attention', 'On track'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium',
                  statusFilter === key ? 'bg-solid text-on-solid' : 'border border-line text-graphite hover:text-ink',
                )}
              >
                {key === 'all' ? 'All' : key}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line bg-bone-raised">
          <table className="w-full min-w-[800px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-stone">
                <th className="px-3 py-2.5 font-medium">Rep</th>
                <th className="px-3 py-2.5 font-medium">Profile</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Done</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Replies</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Follow-ups</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Priority</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Meetings</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Wins</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Target %</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.repId} className="border-b border-line/70 last:border-0 hover:bg-bone">
                  <td className="px-3 py-2.5">
                    <Link href={`/team/${row.repId}`} className="font-medium text-ink hover:underline">
                      {row.repName}
                    </Link>
                  </td>
                  <td className="max-w-[9rem] truncate px-3 py-2.5 text-graphite">
                    {row.activeProfile ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.completedToday}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/team/${row.repId}?focus=replies`} className="tabular-nums hover:underline">
                      {row.repliesWaiting}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/team/${row.repId}?focus=followups`} className="tabular-nums hover:underline">
                      {row.followUpsOverdue}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.highPriority}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.meetings}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.wins}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.targetPct}%</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', severityClass(row.status))}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-2 md:hidden">
          {filteredRows.map((row) => (
            <li key={`m-${row.repId}`} className="rounded-lg border border-line bg-bone-raised px-3 py-3">
              <Link href={`/team/${row.repId}`} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{row.repName}</p>
                  <p className="text-[11px] text-graphite">
                    {row.repliesWaiting} replies · {row.followUpsOverdue} follow-ups · {row.targetPct}%
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', severityClass(row.status))}>
                  {row.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline health */}
        <section aria-label="Pipeline health" className="space-y-3">
          <h2 className="text-[18px] font-medium text-ink">Pipeline health</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
            {data.pipeline.map((stage) => (
              <li key={stage.key}>
                <Link href={stage.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bone">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{stage.label}</p>
                    <p className="text-[11px] text-graphite">
                      {stage.conversionPct != null ? `${stage.conversionPct}% from prior` : 'Top of funnel'}
                      {stage.stalledCount > 0 ? ` · ${stage.stalledCount} stalled >7d` : ''}
                    </p>
                  </div>
                  <span className="text-[18px] font-medium tabular-nums text-ink">{stage.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Stuck opportunities */}
        <section aria-label="Stuck opportunities" className="space-y-3">
          <h2 className="text-[18px] font-medium text-ink">Stuck opportunities</h2>
          {data.stuck.length === 0 ? (
            <p className="rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
              No stuck opportunities flagged from canonical lead facts.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
              {data.stuck.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-bone">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{item.company}</p>
                      <p className="text-[12px] text-graphite">{item.reason}</p>
                      {item.ownerName && (
                        <p className="text-[11px] text-stone">{item.ownerName}</p>
                      )}
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', severityClass(item.severity))}>
                      {item.severity}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Profile performance */}
      <section aria-label="Profile performance" className="space-y-3">
        <h2 className="text-[18px] font-medium text-ink">Profile performance</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-bone-raised">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-stone">
                <th className="px-3 py-2.5 font-medium">Profile</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Leads</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Sent</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Replies</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Meetings</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Proposals</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Wins</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Reply %</th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-graphite">
                    No active profiles with assignments yet.
                  </td>
                </tr>
              ) : (
                data.profiles.map((p) => (
                  <tr key={p.identityId} className="border-b border-line/70 last:border-0 hover:bg-bone">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/profile-intelligence?tab=identities`}
                        className="font-medium text-ink hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="ml-2 text-[11px] text-stone">{p.channel}</span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{p.assignedLeads}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.messagesSent}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.replies}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.meetings}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.proposals}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.wins}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.replyRate == null ? '—' : `${p.replyRate}%`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Important activity */}
      <section aria-label="Important activity" className="space-y-3">
        <h2 className="text-[18px] font-medium text-ink">Important activity</h2>
        {data.activity.length === 0 ? (
          <p className="text-[13px] text-graphite">No meaningful organization events this week.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
            {data.activity.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{item.label}</p>
                  <p className="text-[11px] text-stone">
                    {[item.detail, new Date(item.occurredAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {item.href && (
                  <Link href={item.href} className="text-[12px] font-medium text-cobalt hover:underline">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function actionLabel(category: string): string {
  switch (category) {
    case 'REPLIES_WAITING':
      return 'Open replies'
    case 'FOLLOWUPS_OVERDUE':
      return 'View follow-ups'
    case 'HIGH_PRIORITY_UNTOUCHED':
      return 'Review opportunities'
    case 'NO_PROFILE_ASSIGNMENT':
      return 'Resolve'
    case 'TARGET_AT_RISK':
      return 'Open rep'
    default:
      return 'Review'
  }
}

function MetricCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string
  value: number
  hint: string
  href?: string
  tone?: 'warn'
}) {
  const body = (
    <>
      <p className="text-[12px] text-graphite">{label}</p>
      <p className={cn('mt-1 text-[26px] font-medium tabular-nums tracking-tight', tone === 'warn' && value > 0 ? 'text-status-warning' : 'text-ink')}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-stone">{hint}</p>
    </>
  )
  if (href) {
    return (
      <Link href={href} className="rounded-lg border border-line bg-bone-raised px-3 py-3 hover:border-orange/30">
        {body}
      </Link>
    )
  }
  return <div className="rounded-lg border border-line bg-bone-raised px-3 py-3">{body}</div>
}
