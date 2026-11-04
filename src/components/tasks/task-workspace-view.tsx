'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from 'cn'
import { Drawer } from '@/components/ui/drawer'
import { V3PageHeader } from '@/components/v3/primitives'
import { relativeTime } from '@/components/operations/ops-primitives'
import type { UnifiedTask, UnifiedTaskKind, UnifiedTaskPriority } from '@/lib/tasks/types'
import {
  classifyUnifiedTaskTab,
  filterUnifiedTasks,
  isOverdue,
  type UnifiedTaskTab,
} from '@/lib/tasks/rank-unified-tasks'
import { assignedTaskIdFromUnified, isDerivedTaskId } from '@/lib/tasks/map-unified-task'
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog'
import { TaskDetailDrawer } from '@/components/tasks/task-detail-drawer'

const TABS: Array<{ id: UnifiedTaskTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
]

const PRIORITY_LABEL: Record<UnifiedTaskPriority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
}

const SOURCE_LABEL = { DERIVED: 'Relay', ASSIGNED: 'Manager' } as const

function sourceLine(task: UnifiedTask): string {
  if (task.source === 'DERIVED') return 'Relay · Generated from queue'
  return task.createdByName ? `From ${task.createdByName}` : 'From Manager'
}

function dueLabel(task: UnifiedTask, timeZone: string, now: number): string {
  if (task.status === 'DONE' && task.completedAt) {
    return `Done ${relativeTime(task.completedAt, now)}`.replace(' ago', '')
  }
  if (!task.dueAt) {
    if (task.source === 'DERIVED' && task.kind === 'REPLY') {
      return relativeTime(task.createdAt, now) || '—'
    }
    return '—'
  }
  const due = new Date(task.dueAt).getTime()
  if (due < now) return `Overdue · ${relativeTime(task.dueAt, now).replace(' ago', '')}`
  const hours = (due - now) / 3_600_000
  if (hours < 24) return 'Today'
  if (hours < 48) return 'Tomorrow'
  return new Date(task.dueAt).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' })
}

function attentionCount(tasks: UnifiedTask[], timeZone: string, now: number): number {
  return tasks.filter((t) => {
    if (t.status !== 'OPEN' && t.status !== 'IN_PROGRESS') return false
    return classifyUnifiedTaskTab(t, now, timeZone) === 'today' || classifyUnifiedTaskTab(t, now, timeZone) === 'overdue'
  }).length
}

export function TaskWorkspaceView({
  tasks,
  canAssign,
  showAssignee,
  reps,
  currentRepId,
  teams = [],
  timeZone = 'UTC',
  now,
}: {
  tasks: UnifiedTask[]
  canAssign: boolean
  showAssignee: boolean
  reps: Array<{ id: string; name: string }>
  currentRepId: string
  teams?: Array<{ id: string; name: string; memberIds: string[] }>
  /** Org timezone — the one zone the server and client both render in. */
  timeZone?: string
  /** Server-computed once per request so SSR and hydration classify tabs identically. */
  now: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignDefaultRep, setAssignDefaultRep] = useState<string | undefined>()

  const viewParam = searchParams.get('view')
  const openTaskId = searchParams.get('task')
  // Deep-linked task (?task=…) opens on All so it is always visible.
  const view: UnifiedTaskTab = openTaskId
    ? 'all'
    : TABS.some((t) => t.id === viewParam)
      ? (viewParam as UnifiedTaskTab)
      : 'today'
  const [assignee, setAssignee] = useState<string>('ALL')
  const [priority, setPriority] = useState<UnifiedTaskPriority | 'ALL'>('ALL')
  const [source, setSource] = useState<'DERIVED' | 'ASSIGNED' | 'ALL'>('ALL')
  const [due, setDue] = useState<'overdue' | 'today' | 'week' | 'later' | 'ALL'>('ALL')
  const [team, setTeam] = useState<string>('ALL')
  const [q, setQ] = useState('')

  useEffect(() => {
    // Filters are URL-backed: re-apply them on navigation and reset when the
    // param disappears (e.g. Clear all), so refresh/back-forward always agree.
    if (showAssignee) {
      const assigneeParam = searchParams.get('assignee')
      if (assigneeParam) setAssignee(assigneeParam)
    } else {
      setAssignee('ALL')
    }
    const priorityParam = searchParams.get('priority')
    if (priorityParam === 'CRITICAL' || priorityParam === 'HIGH' || priorityParam === 'NORMAL' || priorityParam === 'LOW') {
      setPriority(priorityParam)
    } else {
      setPriority('ALL')
    }
    const sourceParam = searchParams.get('source')
    if (sourceParam === 'DERIVED' || sourceParam === 'ASSIGNED') setSource(sourceParam)
    else setSource('ALL')
    const dueParam = searchParams.get('due')
    if (dueParam === 'overdue' || dueParam === 'today' || dueParam === 'week' || dueParam === 'later') {
      setDue(dueParam)
    } else {
      setDue('ALL')
    }
    const teamParam = searchParams.get('team')
    if (teamParam) setTeam(teamParam)
    else setTeam('ALL')
    const qParam = searchParams.get('q')
    if (qParam !== null) setQ(qParam)
    if (searchParams.get('assign')) {
      setAssignDefaultRep(undefined)
      setAssignOpen(true)
    }
  }, [searchParams, showAssignee])

  const nameByRep = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps])
  const teamMemberIds = team === 'ALL' ? null : new Set(teams.find((t) => t.id === team)?.memberIds ?? [])

  const counts = useMemo(() => {
    const out = {} as Record<UnifiedTaskTab, number>
    for (const t of TABS) {
      out[t.id] = t.id === 'all'
        ? tasks.length
        : tasks.filter((x) => classifyUnifiedTaskTab(x, now, timeZone) === t.id).length
    }
    return out
  }, [tasks, timeZone, now])

  const filtered = useMemo(() => {
    return filterUnifiedTasks(tasks, {
      tab: view,
      priority,
      source,
      assigneeRepId: showAssignee ? assignee : 'ALL',
      timeZone,
    }).filter((t) => {
      if (teamMemberIds && !teamMemberIds.has(t.assigneeRepId)) return false
      if (due !== 'ALL') {
        const bucket = classifyUnifiedTaskTab(t, now, timeZone)
        if (due === 'overdue' && bucket !== 'overdue') return false
        if (due === 'today' && bucket !== 'today') return false
        if (due === 'week') {
          if (!t.dueAt) return false
          const days = (new Date(t.dueAt).getTime() - now) / 86_400_000
          if (days < 0 || days >= 7) return false
        }
        if (due === 'later') {
          if (!t.dueAt) return false
          if ((new Date(t.dueAt).getTime() - now) / 86_400_000 < 7) return false
        }
      }
      if (q) {
        const hay = `${t.title} ${t.companyName ?? ''} ${t.reason}`.toLowerCase()
        if (!hay.includes(q.toLowerCase())) return false
      }
      return true
    })
  }, [tasks, view, priority, source, assignee, showAssignee, due, teamMemberIds, q, timeZone])

  const selected = openTaskId
    ? tasks.find((t) => t.id === openTaskId || t.id === `assigned:${openTaskId}`) ?? null
    : null

  function hrefWith(patch: Record<string, string | null>): string {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    const s = params.toString()
    return s ? `/tasks?${s}` : '/tasks'
  }

  function clearFilter(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)
    const s = params.toString()
    if (key === 'q') setQ('')
    router.push(s ? `/tasks?${s}` : '/tasks', { scroll: false })
  }

  const chips: Array<{ key: string; label: string }> = []
  if (assignee !== 'ALL') chips.push({ key: 'assignee', label: `Assignee: ${nameByRep.get(assignee) ?? 'Unknown'}` })
  if (priority !== 'ALL') chips.push({ key: 'priority', label: `Priority: ${PRIORITY_LABEL[priority]}` })
  if (source !== 'ALL') chips.push({ key: 'source', label: `Source: ${SOURCE_LABEL[source]}` })
  if (due !== 'ALL') chips.push({ key: 'due', label: `Due: ${due}` })
  if (team !== 'ALL') chips.push({ key: 'team', label: `Team: ${teams.find((t) => t.id === team)?.name ?? 'Unknown'}` })
  if (q) chips.push({ key: 'q', label: `Record: ${q}` })

  const headerSubtitle = showAssignee
    ? `${counts.overdue} overdue across ${new Set(tasks.filter((t) => isOverdue(t)).map((t) => t.assigneeRepId)).size} people.`
    : `${attentionCount(tasks, timeZone, now)} need your attention today.`

  return (
    <div className="space-y-6 pb-10">
      <V3PageHeader
        title={showAssignee ? 'Team work' : 'My work'}
        subtitle={headerSubtitle}
        actions={
          canAssign ? (
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="rounded-lg bg-ink px-3 py-2 text-[13px] font-medium text-bone transition-transform active:scale-[0.98] hover:opacity-90"
            >
              Assign task
            </button>
          ) : undefined
        }
      />

      <div className="-mx-1 overflow-x-auto">
        <nav aria-label="Task views" className="flex min-w-max gap-0.5 rounded-lg border border-line bg-bone-raised p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={hrefWith({ view: t.id === 'today' ? null : t.id, task: null })}
              scroll={false}
              aria-current={view === t.id ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] transition-colors',
                view === t.id ? 'bg-bone font-medium text-ink shadow-sm' : 'text-graphite hover:text-ink',
              )}
            >
              {t.label}
              <span suppressHydrationWarning className="tabular-nums text-[11px] text-stone">{counts[t.id]}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {showAssignee ? (
            <FilterSelect
              label="Assignee"
              value={assignee}
              onChange={(v) => {
                setAssignee(v)
                router.push(hrefWith({ assignee: v === 'ALL' ? null : v }), { scroll: false })
              }}
              options={[['ALL', 'All assignees'], ...reps.map((r): [string, string] => [r.id, r.name])]}
            />
          ) : null}
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={(v) => {
              setPriority(v as UnifiedTaskPriority | 'ALL')
              router.push(hrefWith({ priority: v === 'ALL' ? null : v }), { scroll: false })
            }}
            options={[['ALL', 'All priorities'], ['CRITICAL', 'Critical'], ['HIGH', 'High'], ['NORMAL', 'Normal'], ['LOW', 'Low']]}
          />
          <FilterSelect
            label="Source"
            value={source}
            onChange={(v) => {
              setSource(v as 'DERIVED' | 'ASSIGNED' | 'ALL')
              router.push(hrefWith({ source: v === 'ALL' ? null : v }), { scroll: false })
            }}
            options={[['ALL', 'All sources'], ['DERIVED', 'Relay'], ['ASSIGNED', 'Manager']]}
          />
          <FilterSelect
            label="Due"
            value={due}
            onChange={(v) => {
              setDue(v as typeof due)
              router.push(hrefWith({ due: v === 'ALL' ? null : v }), { scroll: false })
            }}
            options={[['ALL', 'Any due date'], ['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later']]}
          />
          {teams.length > 0 && (
            <FilterSelect
              label="Team"
              value={team}
              onChange={(v) => {
                setTeam(v)
                router.push(hrefWith({ team: v === 'ALL' ? null : v }), { scroll: false })
              }}
              options={[['ALL', 'All teams'], ...teams.map((t): [string, string] => [t.id, t.name])]}
            />
          )}
          <label className="flex items-center gap-1.5 text-[12px] text-graphite">
            <span className="sr-only">Related record</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => {
                if (searchParams.get('q') !== (q || null)) {
                  router.push(hrefWith({ q: q || null }), { scroll: false })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              placeholder="Related record…"
              aria-label="Related record"
              className="w-40 rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
            />
          </label>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => clearFilter(chip.key)}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-bone-raised px-2 py-0.5 text-[11px] text-graphite transition-colors hover:text-ink"
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label}
                <span aria-hidden>×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => router.push('/tasks', { scroll: false })}
              className="text-[11px] text-stone hover:text-ink"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-bone-raised/60 px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-ink">You&apos;re caught up.</p>
          <p className="mt-1 text-[13px] text-graphite">No work needs your attention right now.</p>
          <Link
            href="/prospect"
            className="mt-4 rounded-lg bg-ink px-3 py-2 text-[13px] font-medium text-bone transition-transform active:scale-[0.98] hover:opacity-90"
          >
            Analyze Prospect
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-line bg-bone-raised md:block">
            <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-stone">
                  <th className="px-3 py-2.5 font-medium">Task</th>
                  <th className="px-3 py-2.5 font-medium">Lead / company</th>
                  {showAssignee && <th className="px-3 py-2.5 font-medium">Assignee</th>}
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">Priority</th>
                  <th className="px-3 py-2.5 font-medium">Due</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => {
                  const overdue = isOverdue(task)
                  return (
                    <tr
                      key={task.id}
                      id={`task-${task.id}`}
                      onClick={() => router.push(hrefWith({ task: task.id }), { scroll: false })}
                      className={cn(
                        'cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-bone',
                        task.id === openTaskId && 'bg-orange/5',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => router.push(hrefWith({ task: task.id }), { scroll: false })}
                          className="text-left font-medium text-ink hover:underline"
                        >
                          {task.title}
                        </button>
                        <p className="text-[11px] text-graphite">{task.reason}</p>
                      </td>
                      <td className="px-3 py-2.5 text-graphite">{task.companyName ?? '—'}</td>
                      {showAssignee && (
                        <td className="px-3 py-2.5 text-graphite">
                          {nameByRep.get(task.assigneeRepId) ?? (task.assigneeRepId === currentRepId ? 'You' : '—')}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] text-stone">{sourceLine(task)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium',
                            task.priority === 'CRITICAL' && 'bg-status-danger/10 text-status-danger',
                            task.priority === 'HIGH' && 'bg-status-warning/10 text-status-warning',
                            task.priority === 'NORMAL' && 'bg-bone text-graphite',
                            task.priority === 'LOW' && 'bg-bone text-stone',
                          )}
                          aria-label={`Priority ${PRIORITY_LABEL[task.priority]}`}
                        >
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                      </td>
                      <td suppressHydrationWarning className={cn('px-3 py-2.5', overdue ? 'font-medium text-status-danger' : 'text-graphite')}>
                        {overdue && <span className="sr-only">Overdue: </span>}
                        {dueLabel(task, timeZone, now)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={task.action.href}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[12px] font-medium text-cobalt hover:underline"
                          >
                            {task.action.label}
                          </Link>
                          {task.source === 'ASSIGNED'
                            && (task.status === 'OPEN' || task.status === 'IN_PROGRESS')
                            && task.assigneeRepId === currentRepId && (
                            <QuickComplete taskId={task.id} onChanged={() => router.refresh()} />
                          )}
                          {isDerivedTaskId(task.id) && (
                            <span className="sr-only">Completes when sales state resolves — not manually.</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((task) => (
              <li key={`m-${task.id}`}>
                <div className="rounded-lg border border-line bg-bone-raised px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(hrefWith({ task: task.id }), { scroll: false })}
                      className="min-w-0 flex-1 text-left text-[13px] font-medium text-ink hover:underline"
                    >
                      {task.title}
                    </button>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                        task.priority === 'CRITICAL' && 'bg-status-danger/10 text-status-danger',
                        task.priority === 'HIGH' && 'bg-status-warning/10 text-status-warning',
                        task.priority === 'NORMAL' && 'bg-bone text-graphite',
                        task.priority === 'LOW' && 'bg-bone text-stone',
                      )}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-graphite">{task.reason}</p>
                  <p className="mt-0.5 text-[11px] text-stone">{sourceLine(task)}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span suppressHydrationWarning className={cn('text-[11px]', isOverdue(task) ? 'font-medium text-status-danger' : 'text-stone')}>
                      {dueLabel(task, timeZone, now)}
                    </span>
                    <Link href={task.action.href} className="text-[12px] font-medium text-cobalt">
                      {task.action.label}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
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
            canManage={canAssign}
            currentRepId={currentRepId}
            now={now}
            onChanged={() => router.refresh()}
          />
        )}
      </Drawer>

      {canAssign && (
        <AssignTaskDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          reps={reps}
          defaultAssigneeId={assignDefaultRep}
        />
      )}
    </div>
  )
}

function QuickComplete({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  async function complete() {
    const id = assignedTaskIdFromUnified(taskId)
    if (!id) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed')
      }
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation()
        void complete()
      }}
      className="text-[12px] font-medium text-ink hover:underline"
    >
      Complete
    </button>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<[string, string]>
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-graphite">
      <span className="sr-only">{label}</span>
      <select
        className="rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  )
}
