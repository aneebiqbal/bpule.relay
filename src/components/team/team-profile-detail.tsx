'use client'

/**
 * Profile detail — the operating center for ONE person.
 *
 * Tabs: Overview · Channels · Knowledge · Execution · History. Every channel is
 * operationally separate (identity, primary, backups, readiness, targets, today,
 * coverage); knowledge is shared across all of them.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn } from 'cn'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { V4Chip, V4Panel, V4PanelHeader } from '@/components/v4/primitives'
import { CoverageConfigPanel } from '@/components/coverage/coverage-config-panel'
import { CoverageActions, type CoveragePending } from '@/components/coverage/coverage-actions'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { RequestUpdateButton } from '@/components/operations/request-update-button'
import { activityLabel, defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { ResponsibilityStatus } from '@/components/ui/responsibility-status'
import { channelLabel, normalizeChannel } from '@/lib/profiles/channel'
import type { ActivityType } from '@/lib/domain/types'
import type { ProfileOperatingModel, ProfileChannelModel } from '@/lib/profiles/operating-model'

type Tab = 'overview' | 'channels' | 'knowledge' | 'execution' | 'history'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'channels', label: 'Channels' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'execution', label: 'Execution' },
  { id: 'history', label: 'History' },
]

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  completed: 'success',
  on_track: 'info',
  at_risk: 'warning',
  missed: 'danger',
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  return status.replaceAll('_', ' ')
}

function pct(done: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0
}

export function TeamProfileDetailView({
  model,
  canManage,
  reps,
  coveragePending = {},
  activeCoverage = [],
}: {
  model: ProfileOperatingModel
  canManage: boolean
  reps: Array<{ id: string; name: string }>
  /** Coverage decisions the plan derived for this person's channels. */
  coveragePending?: Record<string, CoveragePending>
  /** Channels with active temporary cover. */
  activeCoverage?: string[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [addChannelOpen, setAddChannelOpen] = useState(false)

  const totalTarget = model.channels.reduce((sum, channel) => sum + channel.today.target, 0)
  const totalDone = model.channels.reduce((sum, channel) => sum + channel.today.completed, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Team / Profiles</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">{model.personName}</h1>
          {model.headline && <p className="mt-1 text-[13px] text-graphite">{model.headline}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {model.channels.map((channel) => (
              <ChannelBadge key={channel.identityId} channel={channel.channel} />
            ))}
            <span className="text-[12px] text-stone">{model.businessDate}</span>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <AssignTaskButton reps={reps} defaultProfileId={model.personId} />
            <RequestUpdateButton reps={reps} label="Request readiness" title="Confirm access" />
            <button
              type="button"
              onClick={() => setAddChannelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              <Plus className="size-3.5" aria-hidden />
              Add channel
            </button>
          </div>
        )}
      </div>

      <div className="-mx-1 overflow-x-auto">
        <nav aria-label="Profile sections" className="flex min-w-max gap-0.5 rounded-lg border border-line bg-bone-raised p-0.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-[13px] transition-colors',
                tab === item.id ? 'bg-bone font-medium text-ink shadow-sm' : 'text-graphite hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <OverviewTab model={model} totalDone={totalDone} totalTarget={totalTarget} />
      )}
      {tab === 'channels' && (
        <ChannelsTab
          model={model}
          canManage={canManage}
          reps={reps}
          coveragePending={coveragePending}
          activeCoverage={activeCoverage}
        />
      )}
      {tab === 'knowledge' && <KnowledgeTab model={model} />}
      {tab === 'execution' && <ExecutionTab model={model} />}
      {tab === 'history' && <HistoryTab model={model} />}

      <AddChannelDialog
        open={addChannelOpen}
        onClose={() => setAddChannelOpen(false)}
        model={model}
        onSaved={() => {
          setAddChannelOpen(false)
          router.refresh()
        }}
      />
    </div>
  )
}

function OverviewTab({
  model,
  totalDone,
  totalTarget,
}: {
  model: ProfileOperatingModel
  totalDone: number
  totalTarget: number
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <V4Panel>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Channels</p>
          <p className="mt-2 text-[14px] font-medium text-ink">
            {model.channels.length === 0
              ? <span className="text-status-warning">No channels</span>
              : <span className="flex flex-wrap gap-1">{model.channels.map((channel) => <ChannelBadge key={channel.identityId} channel={channel.channel} />)}</span>}
          </p>
        </V4Panel>
        <V4Panel>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Today</p>
          <p className="mt-2 text-[14px] font-medium text-ink">
            {totalDone} / {totalTarget}
            <span className="ml-1.5 text-[12px] text-stone">{pct(totalDone, totalTarget)}%</span>
          </p>
        </V4Panel>
        <V4Panel>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Needs attention</p>
          <p className="mt-2 text-[14px] font-medium text-ink">
            {model.readinessExceptions.length + model.coverageExceptions.length + model.tasks.length === 0
              ? 'Nothing outstanding'
              : `${model.readinessExceptions.length} readiness · ${model.coverageExceptions.length} coverage · ${model.tasks.length} open task${model.tasks.length === 1 ? '' : 's'}`}
          </p>
        </V4Panel>
      </div>

      <V4Panel>
        <V4PanelHeader eyebrow="Channels" title="Who operates each channel" />
        {model.channels.length === 0 ? (
          <p className="mt-3 text-[12px] text-stone">No channel identities yet. Add a channel to start executing.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {model.channels.map((channel) => (
              <li key={channel.identityId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <ChannelBadge channel={channel.channel} />
                <span className="min-w-0 flex-1 text-ink">
                  {channel.primaryRepName ?? <ResponsibilityStatus status="UNASSIGNED" />}
                </span>
                <span className="text-graphite">
                  {channel.backups.length > 0
                    ? `backups: ${channel.backups.map((backup) => backup.repName).join(', ')}`
                    : 'no backups'}
                </span>
                {channel.activeCoverage.length > 0 && (
                  <V4Chip tone="info">
                    covered by {channel.activeCoverage.map((row) => row.coveringRepName).join(', ')}
                  </V4Chip>
                )}
              </li>
            ))}
          </ul>
        )}
      </V4Panel>

      {(model.readinessExceptions.length > 0 || model.coverageExceptions.length > 0) && (
        <V4Panel>
          <V4PanelHeader eyebrow="Exceptions" title="Needs your attention" />
          <ul className="mt-3 space-y-2 text-[13px]">
            {model.coverageExceptions.map((row) => (
              <li key={row.identityId} className="flex items-center justify-between gap-3">
                <ChannelBadge channel={row.channel} />
                <span className="text-status-warning">{row.reason}</span>
              </li>
            ))}
            {model.readinessExceptions.map((row) => (
              <li key={`${row.repId}:${row.repName}`} className="flex items-center justify-between gap-3">
                <span className="text-ink">{row.repName}</span>
                <ResponsibilityStatus status="ACCESS_NEEDED" />
              </li>
            ))}
          </ul>
        </V4Panel>
      )}

      {model.tasks.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Work" title="Open assigned tasks" />
          <ul className="mt-3 divide-y divide-line/70">
            {model.tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks?task=assigned:${task.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-[13px] hover:underline"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{task.title}</span>
                  {task.channel && <ChannelBadge channel={task.channel} />}
                  <span className={cn('text-[11px]', task.status === 'WAITING' ? 'text-status-warning' : 'text-graphite')}>
                    {task.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </V4Panel>
      )}
    </div>
  )
}

function ChannelsTab({
  model,
  canManage,
  reps,
  coveragePending,
  activeCoverage,
}: {
  model: ProfileOperatingModel
  canManage: boolean
  reps: Array<{ id: string; name: string }>
  coveragePending: Record<string, CoveragePending>
  activeCoverage: string[]
}) {
  if (model.channels.length === 0) {
    return (
      <V4Panel>
        <V4PanelHeader eyebrow="Channels" title="No channels yet" />
        <p className="mt-3 text-[12px] text-stone">
          A channel is a sending identity under {model.personName}. Add LinkedIn, Upwork or Email to begin.
        </p>
      </V4Panel>
    )
  }

  return (
    <div className="space-y-4">
      {model.channels.map((channel) => (
        <ChannelBlock
          key={channel.identityId}
          channel={channel}
          canManage={canManage}
          reps={reps}
          pending={coveragePending[channel.profileId] ?? null}
          active={activeCoverage.includes(channel.profileId)}
        />
      ))}
    </div>
  )
}

function ChannelBlock({
  channel,
  canManage,
  reps,
  pending,
  active,
}: {
  channel: ProfileChannelModel
  canManage: boolean
  reps: Array<{ id: string; name: string }>
  pending: CoveragePending | null
  active: boolean
}) {
  const continueHref = `/workspace/${channel.identityId}`
  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Channel"
        title={<ChannelBadge channel={channel.channel} />}
        hint={channel.identityName}
        action={
          <Link
            href={continueHref}
            className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
          >
            Continue
          </Link>
        }
      />

      <dl className="mt-4 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <div className="contents">
          <dt className="text-stone">Identity</dt>
          <dd className="min-w-0 text-ink">
            {channel.identityName}
            {channel.url && (
              <a href={channel.url} target="_blank" rel="noreferrer" className="ml-2 text-cobalt hover:underline">
                link
              </a>
            )}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-stone">Primary</dt>
          <dd className="text-ink">{channel.primaryRepName ?? <span className="text-status-warning">Unassigned</span>}</dd>
        </div>
        <div className="contents">
          <dt className="text-stone">Backups</dt>
          <dd className="text-ink">
            {channel.backups.length > 0
              ? channel.backups.map((backup) => backup.repName).join(', ')
              : <span className="text-stone">None</span>}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-stone">Access</dt>
          <dd className="text-ink">
            {channel.readiness.length === 0 ? (
              <span className="text-stone">No operators</span>
            ) : channel.readiness.every((row) => row.ready) ? (
              <span className="text-status-success">Confirmed</span>
            ) : (
              <span className="text-status-warning">
                {channel.readiness.filter((row) => row.ready).length} of {channel.readiness.length} confirmed
                {channel.readiness.some((row) => !row.ready)
                  ? ` · ${channel.readiness.filter((row) => !row.ready).map((row) => row.repName).join(', ')} to confirm`
                  : ''}
              </span>
            )}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-stone">Today</dt>
          <dd className="tabular-nums text-ink">
            {channel.today.completed} / {channel.today.target}
            {channel.today.target > 0 && <span className="ml-1.5 text-stone">{pct(channel.today.completed, channel.today.target)}%</span>}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-stone">Coverage</dt>
          <dd className="text-ink">
            {channel.activeCoverage.length > 0
              ? `Covered by ${channel.activeCoverage.map((row) => row.coveringRepName).join(', ')}`
              : 'None'}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-[0.12em] text-stone">Targets</p>
        {channel.targets.length > 0 ? (
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {channel.targets.map((target) => (
              <div key={target.activityType} className="rounded-lg bg-bone px-3 py-2 ring-1 ring-line/70">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-stone">
                  {target.activityType.replace(/_/g, ' ')}
                </dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {target.completedCount} / {target.targetCount}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-[12px] text-stone">No targets configured for this channel.</p>
        )}
        {canManage && (
          <ChannelTargetsEditor channel={channel} repId={channel.primaryRepId} />
        )}
      </div>

      {canManage && (
        <div className="mt-4 border-t border-line/70 pt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
            Assignment
          </p>
          <CoverageConfigPanel
            profileId={channel.profileId}
            primaryRepId={channel.primaryRepId}
            backups={channel.backups}
            reps={reps}
            assignedRepIds={channel.backups.map((backup) => backup.repId)}
            canManage={canManage}
          />
        </div>
      )}

      {canManage && <CoverageActions profileId={channel.profileId} pending={pending} active={active} />}
    </V4Panel>
  )
}

/**
 * Channel targets — the only place a daily expectation is edited. The pack is
 * channel-specific (LinkedIn ≠ Upwork ≠ Email), and every target is keyed by
 * the channel identity, never the person.
 */
function ChannelTargetsEditor({
  channel,
  repId,
}: {
  channel: ProfileChannelModel
  repId: string | null
}) {
  const router = useRouter()
  const existing = new Map(channel.targets.map((target) => [target.activityType, target]))
  const pack = defaultTargetsForChannel(normalizeChannel(channel.channel))
  const rows = [
    ...pack.map((row) => ({
      activityType: row.activityType,
      targetId: existing.get(row.activityType)?.targetId ?? null,
      count: existing.get(row.activityType)?.targetCount ?? row.targetCount,
    })),
    ...channel.targets
      .filter((target) => !pack.some((row) => row.activityType === target.activityType))
      .map((target) => ({ activityType: target.activityType, targetId: target.targetId, count: target.targetCount })),
  ]

  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((row) => [row.activityType, row.count])),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function update(activityType: string, value: string) {
    const parsed = Number(value)
    setCounts((current) => ({
      ...current,
      [activityType]: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0,
    }))
  }

  async function save() {
    if (!repId) {
      setError('Assign a primary rep before setting targets.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      for (const row of rows) {
        const targetCount = counts[row.activityType] ?? row.count
        if (targetCount <= 0) continue
        const res = row.targetId
          ? await fetch(`/api/admin/targets/${row.targetId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetCount }),
            })
          : await fetch('/api/admin/targets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repId,
                revenueIdentityId: channel.identityId,
                activityType: row.activityType,
                targetCount,
              }),
            })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `Could not save ${activityLabel(row.activityType as ActivityType)}.`)
      }
      setMessage('Targets saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save targets.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-bone px-3 py-2.5 ring-1 ring-line/70">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Edit targets</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((row) => (
          <label key={row.activityType} className="block">
            <span className="text-[10px] uppercase tracking-[0.12em] text-stone">
              {activityLabel(row.activityType as ActivityType)}
            </span>
            <input
              type="number"
              min={0}
              value={counts[row.activityType] ?? row.count}
              onChange={(event) => update(row.activityType, event.target.value)}
              className="mt-0.5 h-8 w-full rounded-md border border-line bg-bone-raised px-2 text-[13px] tabular-nums text-ink"
            />
          </label>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-[11px] text-stone">Daily expectation for this channel.</p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save targets'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-status-danger">{error}</p>
      )}
      {message && (
        <p className="mt-2 text-[12px] text-status-success">{message}</p>
      )}
    </div>
  )
}

function KnowledgeTab({ model }: { model: ProfileOperatingModel }) {
  const knowledge = model.knowledge
  return (
    <div className="space-y-4">
      <V4Panel>
        <V4PanelHeader
          eyebrow="Knowledge"
          title="Shared across every channel"
          hint={knowledge.sources.length > 0 ? `${knowledge.sources.length} source file${knowledge.sources.length === 1 ? '' : 's'}` : 'No source uploaded'}
        />
        {knowledge.summary && <p className="mt-3 text-[13px] text-graphite">{knowledge.summary}</p>}
        {knowledge.currentRole && <p className="mt-1 text-[12px] text-stone">{knowledge.currentRole}</p>}
        {knowledge.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {knowledge.skills.map((skill) => (
              <span key={skill} className="rounded-full bg-bone px-2 py-0.5 text-[11px] text-graphite ring-1 ring-line">
                {skill}
              </span>
            ))}
          </div>
        )}
        {knowledge.sources.length > 0 && (
          <ul className="mt-3 space-y-1 text-[12px] text-stone">
            {knowledge.sources.map((source, index) => (
              <li key={`${source.filename ?? 'source'}-${index}`}>
                {source.filename ?? 'Source'} · {source.uploadedAt ? new Date(source.uploadedAt).toLocaleDateString() : 'unknown date'}
              </li>
            ))}
          </ul>
        )}
      </V4Panel>

      {knowledge.experience.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Knowledge" title="Experience" />
          <ul className="mt-3 space-y-2">
            {knowledge.experience.map((row, index) => (
              <li key={`${row.role}-${row.company}-${index}`} className="text-[13px]">
                <p className="font-medium text-ink">{row.role ?? 'Role'}</p>
                <p className="text-graphite">
                  {row.company ?? '—'}
                  {row.startDate && <span className="text-stone"> · {row.startDate}{row.current ? ' – present' : row.endDate ? ` – ${row.endDate}` : ''}</span>}
                </p>
              </li>
            ))}
          </ul>
        </V4Panel>
      )}

      {knowledge.projects.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Knowledge" title="Projects" />
          <ul className="mt-3 space-y-3">
            {knowledge.projects.map((project, index) => (
              <li key={`${project.title ?? 'project'}-${index}`}>
                <p className="text-[13px] font-medium text-ink">{project.title ?? 'Project'}</p>
                {project.role && <p className="text-[12px] text-graphite">{project.role}</p>}
                {project.description && <p className="mt-0.5 text-[12px] text-graphite">{project.description}</p>}
                {(project.skills.length > 0 || project.technologies.length > 0) && (
                  <p className="mt-1 text-[11px] text-stone">
                    {[...project.skills, ...project.technologies].join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </V4Panel>
      )}

      {knowledge.proof.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Knowledge" title="Proof" />
          <ul className="mt-3 space-y-2 text-[13px]">
            {knowledge.proof.map((row, index) => (
              <li key={`${row.capability ?? 'proof'}-${index}`}>
                <p className="font-medium text-ink">{row.capability ?? 'Capability'}</p>
                {row.claim && <p className="text-graphite">{row.claim}</p>}
                {row.reference && <p className="text-[11px] text-stone">{row.reference}</p>}
              </li>
            ))}
          </ul>
        </V4Panel>
      )}

      {knowledge.reviews.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Knowledge" title="Reviews" />
          <ul className="mt-3 space-y-2 text-[13px]">
            {knowledge.reviews.map((row, index) => (
              <li key={`${row.reviewer ?? 'review'}-${index}`}>
                <p className="text-graphite">{row.text}</p>
                <p className="text-[11px] text-stone">{[row.reviewer, row.company].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </V4Panel>
      )}

      {knowledge.claims.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Knowledge" title="Verified claims" />
          <dl className="mt-3 space-y-1.5 text-[13px]">
            {knowledge.claims.map((claim) => (
              <div key={claim.key} className="contents">
                <dt className="text-stone">{claim.key}</dt>
                <dd className="text-ink">{claim.value}</dd>
              </div>
            ))}
          </dl>
        </V4Panel>
      )}
    </div>
  )
}

function ExecutionTab({ model }: { model: ProfileOperatingModel }) {
  if (model.channels.length === 0) {
    return (
      <V4Panel>
        <V4PanelHeader eyebrow="Execution" title="No channels yet" />
        <p className="mt-3 text-[12px] text-stone">Execution is per channel. Add a channel to see today&apos;s work.</p>
      </V4Panel>
    )
  }

  return (
    <div className="space-y-4">
      {model.channels.map((channel) => (
        <V4Panel key={channel.identityId}>
          <V4PanelHeader
            eyebrow="Execution"
            title={<ChannelBadge channel={channel.channel} />}
            hint={`${channel.today.completed} / ${channel.today.target} complete`}
          />
          {channel.targets.length > 0 ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {channel.targets.map((target) => (
                <div key={target.activityType} className="rounded-lg bg-bone px-3 py-2 ring-1 ring-line/70">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-stone">
                    {activityLabel(target.activityType as ActivityType)}
                  </dt>
                  <dd className="mt-0.5 tabular-nums text-ink">
                    {target.completedCount} / {target.targetCount}
                  </dd>
                  <dd className="text-[11px] text-stone">{target.remaining} remaining</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-[12px] text-stone">No targets configured for this channel.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/workspace/${channel.identityId}`}
              className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              Open {channelLabel(channel.channel)} workspace
            </Link>
          </div>
        </V4Panel>
      ))}
    </div>
  )
}

function HistoryTab({ model }: { model: ProfileOperatingModel }) {
  return (
    <V4Panel>
      <V4PanelHeader eyebrow="History" title="Operational timeline" hint={`${model.history.length} events`} />
      {model.history.length === 0 ? (
        <p className="mt-3 text-[12px] text-stone">No operational history recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-[13px]">
          {model.history.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex items-baseline justify-between gap-3">
              <span className="text-ink">{entry.detail}</span>
              <time className="shrink-0 text-[12px] text-stone">
                {new Date(entry.at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </V4Panel>
  )
}

function AddChannelDialog({
  open,
  onClose,
  model,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  model: ProfileOperatingModel
  onSaved: () => void
}) {
  const [channel, setChannel] = useState<'linkedin' | 'upwork' | 'email'>('linkedin')
  const [identityName, setIdentityName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A person has one channel per network. Existing channels are not offered, so
  // "Add channel" can never create a duplicate network.
  const existing = new Set(model.channels.map((row) => row.channel))
  const available = (['linkedin', 'upwork', 'email'] as const).filter((row) => !existing.has(row))
  const selected = existing.has(channel) ? (available[0] ?? 'linkedin') : channel

  async function save() {
    if (!identityName.trim()) {
      setError('Identity name is required')
      return
    }
    if (existing.has(selected)) {
      setError(`This person already has a ${selected} channel.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const slug = `${identityName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${selected}`
      const res = await fetch('/api/admin/revenue-identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityName: identityName.trim(),
          slug,
          channel: selected,
          profileUrl: url.trim() || null,
          // The channel is created under the person's canonical profile — it can
          // never create a new person.
          profileId: model.personId,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not add the channel')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the channel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Add a channel to ${model.personName}`}
      description="The channel reuses this person's knowledge. Adding a channel never creates another person."
      className="max-w-md"
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Channel</span>
          <select
            value={selected}
            onChange={(event) => setChannel(event.target.value as 'linkedin' | 'upwork' | 'email')}
            className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
          >
            {available.length === 0 ? (
              <option value="linkedin" disabled>Every channel already exists</option>
            ) : (
              available.map((row) => (
                <option key={row} value={row} className="capitalize">{row}</option>
              ))
            )}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Identity name</span>
          <input
            value={identityName}
            onChange={(event) => setIdentityName(event.target.value)}
            placeholder={model.personName}
            className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Profile URL (optional)</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
          />
        </label>
        {error && (
          <p role="alert" className="text-[12px] text-status-danger">{error}</p>
        )}
      </div>
      <DialogActions className="mt-5">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? 'Adding…' : 'Add channel'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
