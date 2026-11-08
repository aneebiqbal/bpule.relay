'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from 'cn'
import { Drawer } from '@/components/ui/drawer'
import { StatusBadge } from '@/components/ui/status-badge'
import { relativeTime } from '@/components/operations/ops-primitives'
import { isOverdue } from '@/lib/tasks/rank-unified-tasks'
import { taskViewMatches as viewMatches } from '@/lib/operations/task-views'
import { TaskDetailDrawer } from '@/components/tasks/task-detail-drawer'
import type { UnifiedTask, UnifiedTaskPriority } from '@/lib/tasks/types'

export const TASK_VIEWS = [
  { value: 'all', label: 'All open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
] as const

export const TASK_GROUPS = [
  { value: 'rep', label: 'Rep' },
  { value: 'priority', label: 'Priority' },
  { value: 'due', label: 'Due date' },
  { value: 'none', label: 'No grouping' },
] as const

type TaskView = (typeof TASK_VIEWS)[number]['value']
type TaskGroup = (typeof TASK_GROUPS)[number]['value']

const PRIORITY_ORDER: UnifiedTaskPriority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW']
const PRIORITY_VARIANT: Record<UnifiedTaskPriority, 'danger' | 'orange' | 'neutral' | 'info'> = {
  CRITICAL: 'danger',
  HIGH: 'orange',
  NORMAL: 'neutral',
  LOW: 'info',
}
const PRIORITY_LABEL: Record<UnifiedTaskPriority, string> = { CRITICAL: 'Critical', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' }
const STATUS_LABEL = { OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING: 'Waiting', DONE: 'Done', CANCELLED: 'Cancelled' } as const


function dueBucket(task: UnifiedTask, now: number): string {
  if (task.status === 'DONE' || task.status === 'CANCELLED') return 'Closed'
  if (isOverdue(task, now)) return 'Overdue'
  if (!task.dueAt) return 'No due date'
  const days = Math.floor((Date.parse(task.dueAt) - now) / 86_400_000)
  if (days < 1) return 'Due today'
  if (days < 7) return 'Due this week'
  return 'Later'
}
const DUE_ORDER = ['Overdue', 'Due today', 'Due this week', 'Later', 'No due date', 'Closed']

function dueLabel(task: UnifiedTask, now: number): string {
  if (!task.dueAt) return 'No due date'
  const t = Date.parse(task.dueAt)
  const diffH = Math.round((t - now) / 3_600_000)
  if (diffH < 0) return `${relativeTime(task.dueAt, now).replace(' ago', '')} overdue`
  if (diffH < 24) return `in ${Math.max(1, diffH)}h`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Manager task board (Phase 8.11) + task drawer (8.12). Views and grouping are
 * URL state; the drawer is `?task=<id>` so a task link is shareable. All
 * mutations go through PATCH /api/tasks/[id] (Phase 6 canonical engine).
 */
export function TaskBoard({
  tasks,
  reps,
  canManage,
  currentRepId,
  now,
  showGroupBy = true,
}: {
  tasks: UnifiedTask[]
  reps: Array<{ id: string; name: string }>
  canManage: boolean
  currentRepId: string
  now: number
  showGroupBy?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = (TASK_VIEWS.some((v) => v.value === searchParams.get('view')) ? searchParams.get('view') : 'all') as TaskView
  const group = (TASK_GROUPS.some((g) => g.value === searchParams.get('group'))
    ? searchParams.get('group')
    : showGroupBy ? 'rep' : 'none') as TaskGroup
  const openTask = searchParams.get('task')
  const repName = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps])

  function hrefWith(patch: Record<string, string | null>): string {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    const s = params.toString()
    return s ? `${pathname}?${s}` : pathname
  }

  const counts = useMemo(() => {
    const out = {} as Record<TaskView, number>
    for (const v of TASK_VIEWS) out[v.value] = tasks.filter((t) => viewMatches(t, v.value, now)).length
    return out
  }, [tasks, now])

  const visible = tasks.filter((t) => viewMatches(t, view, now))
  const groups = useMemo(() => {
    const map = new Map<string, UnifiedTask[]>()
    for (const t of visible) {
      const key =
        group === 'rep'
          ? repName.get(t.assigneeRepId) ?? 'Unknown'
          : group === 'priority'
            ? PRIORITY_LABEL[t.priority]
            : group === 'due'
              ? dueBucket(t, now)
              : 'Tasks'
      const list = map.get(key) ?? []
      list.push(t)
      map.set(key, list)
    }
    const order = (k: string) =>
      group === 'priority'
        ? PRIORITY_ORDER.map((p) => PRIORITY_LABEL[p]).indexOf(k)
        : group === 'due'
          ? DUE_ORDER.indexOf(k)
          : 0
    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
  }, [visible, group, repName, now])

  const selected = openTask
    ? tasks.find((t) => t.id === openTask || t.id === `assigned:${openTask}`) ?? null
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Task views" className="-mx-1 overflow-x-auto">
          <ul className="flex min-w-max gap-0.5 rounded-lg border border-line bg-bone-raised p-0.5">
            {TASK_VIEWS.map((v) => (
              <li key={v.value}>
                <Link
                  href={hrefWith({ view: v.value === 'all' ? null : v.value, task: null })}
                  scroll={false}
                  aria-current={view === v.value ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px]',
                    view === v.value ? 'bg-bone font-medium text-ink shadow-sm' : 'text-graphite hover:text-ink',
                  )}
                >
                  {v.label}
                  <span className="tabular-nums text-[11px] text-stone">{counts[v.value]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {showGroupBy && (
          <label className="flex items-center gap-2 text-[12px] text-graphite">
            Group by
            <select
              value={group}
              onChange={(e) => router.push(hrefWith({ group: e.target.value }), { scroll: false })}
              className="h-8 rounded-md border border-line bg-bone-raised px-2 text-[13px] text-ink"
            >
              {TASK_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-graphite">
          No tasks in this view.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(([label, list]) => (
            <section key={label} aria-label={`${label}, ${list.length} tasks`}>
              {group !== 'none' && (
                <h3 className="mb-1 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.06em] text-stone">
                  {label}
                  <span className="tabular-nums">{list.length}</span>
                </h3>
              )}
              <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
                {list.map((task) => {
                  const overdue = isOverdue(task, now)
                  return (
                    <li key={task.id}>
                      <Link
                        href={hrefWith({ task: task.id })}
                        scroll={false}
                        className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 hover:bg-bone-raised sm:grid-cols-[minmax(0,1fr)_140px_110px_90px]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-ink">{task.title}</span>
                          <span className="block truncate text-[12px] text-graphite">
                            {[group !== 'rep' ? repName.get(task.assigneeRepId) : null, task.companyName, task.reason].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="hidden text-[12px] text-graphite sm:block">
                          <StatusBadge status={STATUS_LABEL[task.status]} variant={task.status === 'IN_PROGRESS' ? 'cobalt' : task.status === 'DONE' ? 'success' : 'neutral'} />
                        </span>
                        <span className="hidden sm:block">
                          <StatusBadge status={PRIORITY_LABEL[task.priority]} variant={PRIORITY_VARIANT[task.priority]} />
                        </span>
                        <span className={cn('text-right text-[12px] tabular-nums', overdue ? 'font-medium text-status-danger' : 'text-graphite')}>
                          {overdue && <span className="sr-only">Overdue: </span>}
                          {dueLabel(task, now)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => router.push(hrefWith({ task: null }), { scroll: false })}
        title={selected ? 'Task' : ''}
        side="right"
      >
        {selected && (
          <TaskDetailDrawer
            key={selected.id}
            task={selected}
            reps={reps}
            canManage={canManage}
            currentRepId={currentRepId}
            now={now}
            onChanged={() => router.refresh()}
          />
        )}
      </Drawer>
    </div>
  )
}

