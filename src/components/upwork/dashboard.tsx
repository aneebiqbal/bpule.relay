'use client'

/**
 * Upwork operating dashboard. Canonical facts only: applications from
 * upwork_applications, follow-ups and replies derived from real rows.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, Inbox } from 'lucide-react'
import { cn } from 'cn'
import { V4Panel, V4PanelHeader, V4Chip, V4Empty } from '@/components/v4/primitives'
import type { UpworkJob, UpworkJobStatus } from '@/lib/domain/types'
import type { UpworkDashboardSummary } from '@/lib/upwork/dashboard'
import type { UpworkView } from '@/lib/upwork/views'

interface DashboardProps {
  summary: UpworkDashboardSummary
  views: Record<UpworkView, UpworkJob[]>
  repNameById: Record<string, string>
  profileNameById: Record<string, string>
  identityNameById: Record<string, string>
  isAdmin: boolean
  timezone: string
}

const VIEW_TABS: Array<{ key: UpworkView; label: string }> = [
  { key: 'needs_action', label: 'Needs action' },
  { key: 'saved', label: 'Saved' },
  { key: 'draft_ready', label: 'Draft ready' },
  { key: 'applied', label: 'Applied' },
  { key: 'client_replied', label: 'Client replied' },
  { key: 'interview', label: 'Interviews' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

const STATUS_CHIP: Record<UpworkJobStatus, { label: string; cls: string }> = {
  SAVED: { label: 'Saved', cls: 'bg-bone text-graphite ring-line' },
  DRAFT_READY: { label: 'Draft ready', cls: 'bg-cobalt/10 text-cobalt ring-cobalt/20' },
  APPLIED: { label: 'Applied', cls: 'bg-status-success/10 text-status-success ring-status-success/20' },
  CLIENT_REPLIED: { label: 'Client replied', cls: 'bg-orange/10 text-[#b8531f] ring-orange/20' },
  INTERVIEW: { label: 'Interview', cls: 'bg-orange/10 text-[#b8531f] ring-orange/20' },
  WON: { label: 'Won', cls: 'bg-status-success/15 text-status-success ring-status-success/20' },
  LOST: { label: 'Lost', cls: 'bg-status-danger/10 text-status-danger ring-status-danger/20' },
  ARCHIVED: { label: 'Archived', cls: 'bg-bone text-stone ring-line' },
}

function payLine(job: UpworkJob): string | null {
  if (job.hourlyRateMin && job.hourlyRateMax) {
    return job.hourlyRateMin === job.hourlyRateMax ? `$${job.hourlyRateMin}/hr` : `$${job.hourlyRateMin}–$${job.hourlyRateMax}/hr`
  }
  if (job.budgetMin && job.budgetMax) {
    return job.budgetMin === job.budgetMax ? `$${job.budgetMin.toLocaleString()} fixed` : `$${job.budgetMin.toLocaleString()}–$${job.budgetMax.toLocaleString()} fixed`
  }
  if (job.budgetMin) return `$${job.budgetMin.toLocaleString()} fixed`
  return null
}

function ageLabel(job: UpworkJob): string {
  const posted = job.postedAt ?? job.createdAt
  if (!posted) return '—'
  const days = Math.floor((Date.now() - Date.parse(posted)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function profileLabel(job: UpworkJob, profiles: Record<string, string>, identities: Record<string, string>): string {
  if (job.senderProfileId && profiles[job.senderProfileId]) return profiles[job.senderProfileId]
  if (job.revenueIdentityId && identities[job.revenueIdentityId]) return identities[job.revenueIdentityId]
  return 'No profile'
}

function nextAction(job: UpworkJob): string | null {
  // The server already filtered needs-action jobs; this is the row-level label.
  if (job.status === 'SAVED') return 'Review'
  if (job.status === 'DRAFT_READY') return 'Apply now'
  if (job.status === 'CLIENT_REPLIED') return 'Reply to client'
  if (job.status === 'INTERVIEW') return 'Prepare interview'
  return null
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-bone-raised/40 px-4 py-3 ring-1 ring-line">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone">{label}</p>
      <p className="mt-1 text-[22px] font-medium tabular-nums text-ink">{value}</p>
    </div>
  )
}

export function UpworkDashboardView({
  summary,
  views,
  repNameById,
  profileNameById,
  identityNameById,
  isAdmin,
}: DashboardProps) {
  const [view, setView] = useState<UpworkView>('needs_action')
  const jobs = view === 'all' ? views.all : views[view]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">Sales / Upwork</p>
          <h1 className="mt-1 text-[26px] font-medium tracking-tight text-ink">Upwork</h1>
          <p className="mt-1 text-[13px] text-graphite">
            {isAdmin ? 'Organization' : 'My profiles'} · This week
          </p>
        </div>
        <Link
          href="/upwork/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
        >
          <Plus className="size-4" aria-hidden />
          Extract job
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Applications sent" value={summary.applicationsSent} />
        <StatTile label="Client replies" value={summary.clientReplies} />
        <StatTile label="Interviews" value={summary.interviews} />
        <StatTile label="Connects spent" value={summary.connectsSpent} />
        <StatTile label="Follow-ups due" value={summary.followUpsDue} />
      </div>

      <V4Panel>
        <V4PanelHeader
          eyebrow="Pipeline"
          title="Jobs"
          hint={`${views.needs_action.length} need action · ${views.applied.length} applied`}
        />
        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Upwork views">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={view === tab.key}
              onClick={() => setView(tab.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                view === tab.key ? 'bg-ink text-on-solid' : 'bg-bone text-graphite ring-1 ring-line hover:text-ink',
              )}
            >
              {tab.label}
              <span className="ml-1.5 tabular-nums text-current/60">{views[tab.key]?.length ?? 0}</span>
            </button>
          ))}
        </div>

        {jobs.length === 0 ? (
          <div className="mt-4">
            <V4Empty
              title={view === 'needs_action' ? 'Nothing needs action' : 'No jobs in this view'}
              body={view === 'needs_action' ? 'You are caught up. New saved jobs and due follow-ups will appear here.' : 'Switch views or extract a new job.'}
            >
              <Link href="/upwork/new" className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid">
                <Plus className="size-3.5" aria-hidden />
                Extract a job
              </Link>
            </V4Empty>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
            {jobs.map((job) => {
              const pay = payLine(job)
              const status = STATUS_CHIP[job.status]
              const repName = job.ownerRepId ? repNameById[job.ownerRepId] ?? 'Unknown' : 'Unassigned'
              const profile = profileLabel(job, profileNameById, identityNameById)
              const action = nextAction(job)
              return (
                <li key={job.id}>
                  <Link href={`/upwork/${job.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-[13px] font-medium text-ink">{job.title}</p>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium ring-1', status.cls)}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-graphite">
                        {[job.clientName, pay, profile, repName].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-[12px] tabular-nums text-ink">
                          {job.connectsCost ? `${job.connectsCost} connects` : '—'}
                        </p>
                        <p className="text-[11px] text-stone">{ageLabel(job)}</p>
                      </div>
                      {action && (
                        <span className="hidden rounded-full bg-orange/10 px-2.5 py-1 text-[11px] font-medium text-[#b8531f] sm:inline-flex">
                          {action}
                        </span>
                      )}
                      <ChevronRight className="size-3.5 text-stone" aria-hidden />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </V4Panel>

      {views.needs_action.length === 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-status-success/5 px-4 py-3 text-[13px] text-status-success ring-1 ring-status-success/15">
          <Inbox className="size-4" aria-hidden />
          You are caught up. No follow-ups due, no drafts waiting.
        </div>
      )}
    </div>
  )
}
