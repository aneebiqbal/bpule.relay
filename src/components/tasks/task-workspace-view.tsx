'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from 'cn'
import type { UnifiedTask, UnifiedTaskKind, UnifiedTaskPriority } from '@/lib/tasks/types'
import {
  filterUnifiedTasks,
  type UnifiedTaskTab,
} from '@/lib/tasks/rank-unified-tasks'
import { assignedTaskIdFromUnified, isDerivedTaskId } from '@/lib/tasks/map-unified-task'
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog'
import { relativeWait } from '@/lib/rep-home/action-presentation'

const TABS: Array<{ id: UnifiedTaskTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
]

function priorityLabel(p: UnifiedTaskPriority): string {
  return p.charAt(0) + p.slice(1).toLowerCase()
}

function dueLabel(task: UnifiedTask): string {
  if (task.status === 'DONE' && task.completedAt) {
    return `Done ${relativeWait(task.completedAt) || ''}`.trim()
  }
  if (!task.dueAt) {
    if (task.source === 'DERIVED' && task.kind === 'REPLY') {
      return relativeWait(task.createdAt) || '—'
    }
    return '—'
  }
  const due = new Date(task.dueAt).getTime()
  const now = Date.now()
  if (due < now) return `Overdue · ${relativeWait(task.dueAt)}`
  const hours = (due - now) / 3_600_000
  if (hours < 24) return 'Today'
  if (hours < 48) return 'Tomorrow'
  return new Date(task.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TaskWorkspaceView({
  tasks,
  canAssign,
  showAssignee,
  reps,
  currentRepId,
}: {
  tasks: UnifiedTask[]
  canAssign: boolean
  showAssignee: boolean
  reps: Array<{ id: string; name: string }>
  currentRepId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<UnifiedTaskTab>('today')
  const [kind, setKind] = useState<UnifiedTaskKind | 'ALL'>('ALL')
  const [priority, setPriority] = useState<UnifiedTaskPriority | 'ALL'>('ALL')
  const [source, setSource] = useState<'DERIVED' | 'ASSIGNED' | 'ALL'>('ALL')
  const [assignee, setAssignee] = useState<string | 'ALL'>('ALL')
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignDefaultRep, setAssignDefaultRep] = useState<string | undefined>()
  const [assignDefaultKind, setAssignDefaultKind] = useState<'REVIEW' | 'REQUEST_UPDATE'>('REVIEW')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const tabParam = searchParams.get('tab') as UnifiedTaskTab | null
    if (tabParam && TABS.some((t) => t.id === tabParam)) setTab(tabParam)
    const assigneeParam = searchParams.get('assignee')
    if (assigneeParam) setAssignee(assigneeParam)
    const sourceParam = searchParams.get('source')
    if (sourceParam === 'DERIVED' || sourceParam === 'ASSIGNED') setSource(sourceParam)
    // Deep link: /tasks?task=<unified id> opens on "All" with that row focused.
    if (searchParams.get('task')) setTab('all')
    const assignParam = searchParams.get('assign')
    if (assignParam && canAssign) {
      setAssignDefaultRep(assignParam === '1' ? undefined : assignParam)
      const kindParam = searchParams.get('kind')
      setAssignDefaultKind(kindParam === 'REQUEST_UPDATE' ? 'REQUEST_UPDATE' : 'REVIEW')
      setAssignOpen(true)
    }
  }, [searchParams, canAssign])

  const nameByRep = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps])
  const focusTaskId = searchParams.get('task')
  useEffect(() => {
    if (!focusTaskId) return
    document.getElementById(`task-${focusTaskId}`)?.scrollIntoView({ block: 'center' })
  }, [focusTaskId, tab])

  const filtered = useMemo(
    () =>
      filterUnifiedTasks(tasks, {
        tab,
        kind,
        priority,
        source,
        assigneeRepId: showAssignee ? assignee : 'ALL',
      }),
    [tasks, tab, kind, priority, source, assignee, showAssignee],
  )

  async function completeAssigned(task: UnifiedTask) {
    const id = assignedTaskIdFromUnified(task.id)
    if (!id) return
    setBusyId(task.id)
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
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[28px] font-light tracking-[-0.02em] text-ink">Tasks</h1>
          <p className="text-[14px] text-graphite">My work and assigned work in one place.</p>
        </div>
        {canAssign && (
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            className="rounded-lg bg-ink px-3 py-2 text-[13px] font-medium text-bone hover:opacity-90"
          >
            Assign task
          </button>
        )}
      </header>

      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Task tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              'px-3 py-2 text-[13px] font-medium transition-colors',
              tab === t.id ? 'border-b-2 border-ink text-ink' : 'text-graphite hover:text-ink',
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filters">
        <FilterSelect
          label="Type"
          value={kind}
          onChange={(v) => setKind(v as UnifiedTaskKind | 'ALL')}
          options={[
            ['ALL', 'All types'],
            ['REPLY', 'Reply'],
            ['FOLLOW_UP', 'Follow-up'],
            ['RESEARCH', 'Research'],
            ['PROPOSAL', 'Proposal'],
            ['REVIEW', 'Review'],
            ['ADMIN', 'Admin'],
            ['CUSTOM', 'Custom'],
          ]}
        />
        <FilterSelect
          label="Priority"
          value={priority}
          onChange={(v) => setPriority(v as UnifiedTaskPriority | 'ALL')}
          options={[
            ['ALL', 'All priorities'],
            ['CRITICAL', 'Critical'],
            ['HIGH', 'High'],
            ['NORMAL', 'Normal'],
            ['LOW', 'Low'],
          ]}
        />
        <FilterSelect
          label="Source"
          value={source}
          onChange={(v) => setSource(v as 'DERIVED' | 'ASSIGNED' | 'ALL')}
          options={[
            ['ALL', 'All sources'],
            ['DERIVED', 'Derived'],
            ['ASSIGNED', 'Assigned'],
          ]}
        />
        {showAssignee && (
          <label className="flex items-center gap-1.5 text-[12px] text-graphite">
            <span className="sr-only">Assignee</span>
            <select
              className="rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              aria-label="Assignee"
            >
              <option value="ALL">All assignees</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-bone-raised md:block">
        <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-stone">
              <th className="px-3 py-2.5 font-medium">Task</th>
              <th className="px-3 py-2.5 font-medium">Lead / company</th>
              <th className="px-3 py-2.5 font-medium">Profile</th>
              {showAssignee && <th className="px-3 py-2.5 font-medium">Assignee</th>}
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 font-medium">Priority</th>
              <th className="px-3 py-2.5 font-medium">Due</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={showAssignee ? 9 : 8} className="px-3 py-8 text-center text-graphite">
                  No tasks in this view.
                </td>
              </tr>
            ) : (
              filtered.map((task) => (
                <tr
                  key={task.id}
                  id={`task-${task.id}`}
                  aria-current={task.id === focusTaskId ? 'true' : undefined}
                  className={cn('border-b border-line/70 last:border-0 hover:bg-bone', task.id === focusTaskId && 'bg-orange/5 ring-1 ring-inset ring-orange/40')}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-ink">{task.title}</p>
                    <p className="text-[11px] text-graphite">{task.reason}</p>
                  </td>
                  <td className="px-3 py-2.5 text-graphite">{task.companyName ?? '—'}</td>
                  <td className="px-3 py-2.5 text-graphite">{task.profileName ?? '—'}</td>
                  {showAssignee && (
                    <td className="px-3 py-2.5 text-graphite">
                      {nameByRep.get(task.assigneeRepId)
                        ?? (task.assigneeRepId === currentRepId ? 'You' : '—')}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <span className="text-[11px] text-stone">
                      {task.source === 'DERIVED'
                        ? 'Derived'
                        : task.createdByName
                          ? `Assigned by ${task.createdByName}`
                          : 'Assigned'}
                    </span>
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
                      aria-label={`Priority ${priorityLabel(task.priority)}`}
                    >
                      {priorityLabel(task.priority)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-graphite">{dueLabel(task)}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[11px] font-medium text-ink">{task.status}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={task.action.href}
                        className="text-[12px] font-medium text-cobalt hover:underline"
                      >
                        {task.action.label}
                      </Link>
                      {task.source === 'ASSIGNED'
                        && (task.status === 'OPEN' || task.status === 'IN_PROGRESS')
                        && task.assigneeRepId === currentRepId && (
                        <button
                          type="button"
                          disabled={busyId === task.id}
                          className="text-[12px] font-medium text-ink hover:underline"
                          onClick={() => completeAssigned(task)}
                        >
                          Complete
                        </button>
                      )}
                      {isDerivedTaskId(task.id) && (
                        <span className="sr-only">
                          Completes when sales state resolves — not manually.
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile priority columns */}
      <ul className="space-y-2 md:hidden">
        {filtered.map((task) => (
          <li
            key={`m-${task.id}`}
            aria-current={task.id === focusTaskId ? 'true' : undefined}
            className={cn('rounded-lg border bg-bone-raised px-3 py-3', task.id === focusTaskId ? 'border-orange/50' : 'border-line')}
          >
            <p className="text-[13px] font-medium text-ink">{task.title}</p>
            <p className="mt-0.5 text-[12px] text-graphite">{task.reason}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-stone">{dueLabel(task)}</span>
              <Link href={task.action.href} className="text-[12px] font-medium text-cobalt">
                {task.action.label}
              </Link>
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="py-6 text-center text-[13px] text-graphite">No tasks in this view.</li>
        )}
      </ul>

      {canAssign && (
        <AssignTaskDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          reps={reps}
          defaultAssigneeId={assignDefaultRep}
          defaultKind={assignDefaultKind}
          defaultTitle={assignDefaultKind === 'REQUEST_UPDATE' ? 'Update needed' : undefined}
        />
      )}
    </div>
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
