'use client'

import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Archive,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Inbox,
  ListFilter,
  Plus,
  SearchX,
  X,
} from 'lucide-react'
import { cn } from 'cn'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { DataTable, type Column, type SortState } from '@/components/ui/data-table'
import { Tabs } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { LeadScoreRing } from '@/components/score-ring'
import { Input } from '@/components/ui/input'
import { formatRoleLine } from '@/lib/leads/role-line'
import { formatRelativeTime } from '@/lib/ui/time'
import {
  LEADS_VIEWS,
  LEAD_PRIORITY_LABELS,
  STAGE_LABELS,
  derivePipelineStage,
  isLeadsViewId,
  leadDue,
  leadIntentLevel,
  leadNextAction,
  leadPriority,
  type LeadIntent,
  type LeadPriority,
  type LeadRow,
  type LeadsQuery,
  type PipelineStage,
} from '@/components/leads/pipeline-utils'

export interface LeadsTableProps {
  leads: LeadRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  orgView: boolean
  workspaceName: string | null
  currentRepId: string | null
  reps: Array<{ id: string; name: string }>
  query: LeadsQuery
  now: number
  /** Table | Pipeline representation toggle. */
  viewToggle?: React.ReactNode
  /** Route the table navigates on. Rep 360 embeds the table at /team/[repId]. */
  basePath?: string
  /** Params pinned on every navigation (e.g. owner + tab for Rep 360). */
  fixedParams?: Record<string, string>
}

const STAGE_VARIANT: Record<PipelineStage, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'orange' | 'cobalt'> = {
  to_contact: 'neutral',
  observe: 'warning',
  waiting: 'cobalt',
  follow_up_due: 'orange',
  needs_reply: 'orange',
  done: 'success',
  cold: 'warning',
}

const PRIORITY_VARIANT: Record<LeadPriority, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'orange' | 'cobalt'> = {
  critical: 'danger',
  high: 'orange',
  normal: 'neutral',
  watch: 'info',
}

const INTENT_VARIANT: Record<LeadIntent, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'orange' | 'cobalt'> = {
  HIGH: 'success',
  MEDIUM: 'info',
  LOW: 'neutral',
  UNKNOWN: 'neutral',
}

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return <StatusBadge status={STAGE_LABELS[stage]} variant={STAGE_VARIANT[stage]} />
}

export function PriorityBadge({ priority }: { priority: LeadPriority }) {
  return (
    <StatusBadge status={LEAD_PRIORITY_LABELS[priority]} variant={PRIORITY_VARIANT[priority]} />
  )
}

export function IntentBadge({ lead }: { lead: LeadRow }) {
  const level = leadIntentLevel(lead)
  if (!level) return <span className="text-[13px] text-stone">—</span>
  return <StatusBadge status={level} variant={INTENT_VARIANT[level]} />
}

/** Profile attribution is never hidden and never guessed (BUG-24/29/30). */
export function ProfileCell({ lead }: { lead: LeadRow }) {
  if (!lead.senderProfileName) {
    return <span className="text-[13px] font-medium text-status-warning">Not assigned</span>
  }
  return <span className="block truncate text-[13px] text-ink">{lead.senderProfileName}</span>
}

function NextActionCell({ lead }: { lead: LeadRow }) {
  const action = leadNextAction(lead)
  return (
    <Link
      href={action.href}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md bg-orange px-2.5 py-1 text-[12px] font-medium text-on-accent transition-colors hover:bg-orange-dark active:scale-[0.98]"
    >
      {action.label}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  )
}

function DueCell({ lead, now }: { lead: LeadRow; now: number }) {
  const due = leadDue(lead, now)
  if (!due) return <span className="text-[13px] text-stone">—</span>
  return (
    <span className={cn('text-[13px]', due.overdue ? 'font-medium text-status-danger' : 'text-graphite')}>
      {due.label}
    </span>
  )
}

function LeadRowMenu({
  lead,
  orgView,
  onAssignTask,
  onArchive,
  onOutcome,
}: {
  lead: LeadRow
  orgView: boolean
  onAssignTask: (lead: LeadRow) => void
  onArchive: (lead: LeadRow) => void
  onOutcome: (lead: LeadRow, outcome: 'won' | 'lost') => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-bone-raised'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Actions for ${lead.contactName ?? lead.company}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className="rounded-md p-1.5 text-stone transition-colors hover:bg-bone-raised hover:text-ink"
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-bone py-1 shadow-lg"
        >
          <Link href={`/leads/${lead.id}`} role="menuitem" className={item} onClick={(event) => event.stopPropagation()}>
            Open
          </Link>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              onAssignTask(lead)
            }}
          >
            Assign task
          </button>
          {orgView ? (
            <Link href={`/leads/${lead.id}?tab=owner`} role="menuitem" className={item} onClick={(event) => event.stopPropagation()}>
              Change owner
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              onArchive(lead)
            }}
          >
            Archive
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              onOutcome(lead, 'won')
            }}
          >
            Mark won
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              onOutcome(lead, 'lost')
            }}
          >
            Mark lost
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AssignTaskDialog({
  leads,
  currentRepId,
  onClose,
}: {
  leads: LeadRow[]
  currentRepId: string | null
  onClose: () => void
}) {
  const [title, setTitle] = useState(() =>
    leads.length === 1 ? `Follow up: ${leads[0].contactName ?? leads[0].company}` : '',
  )
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (saving || !title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'CUSTOM',
          title: title.trim(),
          priority,
          leadId: leads.length === 1 ? leads[0].id : undefined,
          profileId: leads.length === 1 ? leads[0].revenueIdentityId ?? undefined : undefined,
          assigneeRepId: currentRepId ?? leads[0]?.ownerRepId ?? undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not create the task.')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assign task"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-3 rounded-xl border border-line bg-bone p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink">Assign task</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-stone transition-colors hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-[12px] text-graphite">
          {leads.length === 1
            ? `${leads[0].contactName ?? 'This lead'} · ${leads[0].company}`
            : `${leads.length} leads selected`}
        </p>
        <Input
          aria-label="Task title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs to happen?"
        />
        <label className="block text-[12px] text-graphite">
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as typeof priority)}
            className="mt-1 w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </label>
        {error ? (
          <p role="alert" className="text-[12px] text-status-danger">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="orange" loading={saving} onClick={() => void submit()}>
            <Check className="size-4" aria-hidden="true" />
            Create task
          </Button>
        </div>
      </div>
    </div>
  )
}

export function LeadsTable({
  leads,
  total,
  page,
  pageSize,
  pageCount,
  orgView,
  workspaceName,
  currentRepId,
  reps,
  query,
  now,
  viewToggle,
  basePath = '/leads',
  fixedParams,
}: LeadsTableProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [taskLeads, setTaskLeads] = useState<LeadRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const view = isLeadsViewId(query.view) ? query.view : 'all'

  const push = useCallback(
    (params: URLSearchParams) => {
      for (const [key, value] of Object.entries(fixedParams ?? {})) params.set(key, value)
      const qs = params.toString()
      router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false })
    },
    [router, basePath, fixedParams],
  )

  /** Any filter change drops the saved view — the view is a preset, not a stored filter. */
  const navigate = useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue
        if (key === 'page' || key === 'pageSize' || key === 'view') continue
        if (key in patch) continue
        params.set(key, String(value))
      }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) params.delete(key)
        else params.set(key, value)
      }
      push(params)
    },
    [query, push],
  )

  const selectView = useCallback(
    (id: string) => {
      const params = new URLSearchParams()
      if (id !== 'all') params.set('view', id)
      push(params)
    },
    [push],
  )

  const onSortChange = useCallback(
    (sort: SortState | null) => {
      navigate({ sort: sort?.key, dir: sort ? sort.dir : undefined })
    },
    [navigate],
  )

  const goToPage = useCallback(
    (next: number) => {
      navigate({ page: String(next) })
    },
    [navigate],
  )

  const runAction = useCallback(async (leadId: string, path: string, body: Record<string, unknown>) => {
    setError(null)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'That action could not be completed.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That action could not be completed.')
    }
  }, [router])

  const columns = useMemo<Column<LeadRow>[]>(() => {
    const base: Column<LeadRow>[] = [
      {
        key: 'lead',
        header: 'Lead',
        sortKey: 'name',
        render: (lead) => (
          <div className="min-w-0">
            <Link
              href={`/leads/${lead.id}`}
              onClick={(event) => event.stopPropagation()}
              className="block truncate text-[13px] font-medium text-ink transition-colors hover:text-orange"
            >
              {lead.contactName ?? 'Unnamed prospect'}
            </Link>
            {lead.contactTitle ? (
              <p className="truncate text-[11px] text-graphite">
                {formatRoleLine(lead.contactTitle, null)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'company',
        header: 'Company',
        sortKey: 'company',
        hideBelow: 'lg',
        render: (lead) => (
          <span className="block truncate text-[13px] text-graphite">{lead.company}</span>
        ),
      },
      {
        key: 'profile',
        header: 'Profile',
        hideBelow: 'xl',
        render: (lead) => <ProfileCell lead={lead} />,
      },
      {
        key: 'stage',
        header: 'Stage',
        render: (lead) => <StageBadge stage={derivePipelineStage(lead)} />,
      },
      {
        key: 'priority',
        header: 'Priority',
        hideBelow: 'lg',
        render: (lead) => <PriorityBadge priority={leadPriority(lead)} />,
      },
      {
        key: 'score',
        header: 'Score',
        sortKey: 'score',
        align: 'right',
        hideBelow: 'sm',
        render: (lead) => <LeadScoreRing lead={lead} size={32} />,
      },
      {
        key: 'intent',
        header: 'Intent',
        hideBelow: 'xl',
        render: (lead) => <IntentBadge lead={lead} />,
      },
      {
        key: 'activity',
        header: 'Last activity',
        sortKey: 'activity',
        hideBelow: 'md',
        render: (lead) => (
          <span className="text-[13px] text-graphite">
            {lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt, now) : '—'}
          </span>
        ),
      },
      {
        key: 'next',
        header: 'Next action',
        render: (lead) => (
          <div className="min-w-0">
            <NextActionCell lead={lead} />
            {(lead.openAssignedTaskCount ?? 0) > 0 ? (
              <p className="mt-0.5 text-[11px] text-graphite">
                {lead.openAssignedTaskCount} open task{lead.openAssignedTaskCount === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'due',
        header: 'Due',
        hideBelow: 'lg',
        render: (lead) => <DueCell lead={lead} now={now} />,
      },
      {
        key: 'actions',
        header: '',
        hideBelow: 'sm',
        className: 'w-10',
        render: (lead) => (
          <LeadRowMenu
            lead={lead}
            orgView={orgView}
            onAssignTask={(row) => setTaskLeads([row])}
            onArchive={(row) => void runAction(row.id, `/api/leads/${row.id}/archive`, { action: 'archive' })}
            onOutcome={(row, outcome) => void runAction(row.id, `/api/leads/${row.id}/outcome`, { outcome })}
          />
        ),
      },
    ]

    if (orgView) {
      base.splice(10, 0, {
        key: 'owner',
        header: 'Owner',
        hideBelow: 'xl',
        render: (lead) => (
          <span className="block truncate text-[13px] text-graphite">{lead.ownerName ?? 'Unassigned'}</span>
        ),
      })
    }

    return base
  }, [now, orgView, runAction])

  const renderCard = useCallback(
    (lead: LeadRow) => (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">
              {lead.contactName ?? 'Unnamed prospect'}
            </p>
            <p className="truncate text-[11px] text-graphite">{lead.company}</p>
          </div>
          <LeadScoreRing lead={lead} size={32} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StageBadge stage={derivePipelineStage(lead)} />
          <PriorityBadge priority={leadPriority(lead)} />
          <IntentBadge lead={lead} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <NextActionCell lead={lead} />
          <LeadRowMenu
            lead={lead}
            orgView={orgView}
            onAssignTask={(row) => setTaskLeads([row])}
            onArchive={(row) => void runAction(row.id, `/api/leads/${row.id}/archive`, { action: 'archive' })}
            onOutcome={(row, outcome) => void runAction(row.id, `/api/leads/${row.id}/outcome`, { outcome })}
          />
        </div>
      </div>
    ),
    [orgView, runAction],
  )

  const hasFilters = Boolean(query.q || query.stage || query.priority || query.owner || query.source || query.status)

  const empty = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title="No leads match this view."
      description="You have leads in other views. Clear a filter or switch the saved view above."
    />
  ) : (
    <EmptyState
      icon={Inbox}
      title={workspaceName ? `No leads captured under ${workspaceName}.` : 'No leads yet.'}
      description={
        workspaceName
          ? `Nothing was captured while ${workspaceName} was selected. Switch workspace to see your other identities, or check a new prospect.`
          : 'Paste a LinkedIn profile, add a company, or import from Upwork. Relay scores them and tells you who is worth contacting.'
      }
      action={
        <Link
          href="/prospect"
          className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
        >
          <Plus className="size-4" aria-hidden="true" />
          Check a prospect
        </Link>
      }
    />
  )

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[12px] text-graphite">
          {total} {total === 1 ? 'lead' : 'leads'}
          {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ''}
        </p>
        <label className="flex items-center gap-1.5 text-[12px] text-graphite">
          Per page
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => navigate({ pageSize: event.target.value })}
            className="rounded-md border border-line bg-bone px-1.5 py-1 text-[12px] text-ink"
          >
            {[25, 50, 100, 200].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goToPage(page + 1)}
        >
          Next
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        description={
          orgView
            ? `Every active opportunity in the organisation — ${total} shown. Archived leads are not counted.`
            : workspaceName
              ? `Every active opportunity for ${workspaceName} — ${total} shown. Switch workspace to change the set.`
              : `Every active opportunity for the selected profile — ${total} shown.`
        }
        action={
          <Link
            href="/leads/new"
            className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark active:scale-[0.98]"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add lead
          </Link>
        }
        filters={
          <FilterBar
            searchValue={query.q ?? ''}
            onSearchChange={(value) => navigate({ q: value })}
            searchPlaceholder="Search name, company or title…"
          >
            <div className="flex items-center gap-2">
              <ListFilter className="size-3.5 text-stone" aria-hidden="true" />
              <select
                aria-label="Stage"
                value={query.stage ?? 'all'}
                onChange={(event) => navigate({ stage: event.target.value })}
                className="rounded-lg border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
              >
                <option value="all">All stages</option>
                <option value="to_contact">Qualified</option>
                <option value="waiting">Connection sent</option>
                <option value="needs_reply">Conversation</option>
                <option value="follow_up_due">Follow-up due</option>
                <option value="observe">Watch</option>
                <option value="cold">Cold</option>
                <option value="done">Won</option>
              </select>
              <select
                aria-label="Priority"
                value={query.priority ?? 'all'}
                onChange={(event) => navigate({ priority: event.target.value })}
                className="rounded-lg border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
              >
                <option value="all">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="watch">Watch</option>
              </select>
              {orgView ? (
                <select
                  aria-label="Profile"
                  value={query.profile ?? 'all'}
                  onChange={(event) => navigate({ profile: event.target.value })}
                  className="rounded-lg border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
                >
                  <option value="all">All profiles</option>
                  <option value="unassigned">No profile</option>
                </select>
              ) : null}
              {orgView ? (
                <select
                  aria-label="Owner"
                  value={query.owner ?? 'all'}
                  onChange={(event) => navigate({ owner: event.target.value })}
                  className="rounded-lg border border-line bg-bone px-2 py-1.5 text-[12px] text-ink"
                >
                  <option value="all">All owners</option>
                  <option value="unassigned">Unassigned</option>
                  {reps.map((rep) => (
                    <option key={rep.id} value={rep.id}>{rep.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </FilterBar>
        }
        savedView={
          <div className="flex flex-wrap items-center gap-3">
            {viewToggle}
            <Tabs
              items={LEADS_VIEWS.map((item) => ({ value: item.id, label: item.label, hint: item.hint }))}
              value={view}
              onChange={selectView}
            />
          </div>
        }
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
          {error}
        </p>
      ) : null}

      <DataTable
        caption="Leads"
        columns={columns}
        rows={leads}
        rowKey={(lead) => lead.id}
        sort={query.sort ? { key: query.sort, dir: query.dir === 'asc' ? 'asc' : 'desc' } : null}
        onSortChange={onSortChange}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        bulkActions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTaskLeads(leads.filter((lead) => selected.has(lead.id)))}>
              Create task
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const ids = leads.filter((lead) => selected.has(lead.id)).map((lead) => lead.id)
                void Promise.all(ids.map((id) => fetch(`/api/leads/${id}/archive`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'archive' }),
                }))).then(() => router.refresh())
              }}
            >
              <Archive className="size-3.5" aria-hidden="true" />
              Archive
            </Button>
          </>
        }
        empty={empty}
        renderCard={renderCard}
        onRowClick={(lead) => router.push(`/leads/${lead.id}`)}
        footer={footer}
      />

      {taskLeads ? (
        <AssignTaskDialog leads={taskLeads} currentRepId={currentRepId} onClose={() => setTaskLeads(null)} />
      ) : null}
    </div>
  )
}
