'use client'

/**
 * Rep Home V3 — the flagship daily workspace.
 * Six sections exactly: header, execution metrics, do this next, my work,
 * pipeline pulse, today / recent.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { RepWorkspaceData } from '@/components/rep/rep-workspace'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import type { UnifiedTask } from '@/lib/tasks/types'
import {
  buildRepV3Actions,
  buildRepV3Activity,
  buildRepV3Metrics,
  buildRepV3Stages,
  countRepV3DueToday,
  deriveRepV3MetricInput,
  REP_V3_EMPTY_STATE,
  REP_V3_PRIMARY_CTA,
  REP_V3_PROFILE_LABEL,
  buildRepV3ProfileMeta,
  selectRepV3WorkRows,
  type RepV3WorkTab,
} from '@/lib/rep-home/v3-present'
import { rankActions } from '@/lib/rep-home/action-presentation'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import { V3ActionRow, V3ActivityRow, V3EmptyState, V3Metric, V3PageHeader, V3SectionTitle, V3StageStrip } from '@/components/v3/primitives'

const WORK_TABS: Array<{ id: RepV3WorkTab; label: string }> = [
  { id: 'replies', label: 'Replies' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'pipeline', label: 'Pipeline' },
]

export function RepHomeView({ data, role }: { data: RepWorkspaceData; role: 'admin' | 'rep' | 'sourcer' | 'manager' }) {
  const [workTab, setWorkTab] = useState<RepV3WorkTab>('replies')

  const ranked = useMemo(() => rankActions(data.allActions ?? []), [data.allActions])
  const unified = useMemo(() => data.unifiedTasks ?? [], [data.unifiedTasks])

  const metrics = useMemo(
    () =>
      buildRepV3Metrics(
        deriveRepV3MetricInput({
          ranked,
          openTasks: unified.length,
          tasksDueToday: countRepV3DueToday(unified),
        }),
      ),
    [ranked, unified],
  )
  const actions = useMemo(() => buildRepV3Actions(unified, ranked), [unified, ranked])
  const stages = useMemo(() => buildRepV3Stages(data.pipelineLeads ?? []), [data.pipelineLeads])
  const activity = useMemo(() => buildRepV3Activity(data.activity ?? []), [data.activity])
  const workRows = useMemo(
    () => selectRepV3WorkRows(workTab, unified, ranked),
    [workTab, unified, ranked],
  )

  const identity = buildRepV3ProfileMeta(data.activeWorkspace)

  return (
    <div className="space-y-8 pb-10">
      <V3PageHeader
        title={`Good ${greeting()}, ${data.rep.name.split(' ')[0]}`}
        subtitle="Your workspace for today"
        meta={
          <div className="flex items-center gap-3">
            {identity && (
              <p className="text-[12px] text-stone">
                {REP_V3_PROFILE_LABEL} <span className="font-medium text-ink">{identity}</span>
              </p>
            )}
            <span className="hidden lg:inline-flex">
              <ProfileSwitcher role={role} compact />
            </span>
          </div>
        }
        actions={
          <>
            <Link
              href={REP_V3_PRIMARY_CTA.href}
              className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              {REP_V3_PRIMARY_CTA.label}
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Create Task
            </Link>
          </>
        }
      />

      <section aria-label="Execution metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <V3Metric key={metric.key} label={metric.label} value={metric.value} hint={metric.hint} href={metric.href} />
        ))}
      </section>

      <section aria-label="Do this next">
        <V3SectionTitle title="Do this next" hint="Ranked by urgency" />
        {actions.length > 0 ? (
          <ol className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-bone-raised">
            {actions.map((action, index) => (
              <V3ActionRow
                key={`${action.id}-${index}`}
                rank={index + 1}
                priority={action.priority}
                title={action.title}
                context={action.context || undefined}
                whyNow={action.whyNow || undefined}
                age={action.age || undefined}
                ctaLabel={action.ctaLabel}
                href={action.href}
              />
            ))}
          </ol>
        ) : (
          <div className="mt-3">
            <V3EmptyState title={REP_V3_EMPTY_STATE.title} body={REP_V3_EMPTY_STATE.body}>
              <Link
                href={REP_V3_EMPTY_STATE.href}
                className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
              >
                {REP_V3_EMPTY_STATE.cta}
              </Link>
            </V3EmptyState>
          </div>
        )}
      </section>

      <section aria-label="My work">
        <V3SectionTitle title="My work" hint={`${unified.length} open`} />
        <div className="mt-3 flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Work tabs">
          {WORK_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={workTab === tab.id}
              onClick={() => setWorkTab(tab.id)}
              className={cn(
                'rounded-t-md px-3 py-2 text-[13px] font-medium transition-colors',
                workTab === tab.id
                  ? 'border border-b-0 border-line bg-bone-raised text-ink'
                  : 'text-graphite hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-b-lg rounded-tr-lg border border-line bg-bone-raised" role="tabpanel">
          {workRows.length > 0 ? (
            <ul className="divide-y divide-line/70">
              {workRows.map((row, index) =>
                isUnifiedRow(row) ? (
                  <UnifiedWorkRow key={`${row.id}-${index}`} task={row} />
                ) : (
                  <RankedWorkRow key={`${row.id}-${index}`} action={row} />
                ),
              )}
            </ul>
          ) : (
            <p className="px-4 py-6 text-[13px] text-graphite">Nothing in this tab for your current profile.</p>
          )}
        </div>
      </section>

      <section aria-label="Pipeline pulse">
        <V3SectionTitle title="Pipeline pulse" hint="Open opportunities" />
        <div className="mt-3">
          <V3StageStrip stages={stages} />
        </div>
      </section>

      <section aria-label="Today and recent activity">
        <V3SectionTitle title="Today" hint="Latest operational events" />
        {activity.length > 0 ? (
          <>
            <ul className="mt-3 divide-y divide-line/70 overflow-hidden rounded-lg border border-line bg-bone-raised">
              {activity.map((item) => (
                <V3ActivityRow key={item.id} time={item.time} label={item.label} detail={item.detail ?? undefined} href={item.href ?? undefined} />
              ))}
            </ul>
            <Link
              href="/reports/activity"
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
            >
              View activity
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </>
        ) : (
          <p className="mt-3 rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
            No operational events yet today.
          </p>
        )}
      </section>
    </div>
  )
}

function isUnifiedRow(row: UnifiedTask | RelayTodayAction): row is UnifiedTask {
  return 'assigneeRepId' in row
}

function UnifiedWorkRow({ task }: { task: UnifiedTask }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
        <p className="truncate text-[12px] text-graphite">
          {[task.companyName, task.profileName].filter(Boolean).join(' · ') || task.reason}
        </p>
      </div>
      <Link
        href={task.action.href}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
      >
        {task.action.label}
      </Link>
    </li>
  )
}

function RankedWorkRow({ action }: { action: RelayTodayAction }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{action.title}</p>
        <p className="truncate text-[12px] text-graphite">{action.subtitle || action.identity?.name}</p>
      </div>
      <Link
        href={action.href}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
      >
        Open
      </Link>
    </li>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
