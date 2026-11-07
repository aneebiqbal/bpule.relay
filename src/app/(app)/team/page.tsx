import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { V3PageHeader, V3PersonRow, V3EmptyState } from '@/components/v3/primitives'
import { InlineError, MetricStrip, Section, TimelineTable } from '@/components/operations/ops-primitives'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { assignableReps, getPeopleDirectory, requireTeamContext } from '@/lib/operations/page-context'
import { effectiveRepIds } from '@/lib/operations/scope'
import { rangeWindow } from '@/lib/operations/filters'
import { loadTimeline } from '@/lib/operations/activity'
import { buildTeamAttentionFromPeople } from '@/lib/team/attention-policy'
import { buildWorkloadRows, workloadScale } from '@/lib/team/workload'

export const dynamic = 'force-dynamic'

/**
 * Team → Overview. The manager's operational workspace: who needs attention,
 * what everyone is carrying, and what happened recently — one screen, no
 * jumping between pages. Every number comes from the same canonical contracts
 * as Manager Home, People and Rep 360.
 */
export default async function TeamOverviewPage() {
  const ctx = await requireTeamContext()
  const [directory, reps] = await Promise.all([
    getPeopleDirectory().catch(() => null),
    assignableReps(ctx),
  ])

  const todayWindow = rangeWindow('today')
  const timeline = await loadTimeline(
    ctx.client,
    { orgId: ctx.auth.orgId, repIds: effectiveRepIds(ctx.scope, {}), start: todayWindow.start, end: todayWindow.end, limit: 20 },
  ).catch(() => null)

  const rows = directory?.rows ?? []
  const workload = buildWorkloadRows(rows)
  const attention = buildTeamAttentionFromPeople(rows)
  const attentionCount = new Set(attention.map((a) => a.repId)).size
  const sum = (key: 'repliesWaiting' | 'followUpsOverdue' | 'overdueTasks' | 'openLeads' | 'meetings' | 'wins') =>
    rows.reduce((s, r) => s + r[key], 0)
  const activeToday = rows.filter((r) => r.completedToday > 0).length
  const avgTarget = rows.length ? Math.round(rows.reduce((s, r) => s + r.targetPct, 0) / rows.length) : 0
  const scale = workloadScale(workload)
  const title = ctx.scope.mode === 'org' ? 'Team' : 'My Team'

  return (
    <div className="space-y-6">
      <V3PageHeader
        title={title}
        subtitle={`${rows.length} ${rows.length === 1 ? 'person' : 'people'} · ${attentionCount} need attention`}
        actions={
          <>
            <AssignTaskButton reps={reps} />
            {ctx.scope.mode === 'org' && (
              <Link
                href="/admin/people"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised"
              >
                <UserPlus className="size-3.5" aria-hidden />
                Invite person
              </Link>
            )}
          </>
        }
      />

      {/* Team sub-navigation is the shell's canonical section rail — a second
          tab bar here duplicated it and left two "Team sections" landmarks. */}
      {!directory ? (
        <InlineError>The team could not be loaded. Refresh to try again.</InlineError>
      ) : rows.length === 0 ? (
        <V3EmptyState
          title="No team members yet"
          body="Invite someone to start managing work."
        >
          {ctx.scope.mode === 'org' && (
            <Link href="/admin/people" className="relay-cta text-[12px]">
              Invite people
            </Link>
          )}
        </V3EmptyState>
      ) : (
        <>
          <MetricStrip
            metrics={[
              { label: 'Active today', value: activeToday },
              { label: 'Replies waiting', value: sum('repliesWaiting'), href: '/team/people?view=attention', tone: sum('repliesWaiting') ? 'attention' : 'default' },
              { label: 'Overdue tasks', value: sum('overdueTasks'), href: '/tasks?view=overdue', tone: sum('overdueTasks') ? 'critical' : 'default' },
              { label: 'Meetings', value: sum('meetings'), href: '/team/activity?event=MEETING_BOOKED&range=today' },
              { label: 'Target progress', value: `${avgTarget}%`, href: '/team/targets' },
            ]}
          />

          <Section title="Needs attention" description="Oldest and largest gaps across the team, most urgent first.">
            {attention.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-graphite">
                Team is on track. No critical replies or overdue work right now.
              </p>
            ) : (
              <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
                {attention.slice(0, 6).map((a) => (
                  <li key={`${a.repId}-${a.category}`}>
                    <Link
                      href={a.href}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] transition-colors hover:bg-bone-raised"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-ink">{a.repName}</span>
                        <span className="truncate text-graphite">· {a.reason}</span>
                      </span>
                      <span
                        className={
                          a.severity === 'critical'
                            ? 'shrink-0 text-[11px] font-medium text-status-danger'
                            : 'shrink-0 text-[11px] text-status-warning'
                        }
                      >
                        {a.severity === 'critical' ? 'Critical' : 'Attention'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Workload" description="Open work per person — context, not a performance score.">
            <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
              {workload.map((w) => (
                <li key={w.repId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)_120px]">
                  <Link href={`/team/${w.repId}`} className="truncate text-[13px] font-medium text-ink hover:underline">
                    {w.repName}
                  </Link>
                  <span className="hidden h-1.5 overflow-hidden rounded-full bg-bone sm:block" aria-hidden>
                    <span
                      className="block h-1.5 rounded-full bg-orange/70"
                      style={{ width: `${Math.round((w.open / scale) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right text-[12px] tabular-nums text-graphite">
                    <span className="font-medium text-ink">{w.open}</span> open
                    <span className="hidden text-stone md:inline">
                      {' '}· {w.replies} replies · {w.overdueTasks} overdue
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="People"
            description="Who is on the team right now."
            action={<Link href="/team/people" className="text-[12px] text-graphite hover:text-ink">All people →</Link>}
          >
            <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
              {rows.slice(0, 6).map((r) => (
                <V3PersonRow
                  key={r.repId}
                  name={r.repName}
                  role={r.roleLabel}
                  href={`/team/${r.repId}`}
                  status={r.status}
                  progress={{ label: 'Target', pct: Math.round(r.targetPct) }}
                  stats={[
                    { label: 'Replies', value: r.repliesWaiting },
                    { label: 'Overdue', value: r.overdueTasks },
                    { label: 'Leads', value: r.openLeads },
                  ]}
                />
              ))}
            </ul>
          </Section>

          <Section title="Recent activity" description="Operational events across the team today.">
            {timeline === null ? (
              <InlineError>Activity could not be loaded. Refresh to try again.</InlineError>
            ) : (
              <TimelineTable rows={timeline} now={Date.now()} empty="No operational activity today." />
            )}
          </Section>
        </>
      )}
    </div>
  )
}
