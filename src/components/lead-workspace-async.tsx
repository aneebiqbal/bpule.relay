'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutList, MessagesSquare, ClipboardList, History } from 'lucide-react'
import { LeadWorkspace } from './lead-workspace-simple'
import { LeadConversation } from './conversation/lead-conversation'
import { Tabs } from './ui/tabs'
import { NotesPanel } from './operations/notes-panel'
import { LeadContextPanel } from '@/components/sales/lead-context-panel'
import { LeadStageStrip } from '@/components/sales/lead-stage-strip'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { LeadDetailSkeleton } from '@/components/sales/lead-detail-skeleton'
import { V3ActivityRow, V3Skeleton } from '@/components/v3/primitives'
import { formatRelativeTime } from '@/lib/ui/time'
import type { LeadDetail } from '@/lib/store/types'
import type { UnifiedTask } from '@/lib/tasks/types'
import type { Profile } from '@/lib/domain/types'

interface LeadData {
  lead: LeadDetail
  profiles: Profile[]
  dailyLimit: number
  todaySends: number
  ownerName: string | null
}

/** The chat view can be switched off per deployment without touching Overview. */
const CONVERSATION_UI = process.env.NEXT_PUBLIC_CONVERSATION_UI !== 'false'

type Tab = 'overview' | 'conversation' | 'tasks' | 'activity'

const TAB_ITEMS = [
  { value: 'overview', label: 'Overview', icon: LayoutList },
  { value: 'conversation', label: 'Conversation', icon: MessagesSquare },
  { value: 'tasks', label: 'Tasks', icon: ClipboardList },
  { value: 'activity', label: 'Activity', icon: History },
]

export function LeadWorkspaceAsync({
  dataPromise,
  initialTab,
  initialNext,
  now,
  reps = [],
}: {
  dataPromise: Promise<LeadData>
  initialTab: Tab
  initialNext: string | null
  now: number
  /** Empty for a plain rep — the composer then stays out of the lead surface. */
  reps?: Array<{ id: string; name: string }>
}) {
  const { lead, profiles, dailyLimit, todaySends, ownerName } = use(dataPromise)
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [tasks, setTasks] = useState<UnifiedTask[] | null>(null)
  const [tasksError, setTasksError] = useState(false)

  // Resolve the stored sender profile id to its current display name, so the
  // attribution is a name and not a raw uuid (BUG-29).
  const senderProfileName = useMemo(() => {
    if (!lead.senderProfileId) return null
    const profile = profiles.find((p) => p.id === lead.senderProfileId)
    return profile?.displayName ?? profile?.fullName ?? null
  }, [lead.senderProfileId, profiles])

  const changeTab = useCallback(
    (next: string) => {
      const value: Tab =
        next === 'conversation' || next === 'tasks' || next === 'activity' ? next : 'overview'
      setTab(value)
      const params = new URLSearchParams(window.location.search)
      if (value === 'overview') params.delete('tab')
      else params.set('tab', value)
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : '?', { scroll: false })
    },
    [router],
  )

  useEffect(() => {
    if (tab !== 'tasks' || tasks || tasksError) return
    let cancelled = false
    fetch(`/api/tasks?leadId=${lead.id}&includeCompleted=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error('failed')
        return (await res.json()) as { tasks?: UnifiedTask[] }
      })
      .then((data) => {
        if (cancelled) return
        setTasks(data.tasks ?? [])
      })
      .catch(() => {
        if (!cancelled) setTasksError(true)
      })
    return () => {
      cancelled = true
    }
  }, [tab, tasks, tasksError, lead.id])

  const activity = useMemo(
    () =>
      (lead.messages ?? [])
        .filter((m) => m.sentAt)
        .slice()
        .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))
        .slice(0, 20)
        .map((m) => ({
          id: m.id,
          label: `${m.direction === 'inbound' ? 'Reply received' : 'Message sent'} · ${m.type}`,
          time: formatRelativeTime(m.sentAt ?? '', now),
        })),
    [lead.messages, now],
  )

  // The record page suspends on a server promise and renders a large tree.
  // Server and client must agree on that first render, so the content is gated
  // on mount: the skeleton is what SSR emits, and hydration matches it exactly.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <LeadDetailSkeleton />
  }

  return (
    <div className="space-y-4">
      <LeadStageStrip lead={lead} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} />
          {tab === 'overview' ? (
            <div className="mt-4">
              <LeadWorkspace lead={lead} dailyLimit={dailyLimit} todaySends={todaySends} senderProfileName={senderProfileName} now={now} next={initialNext} />
            </div>
          ) : null}
          {tab === 'conversation' ? (
            <div className="mt-4">
              <LeadConversation leadId={lead.id} onChanged={() => router.refresh()} />
            </div>
          ) : null}
          {tab === 'tasks' ? (
            <div className="mt-4">
              {reps.length > 0 && (
                <div className="mb-3 flex justify-end">
                  <AssignTaskButton reps={reps} defaultLeadId={lead.id} defaultTitle={`Update ${lead.company ?? 'lead'}`} />
                </div>
              )}
              {tasksError ? (
                <p role="alert" className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[13px] text-graphite">
                  Couldn&apos;t load tasks. Refresh to try again.
                </p>
              ) : tasks === null ? (
                <div className="space-y-2">
                  <V3Skeleton variant="row" />
                  <V3Skeleton variant="row" />
                </div>
              ) : tasks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-graphite">
                  No tasks for this lead.
                </p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {tasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-ink">{task.title}</p>
                        <p className="text-[11px] text-stone">{task.kind} · {task.priority}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-bone px-2 py-0.5 text-[10px] font-medium text-graphite">
                        {task.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {tab === 'activity' ? (
            <div className="mt-4">
              {activity.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-graphite">
                  No activity yet.
                </p>
              ) : (
                <ul className="rounded-lg border border-line">
                  {activity.map((item) => (
                    <V3ActivityRow key={item.id} time={item.time} label={item.label} />
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {/* Internal notes sit outside the thread on purpose: never mixed with client messages. */}
          <div id="notes" className="mt-4 scroll-mt-20">
            <NotesPanel subjectType="LEAD" subjectId={lead.id} />
          </div>
        </div>

        <LeadContextPanel lead={lead} senderProfileName={senderProfileName} ownerName={ownerName} now={now} />
      </div>
    </div>
  )
}
