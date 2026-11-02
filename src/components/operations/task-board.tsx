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
import { assignedTaskIdFromUnified } from '@/lib/tasks/map-unified-task'
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
const STATUS_LABEL = { OPEN: 'Open', IN_PROGRESS: 'In progress', DONE: 'Done', CANCELLED: 'Cancelled' } as const


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
          <TaskDrawerBody
            key={selected.id}
            task={selected}
            reps={reps}
            repName={repName}
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

interface TaskEventView {
  id: string
  eventType: string
  actorName: string | null
  createdAt: string
}

const EVENT_LABEL: Record<string, string> = {
  TASK_CREATED: 'Created',
  TASK_ASSIGNED: 'Assigned',
  TASK_REASSIGNED: 'Reassigned',
  TASK_STARTED: 'Started',
  TASK_COMPLETED: 'Completed',
  TASK_CANCELLED: 'Cancelled',
  TASK_RESCHEDULED: 'Due date changed',
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function TaskDrawerBody({
  task,
  reps,
  repName,
  canManage,
  currentRepId,
  now,
  onChanged,
}: {
  task: UnifiedTask
  reps: Array<{ id: string; name: string }>
  repName: Map<string, string>
  canManage: boolean
  currentRepId: string
  now: number
  onChanged: () => void
}) {
  const rawId = assignedTaskIdFromUnified(task.id)
  const [events, setEvents] = useState<TaskEventView[] | null>(null)
  const [assignee, setAssignee] = useState(task.assigneeRepId)
  const [due, setDue] = useState(toLocalInput(task.dueAt))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = task.status === 'OPEN' || task.status === 'IN_PROGRESS'
  const isAssignee = task.assigneeRepId === currentRepId
  const isCreator = task.createdBy === currentRepId

  useEffect(() => {
    if (!rawId) return
    let cancelled = false
    fetch(`/api/tasks/${rawId}`)
      .then((res) => res.json())
      .then((json: { events?: TaskEventView[] }) => !cancelled && setEvents(json.events ?? []))
      .catch(() => !cancelled && setEvents([]))
    return () => {
      cancelled = true
    }
  }, [rawId])

  async function act(body: Record<string, unknown>) {
    if (!rawId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${rawId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Action failed')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const facts: Array<[string, React.ReactNode]> = [
    ['Reason', task.reason],
    ['Assignee', repName.get(task.assigneeRepId) ?? 'Unknown'],
    ['Created by', task.createdByName ?? '—'],
    ['Lead', task.leadId ? <Link key="lead" href={`/leads/${task.leadId}`} className="text-ink underline-offset-2 hover:underline">Open lead</Link> : '—'],
    ['Company', task.companyName ?? '—'],
    ['Profile', task.profileName ?? '—'],
    ['Priority', PRIORITY_LABEL[task.priority]],
    ['Due', task.dueAt ? `${new Date(task.dueAt).toLocaleString()}${isOverdue(task, now) ? ' · overdue' : ''}` : 'No due date'],
    ['Status', STATUS_LABEL[task.status]],
  ]

  const button = 'h-8 rounded-md border border-line bg-bone px-2.5 text-[13px] text-ink hover:bg-bone-raised disabled:opacity-50'

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-[15px] font-medium text-ink">{task.title}</h3>
        {task.note && <p className="mt-1 whitespace-pre-wrap text-[13px] text-graphite">{task.note}</p>}
      </div>

      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone">{k}</dt>
            <dd className="min-w-0 text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {!rawId ? (
        <p className="text-[12px] text-graphite">Derived from sales state. Complete it by acting on the lead.</p>
      ) : open ? (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap gap-2">
            {isAssignee && task.status === 'OPEN' && (
              <button type="button" disabled={busy} className={button} onClick={() => act({ action: 'start' })}>
                Start
              </button>
            )}
            {(isAssignee || isCreator || canManage) && (
              <button type="button" disabled={busy} className={cn(button, 'bg-solid text-on-solid hover:bg-solid/90')} onClick={() => act({ action: 'complete' })}>
                Complete
              </button>
            )}
            {task.leadId && (
              <Link href={`/leads/${task.leadId}`} className={cn(button, 'inline-flex items-center')}>
                Open lead
              </Link>
            )}
          </div>

          {canManage && (
            <>
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-[12px] text-graphite">
                  Reassign to
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="mt-1 h-8 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                  >
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || assignee === task.assigneeRepId}
                  className={button}
                  onClick={() => act({ action: 'reassign', assigneeRepId: assignee })}
                >
                  Reassign
                </button>
              </div>
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-[12px] text-graphite">
                  Due date
                  <input
                    type="datetime-local"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                    className="mt-1 h-8 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || due === toLocalInput(task.dueAt)}
                  className={button}
                  onClick={() => act({ action: 'reschedule', dueAt: due ? new Date(due).toISOString() : null })}
                >
                  Change
                </button>
              </div>
            </>
          )}

          {(isCreator || canManage) && (
            <button
              type="button"
              disabled={busy}
              className="text-[12px] text-status-danger hover:underline"
              onClick={() => {
                const reason = window.prompt('Why cancel this task? (optional)') ?? undefined
                void act({ action: 'cancel', reason })
              }}
            >
              Cancel task
            </button>
          )}
        </div>
      ) : null}

      {error && (
        <p role="alert" className="text-[12px] text-status-danger">
          {error}
        </p>
      )}

      <section aria-label="Task activity" className="border-t border-line pt-3">
        <h4 className="text-[12px] font-medium uppercase tracking-[0.06em] text-stone">Activity</h4>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {events === null && <li className="text-stone">Loading…</li>}
          {events?.length === 0 && <li className="text-stone">No activity recorded.</li>}
          {events?.map((e) => (
            <li key={e.id} className="flex justify-between gap-2">
              <span className="text-ink">
                {EVENT_LABEL[e.eventType] ?? e.eventType}
                {e.actorName && <span className="text-graphite"> · {e.actorName}</span>}
              </span>
              <time dateTime={e.createdAt} className="shrink-0 text-[12px] text-stone">
                {relativeTime(e.createdAt, now)}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
