'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { cn } from 'cn'
import { relativeTime } from '@/components/operations/ops-primitives'
import { isOverdue } from '@/lib/tasks/rank-unified-tasks'
import { assignedTaskIdFromUnified } from '@/lib/tasks/map-unified-task'
import type { UnifiedTask, UnifiedTaskPriority } from '@/lib/tasks/types'

const PRIORITY_LABEL: Record<UnifiedTaskPriority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
}
const STATUS_LABEL = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
} as const

const EVENT_LABEL: Record<string, string> = {
  TASK_CREATED: 'Created',
  TASK_ASSIGNED: 'Assigned',
  TASK_REASSIGNED: 'Reassigned',
  TASK_STARTED: 'Started',
  TASK_COMPLETED: 'Completed',
  TASK_CANCELLED: 'Cancelled',
  TASK_RESCHEDULED: 'Due date changed',
}

interface TaskEventView {
  id: string
  eventType: string
  actorName: string | null
  createdAt: string
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * One task's detail + lifecycle history. Shared by /tasks and Rep 360 → Work so
 * both surfaces read the same events and offer the same actions.
 */
export function TaskDetailDrawer({
  task,
  reps,
  canManage,
  currentRepId,
  now,
  onChanged,
}: {
  task: UnifiedTask
  reps: Array<{ id: string; name: string }>
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
    ['Assignee', reps.find((r) => r.id === task.assigneeRepId)?.name ?? 'Unknown'],
    ['Created by', task.createdByName ?? '—'],
    [
      'Lead',
      task.leadId ? (
        <Link key="lead" href={`/leads/${task.leadId}`} className="text-ink underline-offset-2 hover:underline">
          Open lead
        </Link>
      ) : (
        '—'
      ),
    ],
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
              <button
                type="button"
                disabled={busy}
                className={cn(button, 'bg-solid text-on-solid hover:bg-solid/90')}
                onClick={() => act({ action: 'complete' })}
              >
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
          {events === null && rawId && <li className="text-stone">Loading…</li>}
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
