'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { cn } from 'cn'
import { relativeTime } from '@/components/operations/ops-primitives'
import { NotesPanel } from '@/components/operations/notes-panel'
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
  WAITING: 'Waiting',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
} as const

const WAITING_ON_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  REP: 'Another rep',
  CLIENT: 'Client',
  EXTERNAL: 'External',
}

const EVENT_LABEL: Record<string, string> = {
  TASK_CREATED: 'Created',
  TASK_ASSIGNED: 'Assigned',
  TASK_REASSIGNED: 'Reassigned',
  TASK_STARTED: 'Started',
  TASK_COMPLETED: 'Completed',
  TASK_CANCELLED: 'Cancelled',
  TASK_RESCHEDULED: 'Due date changed',
  TASK_WAITING: 'Marked waiting',
  TASK_REOPENED: 'Reopened',
  TASK_TRANSFER_REQUESTED: 'Transfer requested',
  TASK_TRANSFER_APPROVED: 'Transfer approved',
  TASK_TRANSFER_DECLINED: 'Transfer declined',
  TASK_TRANSFER_CANCELLED: 'Transfer request cancelled',
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
  transferTargets,
  canManage,
  currentRepId,
  now,
  onChanged,
}: {
  task: UnifiedTask
  reps: Array<{ id: string; name: string }>
  /** Reps a handoff may be requested to. Defaults to `reps` (assign scope). */
  transferTargets?: Array<{ id: string; name: string }>
  canManage: boolean
  currentRepId: string
  now: number
  onChanged: () => void
}) {
  // A rep's assign scope is themselves only, but a handoff request needs the
  // wider org list; the manager approval still enforces team scope.
  const transferReps = transferTargets ?? reps
  const rawId = assignedTaskIdFromUnified(task.id)
  const [events, setEvents] = useState<TaskEventView[] | null>(null)
  const [assignee, setAssignee] = useState(task.assigneeRepId)
  const [due, setDue] = useState(toLocalInput(task.dueAt))
  const [waitingOn, setWaitingOn] = useState<string>(task.waitingOn ?? 'ADMIN')
  const [waitingNote, setWaitingNote] = useState(task.waitingNote ?? '')
  const [transferTo, setTransferTo] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = task.status === 'OPEN' || task.status === 'IN_PROGRESS' || task.status === 'WAITING'
  const isAssignee = task.assigneeRepId === currentRepId
  const isCreator = task.createdBy === currentRepId
  const canManageTask = canManage || isCreator
  const pendingTransfer = task.transfer ?? null

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

  // Opening the conversation clears its unread comments (canonical read flag).
  useEffect(() => {
    if (!rawId) return
    fetch('/api/notifications/read-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: rawId }),
    }).catch(() => {})
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

  // Profile-bound tasks show canonical ownership next to today's execution —
  // the leave-handoff context, without ever moving the primary.
  const profileFacts: Array<[string, React.ReactNode]> = task.profileId
    ? [
        ['Primary', task.primaryRepName ?? '—'],
        ['Current execution', task.executionRepName ?? '—'],
      ]
    : []

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
    ...profileFacts,
    ['Priority', PRIORITY_LABEL[task.priority]],
    ['Due', task.dueAt ? `${new Date(task.dueAt).toLocaleString()}${isOverdue(task, now) ? ' · overdue' : ''}` : 'No due date'],
    ['Status', task.status === 'WAITING' && task.waitingOn
      ? `Waiting on ${WAITING_ON_LABEL[task.waitingOn] ?? task.waitingOn}`
      : STATUS_LABEL[task.status]],
    ...(task.status === 'WAITING' && task.waitingNote
      ? [['Waiting note', task.waitingNote] as [string, React.ReactNode]]
      : []),
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
        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-[12px] text-graphite">
            This is live sales work — it clears itself once you act, so there is nothing to mark done here.
          </p>
          <Link
            href={task.action.href}
            className={cn(button, 'inline-flex bg-solid text-on-solid hover:bg-solid/90')}
          >
            {task.action.label}
          </Link>
        </div>
      ) : open ? (
        <div className="space-y-3 border-t border-line pt-3">
          {pendingTransfer && (
            <div className="rounded-lg border border-line bg-bone px-3 py-2.5 text-[12px]">
              <p className="font-medium text-ink">
                Transfer requested to {pendingTransfer.toRepName ?? 'another rep'}
              </p>
              <p className="mt-0.5 text-[11px] text-stone">Waiting for manager approval</p>
              {pendingTransfer.reason && (
                <p className="mt-0.5 text-graphite">&ldquo;{pendingTransfer.reason}&rdquo;</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className={cn(button, 'bg-solid text-on-solid hover:bg-solid/90')}
                      onClick={() => act({ action: 'approveTransfer' })}
                    >
                      Approve transfer
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
                      onClick={() => act({ action: 'declineTransfer' })}
                    >
                      Decline
                    </button>
                  </>
                )}
                {(isAssignee || canManage) && (
                  <button
                    type="button"
                    disabled={busy}
                    className={button}
                    onClick={() => act({ action: 'cancelTransfer' })}
                  >
                    Cancel request
                  </button>
                )}
              </div>
            </div>
          )}

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

          {(isAssignee || canManageTask) && !pendingTransfer && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[12px] text-graphite">
                Waiting on
                <select
                  value={waitingOn}
                  onChange={(e) => setWaitingOn(e.target.value)}
                  className="ml-1 h-8 rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                >
                  {Object.entries(WAITING_ON_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <input
                value={waitingNote}
                onChange={(e) => setWaitingNote(e.target.value)}
                placeholder="Note (optional)"
                aria-label="Waiting note"
                className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
              />
              {task.status === 'WAITING' ? (
                <button
                  type="button"
                  disabled={busy}
                  className={cn(button, 'bg-solid text-on-solid hover:bg-solid/90')}
                  onClick={() => act({ action: 'resume' })}
                >
                  Resume work
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={button}
                  onClick={() => act({ action: 'waiting', waitingOn, note: waitingNote })}
                >
                  Mark waiting
                </button>
              )}
            </div>
          )}

          {isAssignee && !pendingTransfer && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-[12px] text-graphite">
                Request transfer to
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                >
                  <option value="">Choose a rep…</option>
                  {transferReps.filter((r) => r.id !== currentRepId).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
              <input
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Reason (optional)"
                aria-label="Transfer reason"
                className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
              />
              <button
                type="button"
                disabled={busy || !transferTo || !transferReason.trim()}
                className={button}
                onClick={() => act({ action: 'requestTransfer', assigneeRepId: transferTo, reason: transferReason })}
              >
                Request transfer
              </button>
            </div>
          )}

          {canManage && (
            <>
              <div className="flex flex-wrap items-end gap-2">
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
                <input
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Reason (optional)"
                  aria-label="Reassignment reason"
                  className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                />
                <button
                  type="button"
                  disabled={busy || assignee === task.assigneeRepId}
                  className={button}
                  onClick={() => act({ action: 'reassign', assigneeRepId: assignee, reason: reassignReason })}
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
      ) : rawId && canManageTask ? (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-[12px] text-graphite">
            This task is {task.status === 'DONE' ? 'completed' : 'cancelled'}.
          </p>
          <button type="button" disabled={busy} className={button} onClick={() => act({ action: 'reopen' })}>
            Reopen
          </button>
        </div>
      ) : null}

      {error && (
        <p role="alert" className="text-[12px] text-status-danger">
          {error}
        </p>
      )}

      {rawId && <NotesPanel subjectType="TASK" subjectId={rawId} title="Conversation" />}

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
